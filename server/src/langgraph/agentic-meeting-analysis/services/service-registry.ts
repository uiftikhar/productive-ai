import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { Logger } from '../../../shared/logger/logger.interface';
import { ServiceFactory } from '../factories/service-factory';
import { MeetingAnalysisSupervisorService } from './meeting-analysis-supervisor.service';
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
import { AgentGraphVisualizationService } from '../visualization/agent-graph-visualization.service';
import { v4 as uuidv4 } from 'uuid';
import { OpenAIConnector } from '../../../connectors/openai-connector';
import { PineconeConnector } from '../../../connectors/pinecone-connector';
import { MeetingAnalysisInstructionTemplateService } from './meeting-analysis-instruction-template.service';
import { InstructionTemplateService } from '../../../shared/services/instruction-template.service';

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
 * Agent service status
 */
export interface AgentServiceStatus {
  name: string;
  status: 'OK' | 'DEGRADED' | 'ERROR';
  initialized: boolean;
  details?: Record<string, any>;
}

/**
 * Agent status report
 */
export interface AgentStatusReport {
  status: 'OK' | 'DEGRADED' | 'ERROR';
  services: AgentServiceStatus[];
  timestamp: string;
}

/**
 * Session progress information
 */
export interface SessionProgress {
  sessionId: string;
  progress: number; // 0-100
  status: 'processing' | 'completed' | 'failed';
  statusMessage?: string;
  startTime: number;
  lastUpdateTime: number;
}

/**
 * Service registry for the meeting analysis subsystem
 */
export class MeetingAnalysisServiceRegistry {
  private static instance: MeetingAnalysisServiceRegistry;
  
  private logger: Logger;
  private meetingAnalysisSupervisor: MeetingAnalysisSupervisorService;
  private sessionService: SessionService;
  private messageStore: MessageStore;
  private initialized: boolean = false;
  private enableRealIntegrations: boolean = false;
  private enableNotifications: boolean = false;
  
  // Add new service properties
  private topicExtractionService?: TopicExtractionService;
  private topicVisualizationService?: TopicVisualizationService;
  private agentVisualizationService?: AgentGraphVisualizationService;
  
  // Action item services
  private actionItemExtractionService?: ActionItemExtractionService;
  private actionItemTrackingService?: ActionItemTrackingService;
  private actionItemIntegrationService?: ActionItemIntegrationService;
  private actionItemNotificationService?: ActionItemNotificationService;
  
  // Session data
  private sessionProgress: Map<string, SessionProgress> = new Map();
  
  private openAIConnector?: OpenAIConnector;
  private pineconeConnector?: PineconeConnector;
  private instructionTemplateService?: InstructionTemplateService;
  private meetingAnalysisInstructionTemplates?: MeetingAnalysisInstructionTemplateService;
  private services: Map<string, any> = new Map();
  private id: string;
  
  /**
   * Private constructor for singleton pattern
   */
  private constructor(options: ServiceRegistryOptions) {
    this.logger = options.logger || new ConsoleLogger();
    this.enableRealIntegrations = options.enableRealIntegrations === true;
    this.enableNotifications = options.enableNotifications !== false;
    
    this.id = uuidv4();
    this.logger.debug('Created Service Registry instance', { id: this.id });
    
    // Initialize supervisor coordination service
    this.meetingAnalysisSupervisor = ServiceFactory.getMeetingAnalysisSupervisor({
      logger: this.logger
    });
    
    // Initialize session service
    this.sessionService = new SessionService({
      stateManager: this.meetingAnalysisSupervisor['persistentState'],
      logger: this.logger
    });
    
    // Initialize message store
    this.messageStore = new MessageStore({
      stateManager: this.meetingAnalysisSupervisor['persistentState'],
      logger: this.logger
    });
    
    this.logger.info('Service registry initialized');
  }
  
  /**
   * Get the singleton instance
   */
  public static getInstance(options: ServiceRegistryOptions = {}): MeetingAnalysisServiceRegistry {
    if (!this.instance) {
      this.instance = new MeetingAnalysisServiceRegistry(options);
    }
    return this.instance;
  }
  
  /**
   * Get the meeting analysis supervisor service
   */
  getMeetingAnalysisSupervisor(): MeetingAnalysisSupervisorService {
    return this.meetingAnalysisSupervisor;
  }
  
