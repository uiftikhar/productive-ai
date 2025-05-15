/**
 * Factory for creating hierarchical agent teams
 */
import { v4 as uuidv4 } from 'uuid';
import { 
  AgentExpertise, 
  AgentRole, 
  AnalysisGoalType,
  // TODO: Why is this oimported? Should this be used in the agent interface?
  AgentOutput 
} from '../interfaces/agent.interface';
import { EnhancedSupervisorAgent } from '../agents/coordinator/enhanced-supervisor-agent';
import { AnalysisManagerAgent } from '../agents/manager/analysis-manager-agent';
import { SpecialistWorkerAgent } from '../agents/workers/specialist-worker-agent';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { Logger } from '../../../shared/logger/logger.interface';
import { AgentConfigService } from '../../../shared/config/agent-config.service';
import { OpenAIConnector } from '../../../connectors/openai-connector';
import { ChatOpenAI } from '@langchain/openai';

// Import worker agent implementations
import { TopicAnalysisAgent } from '../agents/topic/topic-analysis-agent';
import { ActionItemSpecialistAgent } from '../agents/action/action-item-specialist-agent';
import { SummarySynthesisAgent } from '../agents/summary/summary-synthesis-agent';
import { SentimentAnalysisAgent } from '../agents/sentiment/sentiment-analysis-agent';
import { ParticipantDynamicsAgent } from '../agents/participation/participant-dynamics-agent';
import { DecisionAnalysisAgent } from '../agents/decision/decision-analysis-agent';
import { ContextIntegrationAgent } from '../agents/context/context-integration-agent';
import { extendSpecialistAgent } from '../agents/workers/specialist-agent-extensions';

// Import RAG components
import { UnifiedRAGService } from '../../../rag/core/unified-rag.service';
import { MeetingContextProvider } from '../../../rag/context/meeting-context-provider';
import { DocumentContextProvider } from '../../../rag/context/document-context-provider';
import { ConversationMemoryService } from '../../../rag/memory/conversation-memory.service';
import { MeetingContextAgent } from '../../../rag/agents/meeting-context-agent';

// Define extended enum values as string constants
// This avoids modifying the original enum objects
const ExtendedAgentExpertise = {
  ...AgentExpertise,
  PARTICIPATION_ANALYSIS: 'PARTICIPATION_ANALYSIS',
  DECISION_ANALYSIS: 'DECISION_ANALYSIS',
  CONTEXT_INTEGRATION: 'CONTEXT_INTEGRATION',
  CONTEXT_AWARENESS: 'CONTEXT_AWARENESS'
} as const;

// Create a derived type for the extended enum
type ExtendedExpertise = typeof AgentExpertise[keyof typeof AgentExpertise] | 
  'PARTICIPATION_ANALYSIS' | 'DECISION_ANALYSIS' | 'CONTEXT_INTEGRATION' | 'CONTEXT_AWARENESS';

// Extend the AnalysisGoalType enum with new values
const ExtendedGoalType = {
  ...AnalysisGoalType,
  PARTICIPANT_ENGAGEMENT: 'PARTICIPANT_ENGAGEMENT',
  DECISION_TRACKING: 'DECISION_TRACKING',
  CONTEXT_AWARE_ANALYSIS: 'CONTEXT_AWARE_ANALYSIS'
} as const;

// Define extended analysis goal types
const ExtendedAnalysisGoalType = {
  ...AnalysisGoalType,
  COORDINATE: 'COORDINATE',
  ANALYZE_PARTICIPATION: 'ANALYZE_PARTICIPATION',
  INTEGRATE_CONTEXT: 'INTEGRATE_CONTEXT'
} as const;

// Create a derived type for the extended enum
type ExtendedGoalType = keyof typeof ExtendedGoalType;

/**
 * Maps specialties to the appropriate agent classes
 */
const expertiseAgentMap = {
  [AgentExpertise.TOPIC_ANALYSIS]: TopicAnalysisAgent,
  [AgentExpertise.ACTION_ITEM_EXTRACTION]: ActionItemSpecialistAgent,
  [AgentExpertise.SUMMARY_GENERATION]: SummarySynthesisAgent,
  [AgentExpertise.SENTIMENT_ANALYSIS]: SentimentAnalysisAgent,
  [ExtendedAgentExpertise.PARTICIPATION_ANALYSIS]: ParticipantDynamicsAgent,
  [ExtendedAgentExpertise.DECISION_ANALYSIS]: DecisionAnalysisAgent,
  [ExtendedAgentExpertise.CONTEXT_INTEGRATION]: ContextIntegrationAgent,
  [ExtendedAgentExpertise.CONTEXT_AWARENESS]: MeetingContextAgent
};

