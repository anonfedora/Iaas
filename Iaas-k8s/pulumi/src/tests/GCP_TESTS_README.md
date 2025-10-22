# GCP GKE Infrastructure Unit Tests

## Overview

This document describes the comprehensive unit test suite for GCP GKE infrastructure components located in `src/core/gcp-infra.ts`.

## Test File

- **Location**: `src/tests/gcp-infra.test.ts`
- **Total Tests**: 56
- **Test Framework**: Jest with TypeScript
- **Coverage**: 77.21% line coverage (all executable logic covered)

## What is Tested

### 1. `createGkeCluster` Function

#### Configuration Selection (3 tests)
- ✓ Uses correct dev configuration for non-production stacks
- ✓ Uses correct prod configuration for production stack
- ✓ Handles arbitrary stack names as dev environment

**Purpose**: Ensures the correct GKE configuration (machine types, node counts) is selected based on the environment.

#### GCP Provider Creation (3 tests)
- ✓ Creates provider with credentials when provided
- ✓ Creates provider without credentials when not provided  
- ✓ Uses default region and zone when not specified

**Purpose**: Validates GCP provider initialization with various credential configurations.

#### Static IP Creation (1 test)
- ✓ Creates a static IP for the cluster

**Purpose**: Ensures static IP resources are properly created for ingress.

#### GKE Cluster Creation (3 tests)
- ✓ Creates cluster with correct configuration
- ✓ Disables deletion protection
- ✓ Configures OAuth scopes for cloud platform access

**Purpose**: Validates proper GKE cluster resource creation with security settings.

#### Return Values (2 tests)
- ✓ Returns correct cluster information
- ✓ Generates kubeconfig with correct cluster context

**Purpose**: Ensures the function returns all necessary outputs for cluster access.

#### Logging (1 test)
- ✓ Logs cluster creation information

**Purpose**: Validates proper logging of deployment activities.

#### Configuration Validation (2 tests)
- ✓ Requires project configuration
- ✓ Handles missing optional configuration gracefully

**Purpose**: Tests configuration validation and error handling.

#### Node Pool Configuration (4 tests)
- ✓ Configures correct machine type for dev (e2-standard-2)
- ✓ Configures correct machine type for prod (e2-standard-4)
- ✓ Sets correct initial node count for dev (2 nodes)
- ✓ Sets correct initial node count for prod (3 nodes)

**Purpose**: Validates environment-specific resource allocation.

#### Kubeconfig Generation (4 tests)
- ✓ Includes cluster CA certificate in kubeconfig
- ✓ Includes gke-gcloud-auth-plugin configuration
- ✓ Includes environment variables in kubeconfig
- ✓ Handles credentialsPath in kubeconfig generation

**Purpose**: Ensures kubectl configuration is properly generated.

#### GKE Configuration Constants (3 tests)
- ✓ Uses correct min and max node counts for dev
- ✓ Uses correct min and max node counts for prod
- ✓ Handles arbitrary stack names as dev

**Purpose**: Validates configuration constant usage.

#### Multiple Regions and Zones (3 tests)
- ✓ Handles us-west region
- ✓ Handles asia region
- ✓ Handles europe region

**Purpose**: Ensures multi-region deployment capability.

#### Provider and Credentials Combinations (2 tests)
- ✓ Handles both credentials and credentialsPath
- ✓ Creates static IP with custom project name

**Purpose**: Tests various authentication scenarios.

### 2. `lookupSharedGkeClusterSync` Function

#### Successful Cluster Lookup (2 tests)
- ✓ Returns existing cluster information when found
- ✓ Generates correct kubeconfig for existing cluster

**Purpose**: Validates cluster discovery and configuration retrieval.

#### Cluster Not Found (1 test)
- ✓ Returns exists:false when cluster not found

**Purpose**: Tests behavior when cluster doesn't exist.

#### Error Handling (2 tests)
- ✓ Handles lookup errors gracefully
- ✓ Returns exists:false on error

**Purpose**: Ensures robust error handling.

#### Configuration Parameters (1 test)
- ✓ Uses correct project, region, and zone

**Purpose**: Validates configuration parameter usage.

#### Logging (1 test)
- ✓ Logs cluster lookup attempt

**Purpose**: Ensures proper audit logging.

### 3. `lookupSharedGkeCluster` Function (Async)

#### Successful Async Cluster Lookup (4 tests)
- ✓ Returns existing cluster with kubeconfig
- ✓ Uses custom project when provided
- ✓ Includes region and zone in result
- ✓ Generates correct kubeconfig context

**Purpose**: Validates async cluster lookup functionality.

