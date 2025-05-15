import { PersistentStateManager } from '../../core/state/persistent-state-manager';
import { HierarchicalStateRepository } from '../../core/state/hierarchical-state-repository';
import { ChatAgentInterface } from '../../core/chat/chat-agent-interface';
import { EnhancedTranscriptProcessor } from '../../core/transcript/enhanced-transcript-processor';
import { IntegrationRegistry } from '../../core/integration/integration-framework';
import { IntentParserService } from '../../core/chat/intent-parser.service';
import { ResponseFormatterService } from '../../core/chat/response-formatter.service';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { SupervisorService } from '../../core/supervisor/supervisor.service';
import { FileStorageAdapter } from '../../core/state/storage-adapters/file-storage.adapter';
import { MemoryStorageAdapter } from '../../core/state/storage-adapters/memory-storage.adapter';
import { RagKnowledgeBaseService } from '../services/rag-knowledge-base.service';
import { PineconeConnector } from '../../../connectors/pinecone-connector';
import { PineconeKnowledgeConnector } from '../services/pinecone-knowledge-connector';
import { MeetingAnalysisSupervisorService } from '../services';

/**
 * Redis connection options for services
 */
export interface RedisOptions {
  /**
   * Redis host
   */
  host?: string;
  
  /**
   * Redis port
   */
  port?: number;
  
  /**
   * Redis password
   */
  password?: string;
  
  /**
   * Redis database number
   */
  db?: number;
  
  /**
   * Redis URI (alternative to host/port/password)
   */
  uri?: string;
}

/**
 * Service configuration options
 */
export interface ServiceFactoryOptions {
  /**
   * Storage type to use
   */
  storageType?: 'memory' | 'file' | 'redis' | 'custom';

  /**
   * Custom storage adapter (if storageType is 'custom')
   */
  customStorageAdapter?: any;

  /**
   * Storage path (for file storage)
   */
  storagePath?: string;
  
  /**
   * Redis connection options (for redis storage)
   */
  redisOptions?: RedisOptions;

  /**
   * Logger to use
   */
  logger?: any;
}

/**
 * Factory for creating service instances
 */
export class ServiceFactory {
  // Private static variable to hold singleton instance of MeetingAnalysisSupervisorService
  private static supervisorInstance: MeetingAnalysisSupervisorService;

  /**
   * Get a singleton instance of MeetingAnalysisSupervisorService
   */
  static getMeetingAnalysisSupervisor(options: ServiceFactoryOptions = {}): MeetingAnalysisSupervisorService {
    if (!this.supervisorInstance) {
      this.supervisorInstance = this.createMeetingAnalysisSupervisor(options);
    }
    return this.supervisorInstance;
  }

  /**
   * Create a MeetingAnalysisSupervisorService instance with all required dependencies
   * This is now a private method, use getMeetingAnalysisSupervisor instead
   */
  private static createMeetingAnalysisSupervisor(options: ServiceFactoryOptions = {}): MeetingAnalysisSupervisorService {
    // Create logger
    const logger = options.logger || new ConsoleLogger();

    // Create persistent state manager with appropriate storage
    let persistentState;
    
    if (options.storageType === 'file') {
      // File-based storage
      persistentState = new PersistentStateManager({
        storageType: 'file',
        storagePath: options.storagePath || './data',
        logger
      });
    } else if (options.storageType === 'redis') {
      // Redis-based storage (preferred)
      persistentState = new PersistentStateManager({
        storageType: 'redis',
        namespace: 'meeting-analysis',
        redisOptions: {
          host: options.redisOptions?.host || process.env.REDIS_HOST || 'localhost',
          port: options.redisOptions?.port || parseInt(process.env.REDIS_PORT || '6379'),
          password: options.redisOptions?.password || process.env.REDIS_PASSWORD,
          db: options.redisOptions?.db || parseInt(process.env.REDIS_DB || '0'),
          uri: options.redisOptions?.uri || process.env.REDIS_URI
        },
        logger
      });
    } else if (options.storageType === 'custom' && options.customStorageAdapter) {
      // Custom storage adapter
      persistentState = new PersistentStateManager({
        storageAdapter: options.customStorageAdapter,
        logger
      });
    } else {
      // Default to memory storage
      persistentState = new PersistentStateManager({
        storageType: 'memory',
        logger
      });
    }

    // Create state repository
    const stateRepository = new HierarchicalStateRepository({
      stateManager: persistentState,
      logger
    });

    // Create transcript processor (not directly used in constructor but may be needed elsewhere)
    const transcriptProcessor = new EnhancedTranscriptProcessor({
      logger
    });

    // Create integration registry
    const integrationRegistry = new IntegrationRegistry({
      logger
    });

    // Create supervisor service
    const supervisorService = new SupervisorService({
      stateRepository,
      logger
    });

    // Create intent parser and response formatter
    const intentParser = new IntentParserService({
      logger
    });

    const responseFormatter = new ResponseFormatterService({
      logger
    });

    // Create chat agent interface
    const chatInterface = new ChatAgentInterface({
      supervisorService,
      intentParser,
      responseFormatter,
      logger
    });

    // Create Pinecone connector and knowledge connector
    const pineconeConnector = new PineconeConnector({
      logger
    });
    
    const knowledgeConnector = new PineconeKnowledgeConnector({
      pineconeConnector,
      logger,
      defaultCollection: 'meeting-analysis'
    });

    // Create a RAG knowledge base service instance
    const knowledgeService = new RagKnowledgeBaseService({
      connector: knowledgeConnector,
      logger,
      maxRetrievalResults: 5,
      similarityThreshold: 0.7
    });

    // Commented out lines below are for reference - these were options we need to add
    // maxRetrievalResults?: number;
    // similarityThreshold?: number;
    // useRagByDefault?: boolean;
    
    // Create and return supervisor coordination service
    return new MeetingAnalysisSupervisorService(
      {
        knowledgeService,
        persistentState,
        stateRepository,
        integrationRegistry,
        logger
      }
    );
  }

  /**
   * Create a ChatAgentInterface instance
   */
  static createChatAgentInterface(
    supervisor: MeetingAnalysisSupervisorService, 
    options: ServiceFactoryOptions = {}
  ): ChatAgentInterface {
    // Create logger
    const logger = options.logger || new ConsoleLogger();

    // Create supervisor service with the coordination service
    const supervisorService = new SupervisorService({
      stateRepository: supervisor['stateRepository'],
      logger
    });

    // Create intent parser and response formatter
    const intentParser = new IntentParserService({
      logger
    });

    const responseFormatter = new ResponseFormatterService({
      logger
    });

    // Create and return chat agent interface
    return new ChatAgentInterface({
      supervisorService,
      intentParser,
      responseFormatter,
      logger
    });
  }
} 