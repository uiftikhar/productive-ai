/**
 * Helper functions for setting up mock services in tests
 */
import { ServiceRegistry } from '../../langgraph/agentic-meeting-analysis/services/service-registry';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { LogLevel } from '../../shared/logger/logger.interface';

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
  logger.setLogLevel(LogLevel.ERROR);
  
  // Create the service registry with in-memory storage for testing
  const options: ServiceRegistryTestOptions = {
    storageType: 'memory',
    logger,
    reset: true // Reset the singleton instance for tests
  };
  
  // Get the service registry instance using the provided options
  const serviceRegistry = ServiceRegistry.getInstance(options);
  
  // Initialize services properly with a promise
  try {
    // Use a proper initialization approach
    const initPromise = serviceRegistry.initialize();
    
    // Add cleanup method to the serviceRegistry for test teardown
    (serviceRegistry as any).cleanup = async () => {
      // Cancel any pending timers or async operations in the services
      const supervisor = serviceRegistry.getSupervisorCoordinationService();
      
      // Use type assertion to access potentially private methods
      const supervisorAny = supervisor as any;
      if (supervisorAny && typeof supervisorAny.cancelAllPendingOperations === 'function') {
        await supervisorAny.cancelAllPendingOperations();
      }
      
      // Clear any test data
      if ((serviceRegistry as any).initialized) {
        // Perform any needed cleanup
        logger.info('Cleaning up test service registry');
      }
    };
    
    // Wait for initialization to complete
    initPromise.then(() => {
      logger.info('Test service registry initialized');
    }).catch(error => {
      logger.error('Error initializing test service registry:', error);
    });
  } catch (error) {
    console.error('Error initializing service registry:', error);
  }
  
  return serviceRegistry;
} 