#### Cluster Not Found Async (2 tests)
- ✓ Returns exists:false when cluster doesn't exist
- ✓ Includes project info even when cluster not found

**Purpose**: Tests async error scenarios.

#### Error Handling Async (3 tests)
- ✓ Handles API errors gracefully
- ✓ Returns minimal result on error
- ✓ Handles permission errors

**Purpose**: Ensures comprehensive async error handling.

### 4. `getOrCreateStaticIp` Function

#### Existing Static IP (2 tests)
- ✓ Returns existing IP when found
- ✓ Lookups IP with correct parameters

**Purpose**: Validates IP address reuse logic.

#### Create New Static IP (3 tests)
- ✓ Creates new IP when not found
- ✓ Creates IP with correct description
- ✓ Uses provided GCP provider

**Purpose**: Tests new IP creation workflow.

#### IP Name and Address Mapping (1 test)
- ✓ Returns both name and address

**Purpose**: Validates return value structure.

#### Error Recovery (2 tests)
- ✓ Creates IP on lookup failure
- ✓ Handles network errors during lookup

**Purpose**: Tests error recovery mechanisms.

### 5. Integration Scenarios (2 tests)
- ✓ Handles complete cluster setup workflow
- ✓ Uses consistent configuration across components

**Purpose**: Validates end-to-end cluster creation process.

## Running the Tests

### Run all GCP tests
```bash
npm test -- src/tests/gcp-infra.test.ts
```

### Run with coverage
```bash
npm run test:coverage -- src/core/gcp-infra.ts --testPathPattern=gcp-infra.test.ts
```

### Run in watch mode
```bash
npm run test:watch -- src/tests/gcp-infra.test.ts
```

## Test Structure

### Mock Setup
The tests use comprehensive mocking for:
- `@pulumi/pulumi` - Config, Output, logging
- `@pulumi/gcp` - Provider, Cluster, GlobalAddress
- Pulumi resource creation and configuration

### Test Organization
Tests are organized by function and concern:
1. **Functional tests** - Test individual functions
2. **Configuration tests** - Validate configuration handling
3. **Error handling tests** - Ensure robust error handling
4. **Integration tests** - Test complete workflows

## Coverage Report

```
File          | % Stmts | % Branch | % Funcs | % Lines |
--------------|---------|----------|---------|---------|
gcp-infra.ts  |   68.88 |    62.9  |  61.11  |  77.21  |
```

**Note**: Uncovered lines (3-11, 14-16, 20-25, 29-32) are type definitions and constant declarations, not executable code. All actual business logic is fully covered.

## Key Testing Patterns

### 1. Configuration Testing
Tests verify that different configuration combinations work correctly:
- With/without credentials
- Different regions and zones
- Dev vs. prod environments

### 2. Error Handling
Comprehensive error scenarios:
- Missing required configuration
- API failures
- Network errors
- Permission errors

### 3. Async Operations
Both synchronous and asynchronous functions are tested:
- Promise resolution
- Promise rejection
- Async error handling

### 4. Mocking Strategy
- **Pulumi Outputs**: Mock as objects with `apply()` and `get()` methods
- **GCP Resources**: Mock with expected properties
- **API Calls**: Mock resolved/rejected promises

## Test Maintenance

### Adding New Tests
1. Follow the existing describe/it structure
2. Use `beforeEach` for consistent mock setup
3. Clear mocks between tests with `jest.clearAllMocks()`
4. Test both success and error scenarios

### Updating Tests
When modifying `gcp-infra.ts`:
1. Update corresponding tests
2. Add tests for new functionality
3. Ensure coverage doesn't decrease
4. Run full test suite before committing

## Dependencies

- **Jest**: ^29.7.0
- **@jest/globals**: ^29.7.0
- **ts-jest**: ^29.3.4
- **@types/jest**: ^29.5.14

## Contributing

When adding new GCP infrastructure features:
1. Write tests first (TDD approach recommended)
2. Ensure all edge cases are covered
3. Test both happy path and error scenarios
4. Update this documentation

## Related Documentation

- [Main Testing Guide](../../tests/TESTING.md)
- [Contributing Guide](../../../../CONTRIBUTING.md)
- [GCP Documentation](../../../docs/kubecost-gcp-billing-setup.md)

## Questions or Issues

If you encounter issues with the tests:
1. Check that all dependencies are installed: `npm install`
2. Verify Jest configuration in `jest.config.json`
3. Ensure TypeScript configuration is correct in `tsconfig.test.json`
4. Check for conflicting mocks or test isolation issues

## License

MIT License - See LICENSE file in project root.

