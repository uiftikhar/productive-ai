/**
 * Helper functions for setting up mock services in tests
 */
import { ServiceRegistry } from '../../langgraph/agentic-meeting-analysis/services/service-registry';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Service registry options interface
 */
interface ServiceRegistryTestOptions {
  storageType: 'memory' | 'file';
  storagePath?: string;
  logger?: any;
  reset?: boolean;
}

/**
 * Set up mock services for testing
 */
export function setupMockServices(): ServiceRegistry {
  // Create logger with default settings (no arguments needed for ConsoleLogger)
  const logger = new ConsoleLogger();

  // Set the log level to error for tests
  logger.setLogLevel('error');
  
  // Create the service registry with in-memory storage for testing
  const options: ServiceRegistryTestOptions = {
    storageType: 'memory',
    logger,
    reset: true // Reset the singleton instance for tests
  };
  
  // Get the service registry instance using the provided options
  const serviceRegistry = ServiceRegistry.getInstance(options);
  
  // Initialize services synchronously for testing - this is a test helper
  // so we'll assume the initialize method exists and can be awaited
  try {
    // Use Promise.resolve to handle the case where initialize returns a promise or not
    Promise.resolve(serviceRegistry.initialize());
  } catch (error) {
    console.error('Error initializing service registry:', error);
  }
  
  return serviceRegistry;
} 