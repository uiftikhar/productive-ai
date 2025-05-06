/**
 * Test Environment Setup
 * 
 * This module provides functions for setting up a test environment with real service
 * implementations and mocked external dependencies.
 */

import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  StateRepositoryService,
  CommunicationService,
  TeamFormationService,
  AdaptationTriggerService,
  AdaptationManagerService,
  ApiCompatibilityService,
  SharedMemoryService,
  AgentMessage,
  MessageType
} from '../../agentic-meeting-analysis';
import { CollaborativeProtocolService } from '../../agentic-meeting-analysis/communication';
import { StateManager } from '../../agentic-meeting-analysis/state/state.manager';
import { SemanticChunkingService } from '../../agentic-meeting-analysis/team-formation/semantic-chunking.service';

// Import mocks for external dependencies
import {
  createMockLanguageModel,
  createMongoDbMock,
  createMSWMock,
  createMockSemanticChunkingService,
  MockSemanticChunkingService
} from './mocks';

/**
 * Test Environment Configuration
 */
export interface TestEnvironmentConfig {
  /**
   * Whether to use in-memory state persistence (default: true)
   */
  useInMemoryState?: boolean;
  
  /**
   * Whether to mock language model responses (default: true)
   */
  mockLanguageModel?: boolean;
  
  /**
   * Whether to mock database operations (default: true)
   */
  mockDatabase?: boolean;
  
  /**
   * Whether to mock external APIs (default: true)
   */
  mockExternalApis?: boolean;
  
  /**
   * Whether to mock semantic chunking (default: true)
   * This avoids embedding calculation issues in tests
   */
  mockSemanticChunking?: boolean;
  
  /**
   * Base URL for API mocking
   */
  apiBaseUrl?: string;
  
  /**
   * Enable debug mode for mocks
   */
  debugMocks?: boolean;
}

/**
 * Test Environment Services
 */
export interface TestEnvironment {
  // Core services
  stateRepository: StateRepositoryService;
  communication: CommunicationService;
  teamFormation: TeamFormationService;
  adaptationTrigger: AdaptationTriggerService;
  adaptationManager: AdaptationManagerService;
  collaborativeProtocol: CollaborativeProtocolService;
  apiCompatibility: ApiCompatibilityService;
  sharedMemory: SharedMemoryService;
  
  // Mocks for external dependencies
  mocks: {
    languageModel: ReturnType<typeof createMockLanguageModel> | null;
    database: Awaited<ReturnType<typeof createMongoDbMock>> | null;
    api: ReturnType<typeof createMSWMock> | null;
    semanticChunking?: MockSemanticChunkingService;
  };
  
  // Utilities
  cleanup: () => Promise<void>;
}

/**
 * Sets up a test environment with real service implementations
 * but with mocked external dependencies
 * 
 * @param config Configuration options for the test environment
 * @returns Test environment with initialized services
 */
export async function setupTestEnvironment(
  config: TestEnvironmentConfig = {}
): Promise<TestEnvironment> {
  // Set default configuration
  const finalConfig = {
    useInMemoryState: true,
    mockLanguageModel: true,
    mockDatabase: true,
    mockExternalApis: true,
    mockSemanticChunking: true,
    apiBaseUrl: 'http://localhost:3000/api',
    debugMocks: false,
    ...config
  };
  
  // Create logger
  const logger = new ConsoleLogger();
  
  // Mock external dependencies
  
  // 1. Set up language model mock
  const mockLanguageModel = finalConfig.mockLanguageModel 
    ? createMockLanguageModel({
        defaultResponse: JSON.stringify({
          success: true,
          message: "This is a default mock response from the language model."
        })
      }) 
    : null;
  
  // 2. Set up MongoDB in-memory database
  const mockMongoDb = finalConfig.mockDatabase 
    ? await createMongoDbMock({
        debug: finalConfig.debugMocks
      })
    : null;
  
  // 3. Set up MSW for API mocking
  const mockApi = finalConfig.mockExternalApis 
    ? createMSWMock({
        baseUrl: finalConfig.apiBaseUrl,
        debug: finalConfig.debugMocks
      })
    : null;
  
  // 4. Set up semantic chunking mock if enabled
  const mockSemanticChunking = finalConfig.mockSemanticChunking
    ? createMockSemanticChunkingService({
        logger
      })
    : undefined;
  
  // Start MSW server if it was initialized
  if (mockApi) {
    mockApi.start();
  }
  
  // Create real service instances
  const sharedMemoryService = new SharedMemoryService({
    logger,
    persistenceEnabled: finalConfig.useInMemoryState,
    maxHistoryLength: 100,
    defaultNamespace: 'default'
  });
  
  // Initialize shared memory service
  await sharedMemoryService.initialize();
  
  // Create communication service
  const communicationService = new CommunicationService({
    logger,
    retainMessageHistory: true,
    maxMessageHistory: 1000
  });
  
  // Initialize communication service
  await communicationService.initialize();
  
  // Create state repository service
  const stateRepositoryService = new StateRepositoryService({
    logger,
    persistenceEnabled: finalConfig.useInMemoryState
  });
  
  // Initialize state repository service
  await stateRepositoryService.initialize();
  
  // Create state manager
  const stateManager = new StateManager({
    logger,
    persistenceEnabled: finalConfig.useInMemoryState
  });
  
  // Initialize the state manager
  await stateManager.initialize();
  
  // Create semantic chunking service - use mock or real implementation
  const semanticChunkingService = (finalConfig.mockSemanticChunking && mockSemanticChunking)
    ? mockSemanticChunking as unknown as SemanticChunkingService
    : new SemanticChunkingService({
        logger
      });
  
  // Create team formation service
  const teamFormationService = new TeamFormationService({
    logger,
    stateManager,
    semanticChunkingService
  });
  
  // Initialize team formation service
  await teamFormationService.initialize();
  
  // Build test environment with all required services and mocks
  const testEnv: TestEnvironment = {
    stateRepository: stateRepositoryService,
    communication: communicationService,
    teamFormation: teamFormationService,
    adaptationTrigger: {} as AdaptationTriggerService,
    adaptationManager: {} as AdaptationManagerService,
    collaborativeProtocol: {} as CollaborativeProtocolService,
    apiCompatibility: {} as ApiCompatibilityService,
    sharedMemory: sharedMemoryService,
    
    mocks: {
      languageModel: mockLanguageModel,
      database: mockMongoDb,
      api: mockApi,
      semanticChunking: mockSemanticChunking
    },
    
    cleanup: async () => {
      // Clean up any resources allocated during testing
      if (mockApi) {
        mockApi.stop();
      }
      
      if (mockMongoDb) {
        await mockMongoDb.stop();
      }
      
      // Cleanup real services
      await communicationService.cleanup();
      await sharedMemoryService.cleanup();
    }
  };
  
  return testEnv;
} 