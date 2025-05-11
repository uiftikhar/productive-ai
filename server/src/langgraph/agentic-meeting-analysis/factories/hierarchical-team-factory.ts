/**
 * Factory for creating hierarchical agent teams
 */
import { v4 as uuidv4 } from 'uuid';
import { 
  AgentExpertise, 
  AgentRole, 
  AnalysisGoalType 
} from '../interfaces/agent.interface';
import { EnhancedSupervisorAgent } from '../agents/coordinator/enhanced-supervisor-agent';
import { AnalysisManagerAgent } from '../agents/manager/analysis-manager-agent';
import { SpecialistWorkerAgent } from '../agents/workers/specialist-worker-agent';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { Logger } from '../../../shared/logger/logger.interface';
import { AgentConfigService } from '../../../shared/config/agent-config.service';
import { OpenAIConnector } from '../../../connectors/openai-connector';

// Import worker agent implementations
import { TopicAnalysisAgent } from '../agents/topic/topic-analysis-agent';
// Mock implementations for missing agents - these would need to be implemented
// or corrected import paths would need to be provided
const ActionItemExtractionAgent = SpecialistWorkerAgent;
const SummarySynthesisAgent = SpecialistWorkerAgent;
const SentimentAnalysisAgent = SpecialistWorkerAgent;
const ParticipantDynamicsAgent = SpecialistWorkerAgent;
const DecisionDetectionAgent = SpecialistWorkerAgent;
const ContextIntegrationAgent = SpecialistWorkerAgent;

// Define extended enum values as string constants
// This avoids modifying the original enum objects
const ExtendedAgentExpertise = {
  ...AgentExpertise,
  PARTICIPATION_ANALYSIS: 'PARTICIPATION_ANALYSIS',
  DECISION_ANALYSIS: 'DECISION_ANALYSIS',
  CONTEXT_INTEGRATION: 'CONTEXT_INTEGRATION',
} as const;

// Define extended analysis goal types
const ExtendedAnalysisGoalType = {
  ...AnalysisGoalType,
  COORDINATE: 'COORDINATE',
  MANAGE_TEAM: 'MANAGE_TEAM', 
  ANALYZE_PARTICIPATION: 'ANALYZE_PARTICIPATION',
  EXTRACT_DECISIONS: 'EXTRACT_DECISIONS',
  INTEGRATE_CONTEXT: 'INTEGRATE_CONTEXT',
} as const;

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

// Type for both original and extended expertise values
type ExtendedExpertise = AgentExpertise | 
  typeof ExtendedAgentExpertise.PARTICIPATION_ANALYSIS | 
  typeof ExtendedAgentExpertise.DECISION_ANALYSIS | 
  typeof ExtendedAgentExpertise.CONTEXT_INTEGRATION;

// Type for both original and extended goal types
type ExtendedGoalType = AnalysisGoalType | 
  typeof ExtendedAnalysisGoalType.COORDINATE | 
  typeof ExtendedAnalysisGoalType.MANAGE_TEAM |
  typeof ExtendedAnalysisGoalType.ANALYZE_PARTICIPATION |
  typeof ExtendedAnalysisGoalType.EXTRACT_DECISIONS |
  typeof ExtendedAnalysisGoalType.INTEGRATE_CONTEXT;

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
}

/**
 * Create a hierarchical agent team structure
 */
export function createHierarchicalAgentTeam(options: HierarchicalTeamOptions = {}): HierarchicalTeamResult {
  const logger = options.logger || new ConsoleLogger();
  
  // Get configuration from the config service
  const configService = AgentConfigService.getInstance();
  
  try {
    logger.info(`Creating hierarchical team with options: ${JSON.stringify({
      debugMode: options.debugMode,
      analysisGoal: options.analysisGoal,
      enabledExpertise: options.enabledExpertise,
      maxWorkers: options.maxWorkers,
      maxManagers: options.maxManagers
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
      return createRealAgentTeam(options, logger, openAiConnector);
    }
  } catch (error) {
    logger.error(`Error creating hierarchical team: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      logger.error(`Stack trace: ${error.stack}`);
    }
    throw error;
  }
}

/**
 * Create a real implementation of the hierarchical agent team
 */