/**
 * Maps expertise areas to the appropriate manager areas
 */
const expertiseManagerMap: Record<string, string> = {
  [AgentExpertise.TOPIC_ANALYSIS]: 'TopicTeam',
  [AgentExpertise.ACTION_ITEM_EXTRACTION]: 'ActionTeam',
  [AgentExpertise.SUMMARY_GENERATION]: 'SummaryTeam',
  [AgentExpertise.SENTIMENT_ANALYSIS]: 'SentimentTeam',
  [ExtendedAgentExpertise.PARTICIPATION_ANALYSIS]: 'ParticipationTeam',
  [ExtendedAgentExpertise.DECISION_ANALYSIS]: 'DecisionTeam',
  [ExtendedAgentExpertise.CONTEXT_INTEGRATION]: 'ContextTeam',
  [ExtendedAgentExpertise.CONTEXT_AWARENESS]: 'ContextTeam',
  [AgentExpertise.MANAGEMENT]: 'SupervisorTeam',
  'TOOL_USE': 'ToolTeam' // Use string literal instead of enum
};

/**
 * Options for creating a hierarchical team
 */
export interface HierarchicalTeamOptions {
  debugMode?: boolean;
  analysisGoal?: ExtendedGoalType;
  enabledExpertise?: ExtendedExpertise[];
  maxWorkers?: number;
  maxManagers?: number;
  preferredWorkersByArea?: Record<ExtendedExpertise, string[]>;
  useMockMode?: boolean;
  logger?: Logger;
  openAiConnector?: OpenAIConnector;
  meetingId?: string;
  organizationId?: string;
  enableRAG?: boolean;
  ragOptions?: {
    useConversationMemory?: boolean;
    maxContextLength?: number;
    defaultPromptTemplate?: string;
    indexName?: string;
  };
}

/**
 * Result from team creation
 */
export interface HierarchicalTeamResult {
  supervisor: EnhancedSupervisorAgent;
  managers: AnalysisManagerAgent[];
  workers: SpecialistWorkerAgent[];
  teamMap: Map<ExtendedExpertise, {
    manager: AnalysisManagerAgent;
    workers: SpecialistWorkerAgent[];
  }>;
  ragService?: UnifiedRAGService;
}

/**
 * Create a hierarchical agent team structure
 */
export async function createHierarchicalAgentTeam(options: HierarchicalTeamOptions = {}): Promise<HierarchicalTeamResult> {
  const logger = options.logger || new ConsoleLogger();
  
  // Get configuration from the config service
  const configService = AgentConfigService.getInstance();
  
  try {
    logger.info(`Creating hierarchical team with options: ${JSON.stringify({
      debugMode: options.debugMode,
      analysisGoal: options.analysisGoal,
      enabledExpertise: options.enabledExpertise,
      maxWorkers: options.maxWorkers,
      maxManagers: options.maxManagers,
      enableRAG: options.enableRAG,
      meetingId: options.meetingId
    })}`);
    
    // Determine if we should use mock mode
    const useMockMode = options.useMockMode ?? configService.isMockModeEnabled();
    
    // Initialize OpenAI connector if needed
    const openAiConnector = options.openAiConnector || new OpenAIConnector({
      logger,
      modelConfig: configService.getOpenAIConfig()
    });
    
    logger.info(`Creating hierarchical agent team with mock mode ${useMockMode ? 'enabled' : 'disabled'}`);
    
    if (useMockMode) {
      return createMockAgentTeam(options);
    } else {
      return await createRealAgentTeam(options, logger, openAiConnector);
    }
  } catch (error: any) {
    // Enhanced error logging with details
    const errorDetails = {
      message: error.message || 'Unknown error creating hierarchical team',
      stack: error.stack,
      name: error.name,
      code: error.code,
      options: {
        debugMode: options.debugMode,
        analysisGoal: options.analysisGoal,
        enabledExpertiseCount: options.enabledExpertise?.length,
        useMockMode: options.useMockMode,
        enableRAG: options.enableRAG
      }
    };
    
    logger.error(`Error creating hierarchical team: ${errorDetails.message}`, { error: errorDetails });
    
    // Create and throw an enhanced error with more context
    const enhancedError = new Error(`Failed to create hierarchical agent team: ${error.message}`);
    (enhancedError as any).originalError = error;
    (enhancedError as any).teamCreationOptions = {
      debugMode: options.debugMode,
      analysisGoal: options.analysisGoal,
      enabledExpertise: options.enabledExpertise,
      meetingId: options.meetingId
    };
    
    throw enhancedError;
  }
}

