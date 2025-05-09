import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { Logger } from '../../../shared/logger/logger.interface';
import { ServiceFactory } from '../factories/service-factory';
import { SupervisorCoordinationService } from './supervisor-coordination.service';
import { SessionService } from './session.service';
import { MessageStore } from './message-store.service';
import { TopicExtractionService } from '../interfaces/topic-extraction.interface';
import { TopicExtractionServiceImpl } from './topic-extraction.service';
import { TopicVisualizationService } from '../visualization/topic-visualization.service';
import { 
  ActionItemExtractionService, 
  ActionItemTrackingService, 
  ActionItemIntegrationService, 
  ActionItemNotificationService 
} from '../interfaces/action-items.interface';
import { ActionItemExtractionServiceImpl } from './action-extraction.service';
import { ActionItemTrackingServiceImpl } from './action-item-tracking.service';
import { ActionItemIntegrationServiceImpl } from './action-item-integration.service';
import { ActionItemNotificationServiceImpl } from './action-item-notification.service';

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
  
  /**
   * Enable real integrations (vs simulations)
   */
  enableRealIntegrations?: boolean;
  
  /**
   * Enable notifications
   */
  enableNotifications?: boolean;
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
  private enableRealIntegrations: boolean = false;
  private enableNotifications: boolean = false;
  
  // Add new service properties
  private topicExtractionService?: TopicExtractionService;
  private topicVisualizationService?: TopicVisualizationService;
  
  // Action item services
  private actionItemExtractionService?: ActionItemExtractionService;
  private actionItemTrackingService?: ActionItemTrackingService;
  private actionItemIntegrationService?: ActionItemIntegrationService;
  private actionItemNotificationService?: ActionItemNotificationService;
  
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
    this.enableRealIntegrations = options.enableRealIntegrations === true;
    this.enableNotifications = options.enableNotifications !== false;
    
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
  
  // Get action item extraction service
  getActionItemExtractionService(): ActionItemExtractionService {
    if (!this.actionItemExtractionService) {
      this.actionItemExtractionService = new ActionItemExtractionServiceImpl({
        logger: this.logger
      });
    }
    return this.actionItemExtractionService;
  }
  
  // Get action item tracking service
  getActionItemTrackingService(): ActionItemTrackingService {
    if (!this.actionItemTrackingService) {
      this.actionItemTrackingService = new ActionItemTrackingServiceImpl({
        logger: this.logger
      });
    }
    return this.actionItemTrackingService;
  }
  
  // Get action item integration service
  getActionItemIntegrationService(): ActionItemIntegrationService {
    if (!this.actionItemIntegrationService) {
      // Create with reference to the tracking service for updates
      const tracking = this.getActionItemTrackingService();
      
      this.actionItemIntegrationService = new ActionItemIntegrationServiceImpl({
        logger: this.logger,
        actionItemTrackingService: tracking,
        enableRealIntegrations: this.enableRealIntegrations
      });
    }
    return this.actionItemIntegrationService;
  }
  
  // Get action item notification service
  getActionItemNotificationService(): ActionItemNotificationService {
    if (!this.actionItemNotificationService) {
      this.actionItemNotificationService = new ActionItemNotificationServiceImpl({
        logger: this.logger,
        enableEmailNotifications: this.enableNotifications,
        enableSlackNotifications: this.enableNotifications
      });
    }
    return this.actionItemNotificationService;
  }
  
  // Set action item extraction service
  setActionItemExtractionService(service: ActionItemExtractionService): void {
    this.actionItemExtractionService = service;
  }
  
  // Set action item tracking service
  setActionItemTrackingService(service: ActionItemTrackingService): void {
    this.actionItemTrackingService = service;
  }
  
  // Set action item integration service
  setActionItemIntegrationService(service: ActionItemIntegrationService): void {
    this.actionItemIntegrationService = service;
  }
  
  // Set action item notification service
  setActionItemNotificationService(service: ActionItemNotificationService): void {
    this.actionItemNotificationService = service;
  }
} 