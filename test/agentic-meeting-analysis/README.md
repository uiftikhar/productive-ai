# Agentic Meeting Analysis Testing Suite

This directory contains comprehensive tests for the Agentic Meeting Analysis system, implementing Phase 7 (Testing and Integration) requirements.

## Directory Structure

```
test/agentic-meeting-analysis/
├── test-utils.ts            # Common testing utilities and functions
├── integration/             # Service integration tests
│   ├── memory-integration.test.ts
│   └── communication-integration.test.ts
├── e2e/                     # End-to-end workflow tests
│   └── meeting-analysis-e2e.test.ts
├── performance/             # Performance and optimization tests
│   └── performance.test.ts
└── quality/                 # Quality assurance tests
```

## Testing Approach

### 1. Integration Tests

Located in the `integration/` directory, these tests verify that individual components work together correctly:

- **Memory Integration**: Tests the SharedMemoryService's integration with StateRepositoryService
- **Communication Integration**: Tests message delivery between agents via CommunicationService

### 2. End-to-End Tests

Located in the `e2e/` directory, these tests simulate complete workflows through the system:

- **Meeting Analysis Workflow**: Tests the entire process from meeting creation to analysis result generation
- **Error Handling**: Tests system behavior when encountering failures
- **Incremental Results**: Tests the system's ability to provide partial results during analysis

### 3. Performance Tests

Located in the `performance/` directory, these tests measure and optimize system performance:

- **Memory Usage**: Measures memory consumption during analysis of various meeting sizes
- **Response Times**: Measures response times for various operations
- **Caching Effectiveness**: Tests the impact of caching on system performance
- **Concurrent Request Handling**: Tests the system's ability to handle multiple simultaneous requests

## Test Utilities

The `test-utils.ts` file contains shared utilities to support all test types:

- **Service Instance Caching**: Optimizes test performance by reusing service instances
- **Test Data Generation**: Creates test meetings and analysis requests with realistic data
- **Agent Response Mocking**: Prevents actual LLM calls during tests
- **Performance Measurement**: Utilities to track execution time and memory usage
- **Test Environment Setup**: Functions to initialize and clean up the test environment

## Running Tests

To run the full test suite:

```bash
npm test
```

To run specific test categories:

```bash
# Integration tests only
npm test -- --testPathPattern=integration

# End-to-end tests only
npm test -- --testPathPattern=e2e

# Performance tests only
npm test -- --testPathPattern=performance
```

## Performance Considerations

The performance tests are designed to:

1. Measure baseline performance metrics
2. Identify performance bottlenecks
3. Verify optimization strategies (caching, etc.)
4. Ensure the system scales with increasing data volume

Performance test results are logged to the console and can be compared across runs to track improvements or regressions.

## Test Data

Tests use generated mock data that simulates realistic meeting transcripts and analysis scenarios. The data generation functions in `test-utils.ts` can be customized to test different meeting sizes, participant counts, and analysis complexity. 