/**
 * Create a real implementation of the hierarchical agent team
 */
async function createRealAgentTeam(
  options: HierarchicalTeamOptions,
  logger: Logger,
  openAiConnector: OpenAIConnector
): Promise<HierarchicalTeamResult> {
  // Variables that we want to access in the catch block need to be defined outside the try block
  let ragService: UnifiedRAGService | undefined;
  let supervisor: EnhancedSupervisorAgent;
  let managers: AnalysisManagerAgent[] = [];
  let workers: SpecialistWorkerAgent[] = [];
  let teamMap = new Map<ExtendedExpertise, {
    manager: AnalysisManagerAgent;
    workers: SpecialistWorkerAgent[];
  }>();
  
  try {
    logger.info(`Starting createRealAgentTeam with options: ${JSON.stringify({
      debugMode: options.debugMode,
      analysisGoal: options.analysisGoal,
      enabledExpertiseCount: options.enabledExpertise ? options.enabledExpertise.length : 0
    })}`);
    
    // Initialize RAG components if enabled
    if (options.enableRAG) {
      logger.info('Initializing RAG components for context-aware analysis');
      
      // Create context providers
      const meetingContextProvider = new MeetingContextProvider({
        logger,
        openAiConnector,
        indexName: options.ragOptions?.indexName
      });
      
      const documentContextProvider = new DocumentContextProvider({
        logger,
        openAiConnector
      });
      
      // Set up conversation memory if requested
      let conversationMemory: ConversationMemoryService | undefined;
      
      if (options.ragOptions?.useConversationMemory) {
        conversationMemory = new ConversationMemoryService({
          logger,
          openAiConnector
        });
        
        logger.info('Conversation memory system initialized');
      }
      
      // Create unified RAG service
      ragService = new UnifiedRAGService({
        logger,
        openAiConnector,
        contextProviders: {
          meeting_transcript: meetingContextProvider,
          document: documentContextProvider
        },
        conversationMemory
      });
      
      logger.info('RAG service initialized successfully');
    }
    
    // Create supervisor agent
    const supervisorId = `supervisor-${uuidv4().slice(0, 8)}`;
    // Create supervisor with proper config
    const supervisor = new EnhancedSupervisorAgent({
      id: supervisorId,
      name: "Analysis Supervisor",
      expertise: [AgentExpertise.MANAGEMENT],
      capabilities: [ExtendedAnalysisGoalType.COORDINATE as AnalysisGoalType],
      logger,
      openAiConnector,
      useMockMode: false
    });
    
    logger.info(`Initialized real Analysis Supervisor agent with ID: ${supervisorId}`);
    
    // Determine which expertise areas to include
    const defaultExpertise = [
      AgentExpertise.TOPIC_ANALYSIS,
      AgentExpertise.ACTION_ITEM_EXTRACTION,
      AgentExpertise.SUMMARY_GENERATION,
      AgentExpertise.SENTIMENT_ANALYSIS,
    ];
    
    logger.info(`Default expertise array: ${defaultExpertise.join(', ')}`);
    
    // Normalize expertise values or use defaults
    let enabledExpertise: ExtendedExpertise[];
    if (options.enabledExpertise && options.enabledExpertise.length > 0) {
      logger.info(`Normalizing provided expertise: ${options.enabledExpertise.join(', ')}`);
      enabledExpertise = options.enabledExpertise.map(exp => {
        const normalized = normalizeExpertise(exp as string);
        logger.info(`Normalized expertise ${exp} to ${normalized}`);
        return normalized;
      });
    } else {
      logger.info('Using default expertise values');
      enabledExpertise = defaultExpertise;
    }
    
    logger.info(`Final expertise array: ${enabledExpertise.join(', ')}`);
    
    // Create manager and workers for each expertise area
    for (const expertise of enabledExpertise) {
      logger.info(`Creating manager and workers for expertise: ${expertise}`);
      
      // Create manager
      const managerId = `manager-${expertise}-${uuidv4().slice(0, 8)}`;
      // Create manager with proper config
      const manager = new AnalysisManagerAgent({
        id: managerId,
        name: `${expertise} Manager`,
        expertiseAreas: [expertise as AgentExpertise],
        supervisorId,
        managedExpertise: [expertise as AgentExpertise],
        capabilities: [mapExpertiseToGoalType(expertise as AgentExpertise)],
        logger,
        openAiConnector,
        useMockMode: false
      });
      
      logger.info(`Created manager with ID: ${managerId}`);
      managers.push(manager);
      
      // Create workers for this expertise area
      const workersForManager: SpecialistWorkerAgent[] = [];
      const workerCount = Math.min(options.maxWorkers || 2, 2); // Max 2 workers per expertise area
      
      logger.info(`Creating ${workerCount} workers for expertise: ${expertise}`);
      
      for (let i = 0; i < workerCount; i++) {
        const workerId = `worker-${expertise}-${i}-${uuidv4().slice(0, 8)}`;
        let worker: SpecialistWorkerAgent;
        
        logger.info(`Creating worker ${i+1} with ID: ${workerId}`);
        
        // Create specific worker type based on expertise
        try {
          switch (expertise) {
            case AgentExpertise.TOPIC_ANALYSIS:
              logger.info(`Creating TopicAnalysisAgent worker`);
              // Using TopicAnalysisAgent with proper typing
              const topicAgent = new TopicAnalysisAgent({
                id: workerId,
                name: `Topic Analysis Worker ${i+1}`,
                expertise: [expertise as AgentExpertise],
                capabilities: [AnalysisGoalType.EXTRACT_TOPICS],
                managerId,
                logger,
                openAiConnector,
                useMockMode: false
              });
              
              // Add required SpecialistWorkerAgent properties
              extendSpecialistAgent(topicAgent, managerId, AgentExpertise.TOPIC_ANALYSIS);
              
              // Properly typecast with unknown first
              worker = topicAgent as unknown as SpecialistWorkerAgent;
              break;
              
            case AgentExpertise.ACTION_ITEM_EXTRACTION:
              logger.info(`Creating ActionItemSpecialistAgent worker`);
              const actionItemAgent = new ActionItemSpecialistAgent({
                id: workerId,
                name: `Action Item Worker ${i+1}`,
                logger,
                llm: new ChatOpenAI({
                  modelName: 'gpt-4',
                  temperature: 0.2
                })
              });
              
              // Add required SpecialistWorkerAgent properties
              extendSpecialistAgent(actionItemAgent, managerId, AgentExpertise.ACTION_ITEM_EXTRACTION);
              
              // Properly typecast with unknown first
              worker = actionItemAgent as unknown as SpecialistWorkerAgent;
              break;
              
            case AgentExpertise.SUMMARY_GENERATION:
              logger.info(`Creating SummarySynthesisAgent worker`);
              const summaryAgent = new SummarySynthesisAgent({
                id: workerId,
                name: `Summary Worker ${i+1}`,
                logger,
                llm: new ChatOpenAI({
                  modelName: 'gpt-4',
                  temperature: 0.2
                })
              });
              
              // Add required SpecialistWorkerAgent properties
              extendSpecialistAgent(summaryAgent, managerId, AgentExpertise.SUMMARY_GENERATION);
              
              // Properly typecast with unknown first
              worker = summaryAgent as unknown as SpecialistWorkerAgent;
              break;
              
            case AgentExpertise.SENTIMENT_ANALYSIS:
              logger.info(`Creating SentimentAnalysis worker`);
              const sentimentAgent = new SentimentAnalysisAgent({
                id: workerId,
                name: `Sentiment Analysis Worker ${i+1}`,
                logger,
                llm: new ChatOpenAI({
                  modelName: 'gpt-4',
                  temperature: 0.3
                })
              });
              
              // Add required SpecialistWorkerAgent properties
              extendSpecialistAgent(sentimentAgent, managerId, AgentExpertise.SENTIMENT_ANALYSIS);
              
              // Properly typecast with unknown first
              worker = sentimentAgent as unknown as SpecialistWorkerAgent;
              break;
              
            case AgentExpertise.PARTICIPANT_DYNAMICS:
              logger.info(`Creating ParticipantDynamics worker`);
              // This handles both PARTICIPANT_DYNAMICS and the extended PARTICIPATION_ANALYSIS
              const participantAgent = new ParticipantDynamicsAgent({
                id: workerId,
                name: `Participant Analysis Worker ${i+1}`,
                logger,
                llm: new ChatOpenAI({
                  modelName: 'gpt-4',
                  temperature: 0.2
                })
              });
              
              // Add required SpecialistWorkerAgent properties
              extendSpecialistAgent(participantAgent, managerId, AgentExpertise.PARTICIPANT_DYNAMICS);
              
              // Properly typecast with unknown first
              worker = participantAgent as unknown as SpecialistWorkerAgent;
              break;
              
            case AgentExpertise.DECISION_TRACKING:
              logger.info(`Creating DecisionAnalysis worker`);
              // This handles both DECISION_TRACKING and the extended DECISION_ANALYSIS
              const decisionAgent = new DecisionAnalysisAgent({
                id: workerId,
                name: `Decision Analysis Worker ${i+1}`,
                logger,
                llm: new ChatOpenAI({
                  modelName: 'gpt-4',
                  temperature: 0.2
                })
              });
              
              // Add required SpecialistWorkerAgent properties
              extendSpecialistAgent(decisionAgent, managerId, AgentExpertise.DECISION_TRACKING);
              
              // Properly typecast with unknown first
              worker = decisionAgent as unknown as SpecialistWorkerAgent;
              break;
              
            default:
              logger.info(`Creating generic worker for ${expertise}`);
              // Generic worker for other expertise types
              worker = new SpecialistWorkerAgent({
                id: workerId,
                name: `${expertise} Worker ${i+1}`,
                expertise: [expertise as AgentExpertise],
                managerId,
                logger,
                openAiConnector,
                useMockMode: false
              });
          }
          
          logger.info(`Successfully created worker with ID: ${workerId}`);
          workersForManager.push(worker);
          workers.push(worker);
        } catch (error) {
          logger.error(`Error creating worker for ${expertise}: ${error instanceof Error ? error.message : String(error)}`);
          if (error instanceof Error && error.stack) {
            logger.error(`Stack trace: ${error.stack}`);
          }
          throw error;
        }
      }
      
      // Store team mapping
      logger.info(`Storing team mapping for expertise: ${expertise}`);
      teamMap.set(expertise as ExtendedExpertise, {
        manager,
        workers: workersForManager
      });
    }
    
    // Create context integration agent
    if (enabledExpertise.includes(AgentExpertise.CONTEXT_INTEGRATION)) {
      // First check for RAG context agent
      try {
        // Import RAG context agent
        const { RAGContextAgent } = await import('../agents/context/rag-context-agent');
        const { PineconeConnector } = await import('../../../connectors/pinecone-connector');
        
        // Create Pinecone connector
        const pineconeConnector = new PineconeConnector({
          logger,
          defaultNamespace: 'meeting-analysis'
        });
        
        // Initialize the connector
        await pineconeConnector.initialize();
        
        logger.info('Creating RAG Context Agent with Pinecone integration');
        
        // Create the agent with only properties supported by RAGContextAgentConfig
        const contextAgent = new RAGContextAgent({
          id: `worker-context_integration-${uuidv4().slice(0, 8)}`,
          name: 'RAG Context Integration Agent',
          openAiConnector: openAiConnector,
          pineconeConnector: pineconeConnector,
          logger,
          useMockMode: false
        });
        
        // Add required SpecialistWorkerAgent properties
        extendSpecialistAgent(contextAgent, managers[0].id, AgentExpertise.CONTEXT_INTEGRATION);
        
        // Add to workers list - properly extended to match the SpecialistWorkerAgent type
        const contextWorker = contextAgent as unknown as SpecialistWorkerAgent;
        workers.push(contextWorker);
        teamMap.set('CONTEXT_INTEGRATION' as ExtendedExpertise, {
          manager: managers[0],
          workers: [contextWorker]
        });
        
        logger.info('Successfully created RAG Context Integration Agent');
      } catch (error) {
        // If RAG context agent fails, fall back to standard context agent
        logger.warn('Failed to create RAG Context Agent, falling back to standard Context Integration Agent', {
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Use the actual ContextIntegrationAgent from import
        const contextAgent = new ContextIntegrationAgent({
          id: `worker-context_integration-${uuidv4().slice(0, 8)}`,
          name: 'Context Integration Agent',
          logger,
          llm: new ChatOpenAI({
            modelName: 'gpt-4',
            temperature: 0.2
          })
        });
        
        // Add required SpecialistWorkerAgent properties
        extendSpecialistAgent(contextAgent, managers[0].id, AgentExpertise.CONTEXT_INTEGRATION);
        
        // Add to workers list - properly extended
        const contextWorker = contextAgent as unknown as SpecialistWorkerAgent;
        workers.push(contextWorker);
        teamMap.set('CONTEXT_INTEGRATION' as ExtendedExpertise, {
          manager: managers[0],
          workers: [contextWorker]
        });
      }
    }
    
    // Handle special case for MeetingContextAgent with RAG capabilities
    if (enabledExpertise.includes('CONTEXT_AWARENESS') && ragService) {
      const workerId = `worker-${ExtendedAgentExpertise.CONTEXT_AWARENESS}-${uuidv4().slice(0, 8)}`;
      
      const contextAgent = new MeetingContextAgent({
        // id  : workerId,
        
        ragService,
        meetingId: options.meetingId,
        organizationId: options.organizationId,
        logger,
        openAIConnector: openAiConnector,
        agentConfig: {
          id: workerId,
          useConversationMemory: true,
          maxContextLength: 1000,
          defaultPromptTemplate: 'You are a helpful assistant that can answer questions about the meeting.',
          indexName: 'meeting-analysis',
          name: "Meeting Context Agent",
        }
      });
      
      // Fix workersForManager reference
      const workersForThisManager = teamMap.get('CONTEXT_AWARENESS' as ExtendedExpertise)?.workers || [];
      workersForThisManager.push(contextAgent as any as SpecialistWorkerAgent);
      workers.push(contextAgent as any as SpecialistWorkerAgent);
    }
    
    // Return the result when successfully completed
    const result: HierarchicalTeamResult = {
      supervisor,
      managers,
      workers,
      teamMap,
      ragService
    };
    
    logger.info(`Successfully created hierarchical team with ${managers.length} managers and ${workers.length} workers`);
    
    return result;
  } catch (error: any) {
    // Enhanced error logging with detailed diagnostic information
    const errorDetails: {
      message: string;
      stack?: string;
      name?: string;
      code?: string;
      phase: string;
      componentType: string;
      options: {
        analysisGoal?: any;
        enabledExpertise?: string;
        maxWorkers?: number;
        maxManagers?: number;
        enableRAG?: boolean;
      };
      currentState?: {
        hasRagService: boolean;
        managerCount: number;
        workerCount: number;
      };
    } = {
      message: error.message || 'Unknown error in createRealAgentTeam',
      stack: error.stack,
      name: error.name,
      code: error.code,
      phase: error.phase || 'unknown', // Additional context about which part of team creation failed
      componentType: error.componentType || 'unknown', // Which component was being created (supervisor, manager, worker)
      options: {
        analysisGoal: options.analysisGoal,
        enabledExpertise: options.enabledExpertise?.join(','),
        maxWorkers: options.maxWorkers,
        maxManagers: options.maxManagers,
        enableRAG: options.enableRAG
      }
    };
    
    logger.error(`Failed to create real agent team: ${errorDetails.message}`, { error: errorDetails });
    
    // Add phase information to help diagnose where in the process the failure occurred
    if (ragService) {
      errorDetails.phase = 'post_rag_initialization';
    }
    
    // Provide current team creation state for better debugging
    errorDetails.currentState = {
      hasRagService: !!ragService,
      managerCount: managers?.length || 0,
      workerCount: workers?.length || 0
    };
    
    // Rethrow with enhanced context
    const enhancedError = new Error(`Failed to create real agent team: ${error.message}`);
    (enhancedError as any).originalError = error;
    (enhancedError as any).phase = errorDetails.phase;
    (enhancedError as any).teamDetails = {
      analysisGoal: options.analysisGoal,
      enabledExpertise: options.enabledExpertise
    };
    
    throw enhancedError;
  }
}

/**
 * Helper function to normalize expertise values
 * Converts snake_case inputs (from API) to UPPER_SNAKE_CASE (for enum values)
 */
function normalizeExpertise(expertise: string | null | undefined): AgentExpertise {
  if (!expertise) {
    return AgentExpertise.TOPIC_ANALYSIS; // Default to topic analysis
  }
  
  // Simple mapping for common formats
  const mapping: Record<string, AgentExpertise> = {
    // Snake case formats from API
    'topic_analysis': AgentExpertise.TOPIC_ANALYSIS,
    'action_item_extraction': AgentExpertise.ACTION_ITEM_EXTRACTION,
    'summary_generation': AgentExpertise.SUMMARY_GENERATION,
    'sentiment_analysis': AgentExpertise.SENTIMENT_ANALYSIS,
    'participant_dynamics': AgentExpertise.PARTICIPANT_DYNAMICS,
    'decision_tracking': AgentExpertise.DECISION_TRACKING,
    'management': AgentExpertise.MANAGEMENT,
    // Uppercase formats (from enum)
    'TOPIC_ANALYSIS': AgentExpertise.TOPIC_ANALYSIS,
    'ACTION_ITEM_EXTRACTION': AgentExpertise.ACTION_ITEM_EXTRACTION,
    'SUMMARY_GENERATION': AgentExpertise.SUMMARY_GENERATION,
    'SENTIMENT_ANALYSIS': AgentExpertise.SENTIMENT_ANALYSIS,
    'PARTICIPANT_DYNAMICS': AgentExpertise.PARTICIPANT_DYNAMICS,
    'DECISION_TRACKING': AgentExpertise.DECISION_TRACKING,
    'MANAGEMENT': AgentExpertise.MANAGEMENT,
    // Handle extended types by mapping to standard types for compatibility
    'participation_analysis': AgentExpertise.PARTICIPANT_DYNAMICS,
    'PARTICIPATION_ANALYSIS': AgentExpertise.PARTICIPANT_DYNAMICS,
    'decision_analysis': AgentExpertise.DECISION_TRACKING,
    'DECISION_ANALYSIS': AgentExpertise.DECISION_TRACKING,
    'context_integration': AgentExpertise.SUMMARY_GENERATION,
    'CONTEXT_INTEGRATION': AgentExpertise.SUMMARY_GENERATION
  };
  
  return mapping[expertise] || AgentExpertise.TOPIC_ANALYSIS;
}

/**
 * Helper function to map expertise to analysis goal type
 */
function mapExpertiseToGoalType(expertise: AgentExpertise | string): AnalysisGoalType {
  switch (expertise) {
    case AgentExpertise.TOPIC_ANALYSIS:
      return AnalysisGoalType.EXTRACT_TOPICS;
    case AgentExpertise.ACTION_ITEM_EXTRACTION:
      return AnalysisGoalType.EXTRACT_ACTION_ITEMS;
    case AgentExpertise.DECISION_TRACKING:
      return AnalysisGoalType.EXTRACT_DECISIONS;
    case AgentExpertise.SENTIMENT_ANALYSIS:
      return AnalysisGoalType.ANALYZE_SENTIMENT;
    case ExtendedAgentExpertise.PARTICIPATION_ANALYSIS:
      return ExtendedAnalysisGoalType.ANALYZE_PARTICIPATION as AnalysisGoalType;
    case AgentExpertise.SUMMARY_GENERATION:
      return AnalysisGoalType.GENERATE_SUMMARY;
    case ExtendedAgentExpertise.CONTEXT_INTEGRATION:
      return ExtendedAnalysisGoalType.INTEGRATE_CONTEXT as AnalysisGoalType;
    default:
      return AnalysisGoalType.FULL_ANALYSIS;
  }
}

/**
 * Create a mock implementation of the hierarchical agent team for testing
 */
function createMockAgentTeam(options: HierarchicalTeamOptions): HierarchicalTeamResult {
  const logger = options.logger || new ConsoleLogger();
  
  // Create supervisor agent
  const supervisorId = `supervisor-${uuidv4().slice(0, 8)}`;
  
  // Create a mock supervisor but with extended properties
  const mockSupervisor = {
    id: supervisorId,
    name: "Analysis Supervisor",
    role: AgentRole.SUPERVISOR,
    capabilities: new Set<AnalysisGoalType>(),
    expertise: [AgentExpertise.MANAGEMENT],
    decideNextAgent: async ({ messages }: any) => {
      // Mock implementation for testing
      if (messages.length > 5) return "FINISH";
      return "TopicTeam";
    },
    initialize: async () => Promise.resolve(),
    handleRequest: async () => Promise.resolve({}),
    on: () => {},
    sendMessage: async () => Promise.resolve(),
    // Add required properties for EnhancedSupervisorAgent compatibility
    routerTool: {},
    maxManagersCount: 5,
    managerRegistry: new Map(),
    teamStructure: {},
    supervisorPrompt: "Mock supervisor prompt",
    instructionTemplates: {},
    processTask: async () => ({ content: {}, confidence: 0, timestamp: Date.now() })
  };
  
  // Cast to EnhancedSupervisorAgent
  const supervisor = mockSupervisor as unknown as EnhancedSupervisorAgent;
  
  logger.info(`Initialized mock Analysis Supervisor agent with ID: ${supervisorId}`);
  
  // Determine which expertise areas to include
  const managedExpertiseAreas = options.enabledExpertise || [
    AgentExpertise.TOPIC_ANALYSIS,
    AgentExpertise.ACTION_ITEM_EXTRACTION,
    AgentExpertise.SUMMARY_GENERATION
  ];
  
  const managers: AnalysisManagerAgent[] = [];
  const workers: SpecialistWorkerAgent[] = [];
  const teamMap = new Map<ExtendedExpertise, {
    manager: AnalysisManagerAgent;
    workers: SpecialistWorkerAgent[];
  }>();
  
  // Create one manager per expertise area
  for (const expertise of managedExpertiseAreas) {
    const managerId = `manager-${expertise}-${uuidv4().slice(0, 8)}`;
    
    // Create mock manager with extended properties
    const mockManager = {
      id: managerId,
      name: `${expertise} Manager`,
      role: AgentRole.MANAGER,
      managedExpertise: [expertise],
      expertise: [expertise, AgentExpertise.MANAGEMENT],
      capabilities: new Set<AnalysisGoalType>(),
      getAvailableWorkers: async () => [],
      initialize: async () => Promise.resolve(),
      on: () => {},
      sendMessage: async () => Promise.resolve(),
      // Add required properties for AnalysisManagerAgent compatibility
      managedAgents: [],
      supervisorId,
      activeWorkers: new Map(),
      assignedTasks: new Map(),
      processTask: async () => ({ content: {}, confidence: 0, timestamp: Date.now() })
    };
    
    // Cast to AnalysisManagerAgent
    const manager = mockManager as unknown as AnalysisManagerAgent;
    
    managers.push(manager);
    
    // Create 2 workers for this manager
    const workersForManager: SpecialistWorkerAgent[] = [];
    for (let i = 0; i < 2; i++) {
      const workerId = `worker-${expertise}-${i}-${uuidv4().slice(0, 8)}`;
      
      // Create mock worker with extended properties
      const mockWorker = {
        id: workerId,
        name: `${expertise} Worker ${i+1}`,
        role: AgentRole.WORKER,
        expertise: [expertise],
        managerId,
        capabilities: new Set<AnalysisGoalType>(),
        initialize: async () => Promise.resolve(),
        on: () => {},
        sendMessage: async () => Promise.resolve(),
        // Add required properties for SpecialistWorkerAgent compatibility
        primaryExpertise: expertise,
        activeTask: null,
        analysisResults: new Map(),
        handleRequest: async () => Promise.resolve(),
        processTask: async () => ({ content: {}, confidence: 0, timestamp: Date.now() }),
        analyzeTranscriptSegment: async () => ({ content: {}, confidence: 0, timestamp: Date.now() }),
        mergeAnalyses: async () => ({ content: {}, confidence: 0, timestamp: Date.now() }),
        prioritizeInformation: async (info: any) => info
      };
      
      // Cast to SpecialistWorkerAgent
      const worker = mockWorker as unknown as SpecialistWorkerAgent;
      
      workersForManager.push(worker);
      workers.push(worker);
    }
    
    // Store team mapping
    teamMap.set(expertise as ExtendedExpertise, {
      manager,
      workers: workersForManager
    });
  }
  
  return {
    supervisor,
    managers,
    workers,
    teamMap
  };
} 