function createRealAgentTeam(
  options: HierarchicalTeamOptions,
  logger: Logger,
  openAiConnector: OpenAIConnector
): HierarchicalTeamResult {
  try {
    logger.info(`Starting createRealAgentTeam with options: ${JSON.stringify({
      debugMode: options.debugMode,
      analysisGoal: options.analysisGoal,
      enabledExpertiseCount: options.enabledExpertise ? options.enabledExpertise.length : 0
    })}`);
    
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
    let enabledExpertise;
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
    
    const managers: AnalysisManagerAgent[] = [];
    const workers: SpecialistWorkerAgent[] = [];
    const teamMap = new Map<ExtendedExpertise, {
      manager: AnalysisManagerAgent;
      workers: SpecialistWorkerAgent[];
    }>();
    
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
              // Cast to SpecialistWorkerAgent to satisfy the type requirement
              worker = topicAgent as unknown as SpecialistWorkerAgent;
              break;
              
            case AgentExpertise.ACTION_ITEM_EXTRACTION:
              logger.info(`Creating ActionItemExtraction worker`);
              // Using SpecialistWorkerAgent with proper config
              worker = new SpecialistWorkerAgent({
                id: workerId,
                name: `Action Item Worker ${i+1}`,
                expertise: [expertise as AgentExpertise],
                capabilities: [AnalysisGoalType.EXTRACT_ACTION_ITEMS],
                managerId,
                logger,
                openAiConnector,
                useMockMode: false
              });
              break;
              
            case AgentExpertise.SUMMARY_GENERATION:
              logger.info(`Creating SummaryGeneration worker`);
              worker = new SpecialistWorkerAgent({
                id: workerId,
                name: `Summary Worker ${i+1}`,
                expertise: [expertise as AgentExpertise],
                capabilities: [AnalysisGoalType.GENERATE_SUMMARY],
                managerId,
                logger,
                openAiConnector,
                useMockMode: false
              });
              break;
              
            case AgentExpertise.SENTIMENT_ANALYSIS:
              logger.info(`Creating SentimentAnalysis worker`);
              worker = new SpecialistWorkerAgent({
                id: workerId,
                name: `Sentiment Analysis Worker ${i+1}`,
                expertise: [expertise as AgentExpertise],
                capabilities: [AnalysisGoalType.ANALYZE_SENTIMENT],
                managerId,
                logger,
                openAiConnector,
                useMockMode: false
              });
              break;
              
            case AgentExpertise.PARTICIPANT_DYNAMICS:
              logger.info(`Creating ParticipantDynamics worker`);
              // This handles both PARTICIPANT_DYNAMICS and the extended PARTICIPATION_ANALYSIS
              worker = new SpecialistWorkerAgent({
                id: workerId,
                name: `Participant Analysis Worker ${i+1}`,
                expertise: [expertise as AgentExpertise],
                capabilities: [AnalysisGoalType.ANALYZE_PARTICIPATION],
                managerId,
                logger,
                openAiConnector,
                useMockMode: false
              });
              break;
              
            case AgentExpertise.DECISION_TRACKING:
              logger.info(`Creating DecisionTracking worker`);
              // This handles both DECISION_TRACKING and the extended DECISION_ANALYSIS
              worker = new SpecialistWorkerAgent({
                id: workerId,
                name: `Decision Analysis Worker ${i+1}`,
                expertise: [expertise as AgentExpertise],
                capabilities: [AnalysisGoalType.EXTRACT_DECISIONS],
                managerId,
                logger,
                openAiConnector,
                useMockMode: false
              });
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
      teamMap.set(expertise, {
        manager,
        workers: workersForManager
      });
    }
    
    logger.info(`Successfully created hierarchical team with ${managers.length} managers and ${workers.length} workers`);
    
    return {
      supervisor,
      managers,
      workers,
      teamMap
    };
  } catch (error) {
    logger.error(`Error in createRealAgentTeam: ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      logger.error(`Stack trace: ${error.stack}`);
    }
    throw error;
  }
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
  const supervisor = {
    id: supervisorId,
    name: "Analysis Supervisor",
    role: AgentRole.SUPERVISOR,
    capabilities: [],
    expertise: [AgentExpertise.MANAGEMENT],
    decideNextAgent: async ({ messages }: any) => {
      // Mock implementation for testing
      if (messages.length > 5) return "FINISH";
      return "TopicTeam";
    },
    initialize: async () => Promise.resolve(),
    handleRequest: async () => Promise.resolve(),
    on: () => {},
    sendMessage: async () => Promise.resolve()
  } as unknown as EnhancedSupervisorAgent;
  
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
    const manager = {
      id: managerId,
      name: `${expertise} Manager`,
      role: AgentRole.MANAGER,
      managedExpertise: [expertise],
      expertise: [expertise, AgentExpertise.MANAGEMENT],
      capabilities: [],
      getAvailableWorkers: async () => {
        // Mock implementation returning worker IDs
        return workersForManager.map(w => w.id);
      },
      initialize: async () => Promise.resolve(),
      on: () => {},
      sendMessage: async () => Promise.resolve()
    } as unknown as AnalysisManagerAgent;
    
    managers.push(manager);
    
    // Create 2 workers for this manager
    const workersForManager: SpecialistWorkerAgent[] = [];
    for (let i = 0; i < 2; i++) {
      const workerId = `worker-${expertise}-${i}-${uuidv4().slice(0, 8)}`;
      const worker = {
        id: workerId,
        name: `${expertise} Worker ${i+1}`,
        role: AgentRole.WORKER,
        expertise: [expertise],
        managerId,
        capabilities: [],
        initialize: async () => Promise.resolve(),
        on: () => {},
        sendMessage: async () => Promise.resolve()
      } as unknown as SpecialistWorkerAgent;
      
      workersForManager.push(worker);
      workers.push(worker);
    }
    
    // Store team mapping
    teamMap.set(expertise, {
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