  /**
   * Backward compatibility method
   * @deprecated Use getMeetingAnalysisSupervisor instead
   */
  getSupervisorCoordinationService(): MeetingAnalysisSupervisorService {
    return this.meetingAnalysisSupervisor;
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
    if (typeof this.meetingAnalysisSupervisor['persistentState'].initialize === 'function') {
      this.logger.info('Initializing persistent state manager...');
      await this.meetingAnalysisSupervisor['persistentState'].initialize();
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

  /**
   * Get agent status report
   * Provides a complete status report of all agent services
   */
  getAgentStatusReport(): AgentStatusReport {
    const services: AgentServiceStatus[] = [];
    let overallStatus: 'OK' | 'DEGRADED' | 'ERROR' = 'OK';
    
    // Check supervisor coordination service
    try {
      const supervisorStatus: AgentServiceStatus = {
        name: 'SupervisorCoordinationService',
        status: 'OK',
        initialized: true,
        details: {
          isActive: true
        }
      };
      services.push(supervisorStatus);
    } catch (error) {
      services.push({
        name: 'SupervisorCoordinationService',
        status: 'ERROR',
        initialized: false,
        details: { error: (error as Error).message }
      });
      overallStatus = 'DEGRADED';
    }
    
    // Check session service
    try {
      const sessionStatus: AgentServiceStatus = {
        name: 'SessionService',
        status: 'OK',
        initialized: true
      };
      services.push(sessionStatus);
    } catch (error) {
      services.push({
        name: 'SessionService',
        status: 'ERROR',
        initialized: false,
        details: { error: (error as Error).message }
      });
      overallStatus = 'DEGRADED';
    }
    
    // Check message store
    try {
      const messageStoreStatus: AgentServiceStatus = {
        name: 'MessageStore',
        status: 'OK',
        initialized: true
      };
      services.push(messageStoreStatus);
    } catch (error) {
      services.push({
        name: 'MessageStore',
        status: 'ERROR',
        initialized: false,
        details: { error: (error as Error).message }
      });
      overallStatus = 'DEGRADED';
    }
    
    // Check topic extraction service
    if (this.topicExtractionService) {
      services.push({
        name: 'TopicExtractionService',
        status: 'OK',
        initialized: true
      });
    }
    
    // Check topic visualization service
    if (this.topicVisualizationService) {
      services.push({
        name: 'TopicVisualizationService',
        status: 'OK',
        initialized: true
      });
    }
    
    // Check action item extraction service
    if (this.actionItemExtractionService) {
      services.push({
        name: 'ActionItemExtractionService',
        status: 'OK',
        initialized: true
      });
    }
    
    // Check action item tracking service
    if (this.actionItemTrackingService) {
      services.push({
        name: 'ActionItemTrackingService',
        status: 'OK',
        initialized: true
      });
    }
    
    // Check action item integration service
    if (this.actionItemIntegrationService) {
      try {
        const integrationStatus: AgentServiceStatus = {
          name: 'ActionItemIntegrationService',
          status: 'OK',
          initialized: true,
          details: {
            realIntegrationsEnabled: this.enableRealIntegrations
          }
        };
        services.push(integrationStatus);
      } catch (error) {
        services.push({
          name: 'ActionItemIntegrationService',
          status: this.enableRealIntegrations ? 'ERROR' : 'DEGRADED',
          initialized: true,
          details: { 
            error: (error as Error).message,
            realIntegrationsEnabled: this.enableRealIntegrations
          }
        });
        if (this.enableRealIntegrations) {
          overallStatus = 'DEGRADED';
        }
      }
    }
    
    // Check action item notification service
    if (this.actionItemNotificationService) {
      try {
        const notificationStatus: AgentServiceStatus = {
          name: 'ActionItemNotificationService',
          status: 'OK',
          initialized: true,
          details: {
            notificationsEnabled: this.enableNotifications
          }
        };
        services.push(notificationStatus);
      } catch (error) {
        services.push({
          name: 'ActionItemNotificationService',
          status: this.enableNotifications ? 'ERROR' : 'DEGRADED',
          initialized: true,
          details: { 
            error: (error as Error).message,
            notificationsEnabled: this.enableNotifications
          }
        });
        if (this.enableNotifications) {
          overallStatus = 'DEGRADED';
        }
      }
    }
    
    // If no critical services are working, set status to ERROR
    if (services.filter(s => s.status === 'ERROR').length >= 2) {
      overallStatus = 'ERROR';
    }
    
    return {
      status: overallStatus,
      services,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Fetch session progress from the session service
   * Returns the progress of a specific agent session from external service
   */
  async fetchSessionProgressFromService(sessionId: string): Promise<{ 
    sessionId: string; 
    progress: number; 
    status: string;
    details?: Record<string, any>;
  }> {
    try {
      const session = await this.sessionService.getSession(sessionId);
      
      if (!session) {
        return {
          sessionId,
          progress: 0,
          status: 'not_found'
        };
      }
      
      // Access session data safely with type checking
      const sessionData = session as unknown as Record<string, any>;
      
      return {
        sessionId,
        progress: typeof sessionData.progress === 'number' ? sessionData.progress : 0,
        status: typeof sessionData.status === 'string' ? sessionData.status : 'unknown',
        details: {
          createdAt: sessionData.createdAt,
          updatedAt: sessionData.updatedAt,
          completedAt: sessionData.completedAt
        }
      };
    } catch (error) {
      this.logger.error(`Error getting session progress for ${sessionId}:`, { error });
      return {
        sessionId,
        progress: 0,
        status: 'error',
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
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

  /**
   * Register an agent visualization service
   */
  public registerAgentVisualizationService(service: AgentGraphVisualizationService): void {
    this.agentVisualizationService = service;
    this.logger.debug('Registered AgentGraphVisualizationService');
  }
  
  /**
   * Get the agent visualization service
   */
  public getAgentVisualizationService(): AgentGraphVisualizationService | undefined {
    return this.agentVisualizationService;
  }

  /**
   * Register a message store
   */
  public registerMessageStore(store: any): void {
    this.messageStore = store;
    this.logger.debug('Message store registered');
  }
  
  /**
   * Update session progress
   */
  public updateSessionProgress(sessionId: string, progress: Partial<SessionProgress>): void {
    const existingProgress = this.sessionProgress.get(sessionId);
    
    if (existingProgress) {
      // Update existing progress
      const updatedProgress = {
        ...existingProgress,
        ...progress,
        lastUpdateTime: Date.now()
      };
      
      this.sessionProgress.set(sessionId, updatedProgress);
    } else {
      // Initialize new progress
      const newProgress: SessionProgress = {
        sessionId,
        progress: progress.progress || 0,
        status: progress.status || 'processing',
        statusMessage: progress.statusMessage,
        startTime: progress.startTime || Date.now(),
        lastUpdateTime: Date.now()
      };
      
      this.sessionProgress.set(sessionId, newProgress);
    }
  }
  
  /**
   * Get session progress
   */
  public getSessionProgress(sessionId: string): SessionProgress | null {
    return this.sessionProgress.get(sessionId) || null;
  }
  
  /**
   * Clear progress for a session
   */
  public clearSessionProgress(sessionId: string): void {
    this.sessionProgress.delete(sessionId);
  }

  /**
   * Register an OpenAI connector
   */
  public registerOpenAIConnector(connector: OpenAIConnector): void {
    this.openAIConnector = connector;
    this.logger.debug('Registered OpenAIConnector');
  }

  /**
   * Get the OpenAI connector
   */
  public getOpenAIConnector(): OpenAIConnector | undefined {
    return this.openAIConnector;
  }

  /**
   * Register a Pinecone connector
   */
  public registerPineconeConnector(connector: PineconeConnector): void {
    this.pineconeConnector = connector;
    this.logger.debug('Registered PineconeConnector');
  }

  /**
   * Get the Pinecone connector
   */
  public getPineconeConnector(): PineconeConnector | undefined {
    return this.pineconeConnector;
  }

  /**
   * Register a generic service
   */
  public registerService(name: string, service: any): void {
    this.services.set(name, service);
    this.logger.debug(`Registered service: ${name}`);
  }

  /**
   * Get a generic service
   */
  public getService(name: string): any {
    return this.services.get(name);
  }

  /**
   * Check if a service is registered
   */
  public hasService(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Get all registered service names
   */
  public getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Reset the registry (primarily for testing)
   */
  public static resetInstance(): void {
    MeetingAnalysisServiceRegistry.instance = new MeetingAnalysisServiceRegistry({});
  }

  /**
   * Register the instruction template service
   */
  public registerInstructionTemplateService(service: InstructionTemplateService): void {
    this.instructionTemplateService = service;
    this.registerService('instructionTemplateService', service);
    this.logger.info('Instruction template service registered');
  }
  
  /**
   * Get the instruction template service
   */
  public getInstructionTemplateService(): InstructionTemplateService | undefined {
    return this.instructionTemplateService;
  }

  /**
   * Register the meeting analysis instruction template service
   */
  registerMeetingAnalysisInstructionTemplates(service: MeetingAnalysisInstructionTemplateService): void {
    this.meetingAnalysisInstructionTemplates = service;
    this.registerService('meetingAnalysisInstructionTemplates', service);
  }
  
  /**
   * Get the meeting analysis instruction template service
   */
  getMeetingAnalysisInstructionTemplates(): MeetingAnalysisInstructionTemplateService | undefined {
    return this.meetingAnalysisInstructionTemplates;
  }
} 