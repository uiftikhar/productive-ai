// Core integration framework
export * from './integration-framework';

// Base connectors
export * from './connectors/base-connector';
export * from './connectors/project-management-connector.base';
export * from './connectors/knowledge-base-connector.base';
export * from './connectors/communication-connector.base';

// MCP components
export * from './mcp/mcp-client';
export * from './mcp/mcp-adapter';

/**
 * Factory function to create a fully configured integration registry
 */
import { IntegrationRegistry } from './integration-framework';
import { Logger } from '../../../shared/logger/logger.interface';

export function createIntegrationRegistry(options?: { logger?: Logger }): IntegrationRegistry {
  return new IntegrationRegistry(options);
} 