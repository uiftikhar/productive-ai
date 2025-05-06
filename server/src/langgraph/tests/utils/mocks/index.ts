/**
 * Mocks for External Dependencies
 * 
 * This module exports mocks for external dependencies that are needed for integration testing.
 * Following best practices, we only mock external systems, not the services under test.
 */

// Export MongoDB mock based on mongodb-memory-server
export * from './mongodb.mock';

// Export MSW-based API mock
export * from './msw.mock';

// Export language model mock
export * from './language-model.mock';

// Export semantic chunking mock
export * from './semantic-chunking.mock';

// Re-export createMockDatabase and createMockExternalApi with warnings for backwards compatibility
// These will be removed in a future update
import { createMongoDbMock } from './mongodb.mock';
import { createMSWMock } from './msw.mock';

/**
 * @deprecated Use createMongoDbMock from './mongodb.mock' instead
 */
export function createMockDatabase() {
  console.warn('Warning: createMockDatabase is deprecated. Use createMongoDbMock instead.');
  return {};
}

/**
 * @deprecated Use createMSWMock from './msw.mock' instead
 */
export function createMockExternalApi() {
  console.warn('Warning: createMockExternalApi is deprecated. Use createMSWMock instead.');
  return {};
} 