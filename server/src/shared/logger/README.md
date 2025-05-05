# Logger Implementations

This directory contains logger implementations for the Productive AI server application.

## Logger Interface

The `logger.interface.ts` file defines the `Logger` interface which all logger implementations must implement.

## Implementations

- **ConsoleLogger**: A simple logger that outputs to the console
- **MockLogger**: A test-focused logger that captures logs in memory for assertions in tests

## Using MockLogger in Tests

The `MockLogger` is designed to be used in test environments. It captures logs in memory and provides methods for checking log contents.

Example usage:

```typescript
import { MockLogger } from './mock-logger';

// Create the mock logger
const mockLogger = new MockLogger();

// Use the logger
mockLogger.info('Test message', { key: 'value' });

// Assert on logger contents in tests
expect(mockLogger.getLogs('info')).toHaveLength(1);
expect(mockLogger.hasMessage('Test message')).toBe(true);
```

For global usage in Jest tests, the MockLogger is set up in `setupJest.js` and is available globally as `global.mockLogger` in test files. 