import { PersistentStateManager } from '../../core/state/persistent-state-manager';
import { HierarchicalStateRepository } from '../../core/state/hierarchical-state-repository';
import { ChatAgentInterface } from '../../core/chat/chat-agent-interface';
import { EnhancedTranscriptProcessor } from '../../core/transcript/enhanced-transcript-processor';
import { IntegrationRegistry } from '../../core/integration/integration-framework';
import { SupervisorCoordinationService } from '../services/supervisor-coordination.service';
import { IntentParserService } from '../../core/chat/intent-parser.service';
import { ResponseFormatterService } from '../../core/chat/response-formatter.service';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { SupervisorService } from '../../core/supervisor/supervisor.service';
import { FileStorageAdapter } from '../../core/state/storage-adapters/file-storage.adapter';
import { MemoryStorageAdapter } from '../../core/state/storage-adapters/memory-storage.adapter';

/**
 * Service configuration options
 */
export interface ServiceFactoryOptions {
  /**
   * Storage type to use
   */
  storageType?: 'memory' | 'file' | 'custom';
  
  /**
   * Custom storage adapter (if storageType is 'custom')
   */
  customStorageAdapter?: any;
  
  /**
   * Storage path (for file storage)
   */
  storagePath?: string;
  
  /**
   * Logger to use
   */
  logger?: any;
}

/**
 * Factory for creating service instances
 */
export class ServiceFactory {
  // Private static variable to hold singleton instance of SupervisorCoordinationService
  private static supervisorCoordinationInstance: SupervisorCoordinationService;
  
  /**
   * Get a singleton instance of SupervisorCoordinationService
   */
  static getSupervisorCoordinationService(options: ServiceFactoryOptions = {}): SupervisorCoordinationService {
    if (!this.supervisorCoordinationInstance) {
      this.supervisorCoordinationInstance = this.createSupervisorCoordinationService(options);
    }
    return this.supervisorCoordinationInstance;
  }
  
  /**
   * Create a SupervisorCoordinationService instance with all required dependencies
   * This is now a private method, use getSupervisorCoordinationService instead
   */
  private static createSupervisorCoordinationService(options: ServiceFactoryOptions = {}): SupervisorCoordinationService {
    // Create logger
    const logger = options.logger || new ConsoleLogger();
    
    // Create storage adapter based on options
    let storageAdapter;
    if (options.storageType === 'file') {
      storageAdapter = new FileStorageAdapter({
        storageDir: options.storagePath || './data',
        logger
      });
    } else if (options.storageType === 'custom' && options.customStorageAdapter) {
      storageAdapter = options.customStorageAdapter;
    } else {
      // Default to memory storage
      storageAdapter = new MemoryStorageAdapter();
    }
    
    // Create state manager
    const persistentState = new PersistentStateManager({
      storageAdapter,
      logger
    });
    
    // Create state repository
    const stateRepository = new HierarchicalStateRepository({
      stateManager: persistentState,
      logger
    });
    
    // Create transcript processor
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
    
    // Create and return supervisor coordination service
    return new SupervisorCoordinationService(
      persistentState,
      stateRepository,
      chatInterface,
      transcriptProcessor,
      integrationRegistry,
      { logger }
    );
  }
  
  /**
   * Create a ChatAgentInterface instance
   */
  static createChatAgentInterface(supervisorCoordination: SupervisorCoordinationService, options: ServiceFactoryOptions = {}): ChatAgentInterface {
    // Create logger
    const logger = options.logger || new ConsoleLogger();
    
    // Create supervisor service with the coordination service
    const supervisorService = new SupervisorService({
      stateRepository: supervisorCoordination['stateRepository'],
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