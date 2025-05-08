import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { Logger } from '../../../shared/logger/logger.interface';
import { ServiceFactory } from '../factories/service-factory';
import { SupervisorCoordinationService } from './supervisor-coordination.service';
import { SessionService } from './session.service';
import { MessageStore } from './message-store.service';
import { TopicExtractionService } from '../interfaces/topic-extraction.interface';
import { TopicExtractionServiceImpl } from './topic-extraction.service';
import { TopicVisualizationService } from '../visualization/topic-visualization.service';

/**
 * Service registry options
 */
interface ServiceRegistryOptions {
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Storage type for persistence
   */
  storageType?: 'memory' | 'file' | 'custom';
  
  /**
   * Storage path for file storage
   */
  storagePath?: string;
}

/**
 * Registry for accessing all services with a singleton pattern
 */
export class ServiceRegistry {
  private static instance: ServiceRegistry;
  
  private logger: Logger;
  private supervisorCoordinationService: SupervisorCoordinationService;
  private sessionService: SessionService;
  private messageStore: MessageStore;
  private initialized: boolean = false;
  
  // Add new service properties
  private topicExtractionService?: TopicExtractionService;
  private topicVisualizationService?: TopicVisualizationService;
  
  /**
   * Get the singleton instance of ServiceRegistry
   */
  static getInstance(options: ServiceRegistryOptions = {}): ServiceRegistry {
    if (!this.instance) {
      this.instance = new ServiceRegistry(options);
    }
    return this.instance;
  }
  
  /**
   * Create a new service registry
   * Private constructor to enforce singleton pattern
   */
  private constructor(options: ServiceRegistryOptions) {
    this.logger = options.logger || new ConsoleLogger();
    
    // Initialize supervisor coordination service
    this.supervisorCoordinationService = ServiceFactory.getSupervisorCoordinationService({
      storageType: options.storageType || 'file',
      storagePath: options.storagePath || './data',
      logger: this.logger
    });
    
    // Initialize session service
    this.sessionService = new SessionService({
      stateManager: this.supervisorCoordinationService['persistentState'],
      logger: this.logger
    });
    
    // Initialize message store
    this.messageStore = new MessageStore({
      stateManager: this.supervisorCoordinationService['persistentState'],
      logger: this.logger
    });
    
    this.logger.info('Service registry initialized');
  }
  
  /**
   * Get the supervisor coordination service
   */
  getSupervisorCoordinationService(): SupervisorCoordinationService {
    return this.supervisorCoordinationService;
  }
  
  /**
   * Get the session service
   */
  getSessionService(): SessionService {
    return this.sessionService;
  }
  
  /**
   * Get the message store
   */
  getMessageStore(): MessageStore {
    return this.messageStore;
  }
  
  /**
   * Initialize all services
   * Call this method to ensure all services are properly initialized
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.debug('Service registry already initialized');
      return;
    }
    
    this.logger.info('Initializing all services...');
    
    // Initialize the persistent state manager if it has an initialize method
    if (typeof this.supervisorCoordinationService['persistentState'].initialize === 'function') {
      this.logger.info('Initializing persistent state manager...');
      await this.supervisorCoordinationService['persistentState'].initialize();
    }
    
    // Initialize any services that require async initialization
    // Currently none of our services need async initialization
    
    this.initialized = true;
    this.logger.info('All services initialized successfully');
  }

  /**
   * Check if the service registry is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // Get topic extraction service
  getTopicExtractionService(): TopicExtractionService {
    if (!this.topicExtractionService) {
      this.topicExtractionService = new TopicExtractionServiceImpl(this.logger);
    }
    return this.topicExtractionService;
  }
  
  // Get topic visualization service
  getTopicVisualizationService(): TopicVisualizationService {
    if (!this.topicVisualizationService) {
      this.topicVisualizationService = new TopicVisualizationService(this.logger);
    }
    return this.topicVisualizationService;
  }
  
  // Set topic extraction service
  setTopicExtractionService(service: TopicExtractionService): void {
    this.topicExtractionService = service;
  }
  
  // Set topic visualization service
  setTopicVisualizationService(service: TopicVisualizationService): void {
    this.topicVisualizationService = service;
  }
} 