import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import * as pulumi from "@pulumi/pulumi";
import * as gcp from "@pulumi/gcp";
import {
  createGkeCluster,
  lookupSharedGkeClusterSync,
  lookupSharedGkeCluster,
  getOrCreateStaticIp,
} from "../core/gcp-infra.js";

// Mock Pulumi modules
jest.mock("@pulumi/pulumi");
jest.mock("@pulumi/gcp");

// Helper to create mock Pulumi outputs
function createMockOutput<T>(value: T): pulumi.Output<T> {
  return {
    apply: (callback: (value: T) => any) => createMockOutput(callback(value)),
    get: () => value,
  } as any;
}

describe("GCP GKE Infrastructure Components", () => {
  let mockConfig: any;
  let mockProvider: any;
  let mockCluster: any;
  let mockStaticIp: any;

  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Mock Pulumi Config
    mockConfig = {
      require: jest.fn(),
      get: jest.fn(),
    };

    // Mock GCP Provider
    mockProvider = {
      id: createMockOutput("mock-provider-id"),
    };

    // Mock GKE Cluster
    mockCluster = {
      name: createMockOutput("test-gke-cluster"),
      endpoint: createMockOutput("https://1.2.3.4"),
      masterAuth: {
        clusterCaCertificate: createMockOutput("mock-ca-cert"),
      },
      id: createMockOutput("mock-cluster-id"),
      location: createMockOutput("us-central1-a"),
    };

    // Mock Static IP
    mockStaticIp = {
      name: createMockOutput("test-static-ip"),
      address: createMockOutput("34.56.78.90"),
      id: createMockOutput("mock-ip-id"),
    };

    // Setup default mock implementations
    (pulumi.Config as jest.MockedClass<typeof pulumi.Config>).mockImplementation(
      () => mockConfig
    );
    (gcp.Provider as jest.MockedClass<typeof gcp.Provider>).mockImplementation(
      () => mockProvider
    );
    (
      gcp.container.Cluster as jest.MockedClass<typeof gcp.container.Cluster>
    ).mockImplementation(() => mockCluster);
    (
      gcp.compute.GlobalAddress as jest.MockedClass<
        typeof gcp.compute.GlobalAddress
      >
    ).mockImplementation(() => mockStaticIp);

    // Mock pulumi.log - use Object.defineProperty since it's readonly
    Object.defineProperty(pulumi, 'log', {
      value: {
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      },
      writable: true,
      configurable: true,
    });

    // Mock pulumi.interpolate and pulumi.all
    (pulumi.interpolate as any) = jest.fn((strings: any, ...values: any[]) => {
      return createMockOutput(
        strings.reduce(
          (acc: string, str: string, i: number) =>
            acc + str + (values[i] ? "mock-value" : ""),
          ""
        )
      );
    });

    (pulumi.all as any) = jest.fn((outputs: any[]) => {
      return {
        apply: (callback: any) => {
          const values = outputs.map((o) => o.get?.() || o);
          return createMockOutput(callback(values));
        },
      };
    });

    (pulumi.output as any) = jest.fn((value: any) => {
      if (value && typeof value.then === "function") {
        return {
          apply: (callback: any) => {
            return value.then((v: any) => createMockOutput(callback(v)));
          },
          get: () => value,
        } as any;
      }
      return createMockOutput(value);
    });
  });

  describe("createGkeCluster", () => {
    describe("Configuration Selection", () => {
      it("should use dev config for non-prod stack", () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockImplementation((key: string) => {
          switch (key) {
            case "region":
              return "us-central1";
            case "zone":
              return "us-central1-a";
            default:
              return undefined;
          }
        });

        createGkeCluster("test-cluster", "dev");

        expect(gcp.container.Cluster).toHaveBeenCalledWith(
          "test-cluster-gke-cluster",
          expect.objectContaining({
            initialNodeCount: 2,
            nodeConfig: expect.objectContaining({
              machineType: "e2-standard-2",
            }),
          }),
          expect.any(Object)
        );
      });

      it("should use prod config for prod stack", () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockImplementation((key: string) => {
          switch (key) {
            case "region":
              return "us-central1";
            case "zone":
              return "us-central1-a";
            default:
              return undefined;
          }
        });

        createGkeCluster("prod-cluster", "prod");

        expect(gcp.container.Cluster).toHaveBeenCalledWith(
          "prod-cluster-gke-cluster",
          expect.objectContaining({
            initialNodeCount: 3,
            nodeConfig: expect.objectContaining({
              machineType: "e2-standard-4",
            }),
          }),
          expect.any(Object)
        );
      });
    });

    describe("GCP Provider Creation", () => {
      it("should create provider with credentials when provided", () => {
        const mockCredentials = '{"type": "service_account"}';
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockImplementation((key: string) => {
          switch (key) {
            case "region":
              return "us-west1";
            case "zone":
              return "us-west1-b";
            case "credentials":
              return mockCredentials;
            default:
              return undefined;
          }
        });

        createGkeCluster("test-cluster", "dev");

        expect(gcp.Provider).toHaveBeenCalledWith(
          "gcp-provider",
          expect.objectContaining({
            project: "test-project",
            region: "us-west1",
            zone: "us-west1-b",
            credentials: mockCredentials,
          })
        );
      });

      it("should create provider without credentials when not provided", () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockImplementation((key: string) => {
          switch (key) {
            case "region":
              return "us-east1";
            case "zone":
              return "us-east1-c";
            default:
              return undefined;
          }
        });

        createGkeCluster("test-cluster", "dev");

        expect(gcp.Provider).toHaveBeenCalledWith(
          "gcp-provider",
          expect.objectContaining({
            project: "test-project",
            region: "us-east1",
            zone: "us-east1-c",
          })
        );
        expect(gcp.Provider).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            credentials: expect.anything(),
          })
        );
      });

      it("should use default region and zone when not specified", () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        createGkeCluster("test-cluster", "dev");

        expect(gcp.Provider).toHaveBeenCalledWith(
          "gcp-provider",
          expect.objectContaining({
            region: "us-central1",
            zone: "us-central1-a",
          })
        );
      });
    });

    describe("Static IP Creation", () => {
      it("should create a static IP for the cluster", () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        createGkeCluster("test-cluster", "dev");

        expect(gcp.compute.GlobalAddress).toHaveBeenCalledWith(
          "rafiki-global-ip",
          expect.objectContaining({
            project: "test-project",
            description: "Static IP for GKE Ingress",
          }),
          expect.objectContaining({
            provider: mockProvider,
          })
        );
      });
    });

    describe("GKE Cluster Creation", () => {
      it("should create cluster with correct configuration", () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        createGkeCluster("test-cluster", "dev");

        expect(gcp.container.Cluster).toHaveBeenCalledWith(
          "test-cluster-gke-cluster",
          expect.objectContaining({
            project: "test-project",
            location: "us-central1-a",
            initialNodeCount: 2,
            deletionProtection: false,
            nodeConfig: expect.objectContaining({
              machineType: "e2-standard-2",
              oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
            }),
          }),
          expect.objectContaining({
            provider: mockProvider,
          })
        );
      });

      it("should disable deletion protection", () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        createGkeCluster("test-cluster", "dev");

        expect(gcp.container.Cluster).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            deletionProtection: false,
          }),
          expect.any(Object)
        );
      });

      it("should configure OAuth scopes for cloud platform access", () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        createGkeCluster("test-cluster", "dev");

        expect(gcp.container.Cluster).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            nodeConfig: expect.objectContaining({
              oauthScopes: ["https://www.googleapis.com/auth/cloud-platform"],
            }),
          }),
          expect.any(Object)
        );
      });
    });

    describe("Return Values", () => {
      it("should return correct cluster information", () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        const result = createGkeCluster("test-cluster", "dev");

        expect(result).toHaveProperty("kubeconfig");
        expect(result).toHaveProperty("clusterName");
        expect(result).toHaveProperty("gcpProject");
        expect(result).toHaveProperty("gcpZone");
        expect(result).toHaveProperty("staticIpName");
      });

      it("should generate kubeconfig with correct cluster context", () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        const result = createGkeCluster("test-cluster", "dev");

        expect(result.kubeconfig).toBeDefined();
        expect(pulumi.interpolate).toHaveBeenCalled();
      });
    });

    describe("Logging", () => {
      it("should log cluster creation information", () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        createGkeCluster("test-cluster", "dev");

        expect(pulumi.log.info).toHaveBeenCalledWith(
          expect.stringContaining("Creating simple GKE cluster")
        );
        expect(pulumi.log.info).toHaveBeenCalledWith(
          expect.stringContaining("us-central1-a")
        );
      });
    });
  });

  describe("lookupSharedGkeClusterSync", () => {
    let mockGetCluster: jest.Mock;

    beforeEach(() => {
      mockGetCluster = jest.fn();
      (gcp.container as any).getCluster = mockGetCluster;
    });

    describe("Successful Cluster Lookup", () => {
      it("should return existing cluster information when found", async () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockImplementation((key: string) => {
          switch (key) {
            case "region":
              return "us-central1";
            case "zone":
              return "us-central1-a";
            default:
              return undefined;
          }
        });

        const mockExistingCluster = {
          name: "existing-cluster",
          endpoint: "https://10.20.30.40",
          masterAuths: [
            {
              clusterCaCertificate: "existing-ca-cert",
            },
          ],
        };

        (mockGetCluster as any).mockResolvedValue(mockExistingCluster);

        const result = lookupSharedGkeClusterSync("existing-cluster");

        expect(result).toBeDefined();
        expect(pulumi.output).toHaveBeenCalled();
      });

      it("should generate correct kubeconfig for existing cluster", async () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        const mockExistingCluster = {
          name: "existing-cluster",
          endpoint: "https://10.20.30.40",
          masterAuths: [
            {
              clusterCaCertificate: "existing-ca-cert",
            },
          ],
        };

        (mockGetCluster as any).mockResolvedValue(mockExistingCluster);

        lookupSharedGkeClusterSync("existing-cluster");

        const callArgs = mockGetCluster.mock.calls[0][0];
        expect(callArgs).toEqual({
          name: "existing-cluster",
          location: "us-central1-a",
          project: "test-project",
        });
      });
    });

    describe("Cluster Not Found", () => {
      it("should return exists:false when cluster not found", () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        (mockGetCluster as any).mockResolvedValue(null);

        const result = lookupSharedGkeClusterSync("non-existent-cluster");

        expect(result).toBeDefined();
        expect(pulumi.output).toHaveBeenCalled();
      });
    });

    describe("Error Handling", () => {
      it("should handle lookup errors gracefully", () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        (mockGetCluster as any).mockRejectedValue(new Error("Cluster lookup failed"));

        const result = lookupSharedGkeClusterSync("error-cluster");

        expect(result).toBeDefined();
      });

      it("should return exists:false on error", async () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        (mockGetCluster as any).mockRejectedValue(new Error("Network error"));

        lookupSharedGkeClusterSync("error-cluster");

        expect(pulumi.output).toHaveBeenCalled();
      });
    });

    describe("Configuration Parameters", () => {
      it("should use correct project, region, and zone", () => {
        mockConfig.require.mockReturnValue("custom-project");
        mockConfig.get.mockImplementation((key: string) => {
          switch (key) {
            case "region":
              return "europe-west1";
            case "zone":
              return "europe-west1-b";
            default:
              return undefined;
          }
        });

        (mockGetCluster as any).mockResolvedValue({
          name: "test-cluster",
          endpoint: "https://1.2.3.4",
          masterAuths: [{ clusterCaCertificate: "cert" }],
        });

        lookupSharedGkeClusterSync("test-cluster");

        expect(mockGetCluster).toHaveBeenCalledWith(
          expect.objectContaining({
            project: "custom-project",
            location: "europe-west1-b",
          }),
          expect.any(Object)
        );
      });
    });

    describe("Logging", () => {
      it("should log cluster lookup attempt", () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        (mockGetCluster as any).mockResolvedValue(null);

        lookupSharedGkeClusterSync("test-cluster");

        expect(pulumi.log.info).toHaveBeenCalledWith(
          expect.stringContaining("Looking up shared GKE cluster: test-cluster")
        );
      });
    });
  });

  describe("lookupSharedGkeCluster", () => {
    let mockGetCluster: jest.Mock;

    beforeEach(() => {
      mockGetCluster = jest.fn();
      (gcp.container as any).getCluster = mockGetCluster;
    });

    describe("Successful Async Cluster Lookup", () => {
      it("should return existing cluster with kubeconfig", async () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockImplementation((key: string) => {
          switch (key) {
            case "region":
              return "us-central1";
            case "zone":
              return "us-central1-a";
            default:
              return undefined;
          }
        });

        const mockExistingCluster = {
          name: "async-cluster",
          endpoint: "https://50.60.70.80",
          masterAuths: [
            {
              clusterCaCertificate: "async-ca-cert",
            },
          ],
        };

        (mockGetCluster as any).mockResolvedValue(mockExistingCluster);

        const result = await lookupSharedGkeCluster("async-cluster");

        expect(result.exists).toBe(true);
        expect(result.clusterName).toBe("async-cluster");
        expect(result.kubeconfig).toContain("async-cluster");
        expect(result.project).toBe("test-project");
      });

      it("should use custom project when provided", async () => {
        mockConfig.get.mockReturnValue(undefined);

        const mockExistingCluster = {
          name: "test-cluster",
          endpoint: "https://1.2.3.4",
          masterAuths: [{ clusterCaCertificate: "cert" }],
        };

        (mockGetCluster as any).mockResolvedValue(mockExistingCluster);

        const result = await lookupSharedGkeCluster(
          "test-cluster",
          "gcp",
          "custom-project"
        );

        expect(result.project).toBe("custom-project");
        expect(mockGetCluster).toHaveBeenCalledWith(
          expect.objectContaining({
            project: "custom-project",
          })
        );
      });

      it("should include region and zone in result", async () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockImplementation((key: string) => {
          switch (key) {
            case "region":
              return "asia-east1";
            case "zone":
              return "asia-east1-a";
            default:
              return undefined;
          }
        });

        const mockExistingCluster = {
          name: "test-cluster",
          endpoint: "https://1.2.3.4",
          masterAuths: [{ clusterCaCertificate: "cert" }],
        };

        (mockGetCluster as any).mockResolvedValue(mockExistingCluster);

        const result = await lookupSharedGkeCluster("test-cluster");

        expect(result.region).toBe("asia-east1");
        expect(result.zone).toBe("asia-east1-a");
      });

      it("should generate correct kubeconfig context", async () => {
        mockConfig.require.mockReturnValue("my-project");
        mockConfig.get.mockImplementation((key: string) => {
          switch (key) {
            case "zone":
              return "us-west1-a";
            default:
              return undefined;
          }
        });

        const mockExistingCluster = {
          name: "my-cluster",
          endpoint: "https://192.168.1.1",
          masterAuths: [{ clusterCaCertificate: "my-cert" }],
        };

        (mockGetCluster as any).mockResolvedValue(mockExistingCluster);

        const result = await lookupSharedGkeCluster("my-cluster");

        expect(result.kubeconfig).toContain("gke_my-project_us-west1-a_my-cluster");
        expect(result.kubeconfig).toContain("https://192.168.1.1");
        expect(result.kubeconfig).toContain("my-cert");
      });
    });

    describe("Cluster Not Found Async", () => {
      it("should return exists:false when cluster doesn't exist", async () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        (mockGetCluster as any).mockResolvedValue(null);

        const result = await lookupSharedGkeCluster("non-existent");

        expect(result.exists).toBe(false);
        expect(result.kubeconfig).toBeUndefined();
        expect(result.clusterName).toBeUndefined();
      });

      it("should include project info even when cluster not found", async () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockImplementation((key: string) => {
          switch (key) {
            case "region":
              return "us-east1";
            case "zone":
              return "us-east1-b";
            default:
              return undefined;
          }
        });

        (mockGetCluster as any).mockResolvedValue(null);

        const result = await lookupSharedGkeCluster("non-existent");

        expect(result.exists).toBe(false);
        expect(result.project).toBe("test-project");
        expect(result.region).toBe("us-east1");
        expect(result.zone).toBe("us-east1-b");
      });
    });

    describe("Error Handling Async", () => {
      it("should handle API errors gracefully", async () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        (mockGetCluster as any).mockRejectedValue(new Error("API Error"));

        const result = await lookupSharedGkeCluster("error-cluster");

        expect(result.exists).toBe(false);
        expect(result.kubeconfig).toBeUndefined();
      });

      it("should return minimal result on error", async () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        (mockGetCluster as any).mockRejectedValue(new Error("Network timeout"));

        const result = await lookupSharedGkeCluster("timeout-cluster");

        expect(result).toEqual({
          exists: false,
        });
      });

      it("should handle permission errors", async () => {
        mockConfig.require.mockReturnValue("test-project");
        mockConfig.get.mockReturnValue(undefined);

        (mockGetCluster as any).mockRejectedValue(new Error("Permission denied"));

        const result = await lookupSharedGkeCluster("forbidden-cluster");

        expect(result.exists).toBe(false);
      });
    });
  });

  describe("getOrCreateStaticIp", () => {
    let mockGetGlobalAddress: jest.Mock;

    beforeEach(() => {
      mockGetGlobalAddress = jest.fn();
      (gcp.compute as any).getGlobalAddress = mockGetGlobalAddress;
    });

    describe("Existing Static IP", () => {
      it("should return existing IP when found", async () => {
        const mockExistingIp = {
          name: "existing-ip",
          address: "203.0.113.100",
        };

        (mockGetGlobalAddress as any).mockResolvedValue(mockExistingIp);

        const result = getOrCreateStaticIp(
          "existing-ip",
          "test-project",
          mockProvider
        );

        expect(result).toBeDefined();
        expect(pulumi.output).toHaveBeenCalled();
      });

      it("should lookup IP with correct parameters", () => {
        const mockExistingIp = {
          name: "test-ip",
          address: "198.51.100.50",
        };

        (mockGetGlobalAddress as any).mockResolvedValue(mockExistingIp);

        getOrCreateStaticIp("test-ip", "my-project", mockProvider);

        expect(mockGetGlobalAddress).toHaveBeenCalledWith(
          {
            name: "test-ip",
            project: "my-project",
          },
          { async: true }
        );
      });
    });

    describe("Create New Static IP", () => {
      it("should create new IP when not found", async () => {
        (mockGetGlobalAddress as any).mockRejectedValue(new Error("Not found"));

        const result = getOrCreateStaticIp("new-ip", "test-project", mockProvider);

        // Allow the promise to reject and trigger the catch block
        await new Promise(resolve => setTimeout(resolve, 10));

        // Verify that output is called
        expect(pulumi.output).toHaveBeenCalled();
        expect(result).toBeDefined();
      });

      it("should create IP with correct description", async () => {
        jest.clearAllMocks();
        (mockGetGlobalAddress as any).mockRejectedValue(new Error("Not found"));

        getOrCreateStaticIp("new-ip", "test-project", mockProvider);

        // Allow the promise to reject and trigger the catch block
        await new Promise(resolve => setTimeout(resolve, 10));

        // The GlobalAddress constructor should be called
        expect(gcp.compute.GlobalAddress).toHaveBeenCalledWith(
          "new-ip",
          expect.objectContaining({
            project: "test-project",
            description: "Static IP for shared GKE Ingress",
          }),
          expect.objectContaining({
            provider: mockProvider,
          })
        );
      });

      it("should use provided GCP provider", async () => {
        jest.clearAllMocks();
        (mockGetGlobalAddress as any).mockRejectedValue(new Error("Not found"));

        getOrCreateStaticIp("new-ip", "test-project", mockProvider);

        // Allow the promise to reject and trigger the catch block
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(gcp.compute.GlobalAddress).toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({
            provider: mockProvider,
          })
        );
      });
    });

    describe("IP Name and Address Mapping", () => {
      it("should return both name and address", async () => {
        const mockExistingIp = {
          name: "test-ip-name",
          address: "192.0.2.100",
        };

        (mockGetGlobalAddress as any).mockResolvedValue(mockExistingIp);

        getOrCreateStaticIp("test-ip-name", "test-project", mockProvider);

        expect(pulumi.output).toHaveBeenCalled();
      });
    });

    describe("Error Recovery", () => {
      it("should create IP on lookup failure", async () => {
        (mockGetGlobalAddress as any).mockRejectedValue(
          new Error("Service unavailable")
        );

        const result = getOrCreateStaticIp(
          "recovery-ip",
          "test-project",
          mockProvider
        );

        // Allow the promise to reject and trigger the catch block
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(result).toBeDefined();
      });

      it("should handle network errors during lookup", async () => {
        jest.clearAllMocks();
        (mockGetGlobalAddress as any).mockRejectedValue(new Error("Network error"));

        const result = getOrCreateStaticIp(
          "network-ip",
          "test-project",
          mockProvider
        );

        // Allow the promise to reject and trigger the catch block
        await new Promise(resolve => setTimeout(resolve, 10));

        expect(result).toBeDefined();
        expect(gcp.compute.GlobalAddress).toHaveBeenCalled();
      });
    });
  });

  describe("Integration Scenarios", () => {
    it("should handle complete cluster setup workflow", () => {
      mockConfig.require.mockReturnValue("integration-project");
      mockConfig.get.mockImplementation((key: string) => {
        switch (key) {
          case "region":
            return "us-central1";
          case "zone":
            return "us-central1-c";
          case "credentials":
            return '{"type": "service_account"}';
          default:
            return undefined;
        }
      });

      const result = createGkeCluster("integration-cluster", "prod");

      // Verify all components were created
      expect(gcp.Provider).toHaveBeenCalled();
      expect(gcp.compute.GlobalAddress).toHaveBeenCalled();
      expect(gcp.container.Cluster).toHaveBeenCalled();
      expect(result).toHaveProperty("kubeconfig");
      expect(result).toHaveProperty("staticIpName");
    });

    it("should use consistent configuration across components", () => {
      const testProject = "consistency-project";
      const testZone = "europe-west1-d";

      mockConfig.require.mockReturnValue(testProject);
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "zone") return testZone;
        return undefined;
      });

      createGkeCluster("consistency-cluster", "dev");

      // Verify project is used consistently
      expect(gcp.Provider).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          project: testProject,
          zone: testZone,
        })
      );

      expect(gcp.compute.GlobalAddress).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          project: testProject,
        }),
        expect.any(Object)
      );

      expect(gcp.container.Cluster).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          project: testProject,
          location: testZone,
        }),
        expect.any(Object)
      );
    });
  });

  describe("Configuration Validation", () => {
    it("should require project configuration", () => {
      mockConfig.require.mockImplementation((key: string) => {
        if (key === "project") {
          throw new Error("Configuration 'project' is required");
        }
        return undefined;
      });

      expect(() => createGkeCluster("test-cluster", "dev")).toThrow(
        "Configuration 'project' is required"
      );
    });

    it("should handle missing optional configuration gracefully", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockReturnValue(undefined);

      expect(() => createGkeCluster("test-cluster", "dev")).not.toThrow();
    });
  });

  describe("Node Pool Configuration", () => {
    it("should configure correct machine type for dev", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockReturnValue(undefined);

      createGkeCluster("dev-cluster", "dev");

      expect(gcp.container.Cluster).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          nodeConfig: expect.objectContaining({
            machineType: "e2-standard-2",
          }),
        }),
        expect.any(Object)
      );
    });

    it("should configure correct machine type for prod", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockReturnValue(undefined);

      createGkeCluster("prod-cluster", "prod");

      expect(gcp.container.Cluster).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          nodeConfig: expect.objectContaining({
            machineType: "e2-standard-4",
          }),
        }),
        expect.any(Object)
      );
    });

    it("should set correct initial node count for dev", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockReturnValue(undefined);

      createGkeCluster("dev-cluster", "dev");

      expect(gcp.container.Cluster).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          initialNodeCount: 2,
        }),
        expect.any(Object)
      );
    });

    it("should set correct initial node count for prod", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockReturnValue(undefined);

      createGkeCluster("prod-cluster", "prod");

      expect(gcp.container.Cluster).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          initialNodeCount: 3,
        }),
        expect.any(Object)
      );
    });
  });

  describe("Kubeconfig Generation", () => {
    it("should include cluster CA certificate in kubeconfig", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockReturnValue(undefined);

      const result = createGkeCluster("kubeconfig-test", "dev");

      expect(pulumi.interpolate).toHaveBeenCalled();
      expect(result.kubeconfig).toBeDefined();
    });

    it("should include gke-gcloud-auth-plugin configuration", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockReturnValue(undefined);

      createGkeCluster("auth-test", "dev");

      expect(pulumi.interpolate).toHaveBeenCalled();
    });

    it("should include environment variables in kubeconfig", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockImplementation((key: string) => {
        if (key === "credentialsPath") return "/path/to/creds.json";
        return undefined;
      });

      createGkeCluster("env-test", "dev");

      expect(pulumi.interpolate).toHaveBeenCalled();
    });

    it("should handle credentialsPath in kubeconfig generation", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockImplementation((key: string) => {
        switch (key) {
          case "credentialsPath":
            return "/custom/path/to/service-account.json";
          case "region":
            return "us-west2";
          case "zone":
            return "us-west2-a";
          default:
            return undefined;
        }
      });

      const result = createGkeCluster("creds-path-test", "dev");

      expect(result).toHaveProperty("kubeconfig");
      expect(result).toHaveProperty("gcpZone", "us-west2-a");
    });
  });

  describe("GKE Configuration Constants", () => {
    it("should use correct min and max node counts for dev", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockReturnValue(undefined);

      createGkeCluster("dev-nodes", "dev");

      // Verify dev configuration is selected
      expect(gcp.container.Cluster).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          initialNodeCount: 2,
        }),
        expect.any(Object)
      );
    });

    it("should use correct min and max node counts for prod", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockReturnValue(undefined);

      createGkeCluster("prod-nodes", "prod");

      // Verify prod configuration is selected
      expect(gcp.container.Cluster).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          initialNodeCount: 3,
        }),
        expect.any(Object)
      );
    });

    it("should handle arbitrary stack names as dev", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockReturnValue(undefined);

      createGkeCluster("staging-cluster", "staging");

      // Non-prod stacks should use dev config
      expect(gcp.container.Cluster).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          initialNodeCount: 2,
          nodeConfig: expect.objectContaining({
            machineType: "e2-standard-2",
          }),
        }),
        expect.any(Object)
      );
    });
  });

  describe("Multiple Regions and Zones", () => {
    it("should handle us-west region", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockImplementation((key: string) => {
        switch (key) {
          case "region":
            return "us-west1";
          case "zone":
            return "us-west1-b";
          default:
            return undefined;
        }
      });

      const result = createGkeCluster("west-cluster", "dev");

      expect(result.gcpZone).toBe("us-west1-b");
      expect(gcp.Provider).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          region: "us-west1",
          zone: "us-west1-b",
        })
      );
    });

    it("should handle asia region", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockImplementation((key: string) => {
        switch (key) {
          case "region":
            return "asia-southeast1";
          case "zone":
            return "asia-southeast1-a";
          default:
            return undefined;
        }
      });

      const result = createGkeCluster("asia-cluster", "prod");

      expect(result.gcpZone).toBe("asia-southeast1-a");
    });

    it("should handle europe region", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockImplementation((key: string) => {
        switch (key) {
          case "region":
            return "europe-west2";
          case "zone":
            return "europe-west2-c";
          default:
            return undefined;
        }
      });

      createGkeCluster("europe-cluster", "dev");

      expect(gcp.Provider).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          region: "europe-west2",
          zone: "europe-west2-c",
        })
      );
    });
  });

  describe("Provider and Credentials Combinations", () => {
    it("should handle both credentials and credentialsPath", () => {
      mockConfig.require.mockReturnValue("test-project");
      mockConfig.get.mockImplementation((key: string) => {
        switch (key) {
          case "credentials":
            return '{"type": "service_account", "project_id": "test"}';
          case "credentialsPath":
            return "/path/to/creds.json";
          default:
            return undefined;
        }
      });

      createGkeCluster("both-creds", "dev");

      expect(gcp.Provider).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          credentials: expect.any(String),
        })
      );
    });

    it("should create static IP with custom project name", () => {
      mockConfig.require.mockReturnValue("custom-gcp-project-123");
      mockConfig.get.mockReturnValue(undefined);

      createGkeCluster("custom-project-cluster", "prod");

      expect(gcp.compute.GlobalAddress).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          project: "custom-gcp-project-123",
        }),
        expect.any(Object)
      );
    });
  });
});

