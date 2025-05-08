/**
 * Factory for creating hierarchical agent teams for meeting analysis
 * 
 * This factory creates a complete hierarchical team structure with
 * supervisor, managers, and workers for meeting analysis tasks.
 */
import { v4 as uuidv4 } from 'uuid';
import { ChatOpenAI } from '@langchain/openai';
import { AgentExpertise, AnalysisGoalType } from '../interfaces/agent.interface';
import { EnhancedSupervisorAgent } from '../agents/coordinator/enhanced-supervisor-agent';
import { AnalysisManagerAgent } from '../agents/manager/analysis-manager-agent';
import { SpecialistWorkerAgent } from '../agents/workers/specialist-worker-agent';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { LogLevel } from '../../../shared/logger/logger.interface';

/**
 * Configuration options for the hierarchical team factory
 */
export interface HierarchicalTeamFactoryConfig {
  llmConfig?: {
    model?: string;
    temperature?: number;
  };
  debugMode?: boolean;
  analysisGoal?: AnalysisGoalType;
  enabledExpertise?: AgentExpertise[];
}

/**
 * Team structure containing all the agents
 */
export interface HierarchicalTeamStructure {
  supervisor: EnhancedSupervisorAgent;
  managers: AnalysisManagerAgent[];
  workers: SpecialistWorkerAgent[];
  teamMap: Map<AgentExpertise, {
    manager: AnalysisManagerAgent;
    workers: SpecialistWorkerAgent[];
  }>;
}

/**
 * Create a complete hierarchical agent team for meeting analysis
 */
export function createHierarchicalAgentTeam(
  config: HierarchicalTeamFactoryConfig = {}
): HierarchicalTeamStructure {
  // Set up LLM
  const model = config.llmConfig?.model || 'gpt-4-turbo';
  const temperature = config.llmConfig?.temperature ?? 0.2;
  
  const llm = new ChatOpenAI({
    modelName: model,
    temperature,
  });
  
  // Create logger
  const logger = new ConsoleLogger();
  logger.setLogLevel(config.debugMode ? 'debug' : 'info' as LogLevel);
  
  // Determine which expertise areas to enable
  const enabledExpertise = config.enabledExpertise || [
    AgentExpertise.TOPIC_ANALYSIS,
    AgentExpertise.ACTION_ITEM_EXTRACTION,
    AgentExpertise.DECISION_TRACKING,
    AgentExpertise.SUMMARY_GENERATION,
    AgentExpertise.SENTIMENT_ANALYSIS,
  ];
  
  // Create supervisor agent
  const supervisor = new EnhancedSupervisorAgent({
    id: `supervisor-${uuidv4()}`,
    name: 'Analysis Supervisor',
    logger,
    llm,
    maxTeamSize: 10,
    maxManagersCount: 5,
  });
  
  // Define expertise groups for managers
  const expertiseGroups: Record<string, AgentExpertise[]> = {
    'TopicManager': [
      AgentExpertise.TOPIC_ANALYSIS,
      AgentExpertise.CONTEXT_INTEGRATION,
    ],
    'ActionManager': [
      AgentExpertise.ACTION_ITEM_EXTRACTION,
      AgentExpertise.DECISION_TRACKING,
    ],
    'PerceptionManager': [
      AgentExpertise.SENTIMENT_ANALYSIS,
      AgentExpertise.PARTICIPANT_DYNAMICS,
    ],
    'SummaryManager': [
      AgentExpertise.SUMMARY_GENERATION,
    ],
  };
  
  // Create manager agents
  const managers: AnalysisManagerAgent[] = [];
  
  for (const [managerName, expertiseList] of Object.entries(expertiseGroups)) {
    // Only create managers for enabled expertise
    const relevantExpertise = expertiseList.filter(exp => 
      enabledExpertise.includes(exp)
    );
    
    if (relevantExpertise.length === 0) {
      continue;
    }
    
    const manager = new AnalysisManagerAgent({
      id: `manager-${uuidv4()}`,
      name: managerName,
      logger,
      llm,
      expertiseAreas: relevantExpertise,
      supervisorId: supervisor.id,
      maxWorkers: 3,
    });
    
    managers.push(manager);
  }
  
  // Create worker agents
  const workers: SpecialistWorkerAgent[] = [];
  const teamMap = new Map<AgentExpertise, {
    manager: AnalysisManagerAgent;
    workers: SpecialistWorkerAgent[];
  }>();
  
  // Map to track workers per manager
  const managerWorkers: Record<string, SpecialistWorkerAgent[]> = {};
  
  // Create specialized workers for each expertise area
  for (const expertise of enabledExpertise) {
    // Find a manager for this expertise
    const manager = managers.find(m => m.managedExpertise.includes(expertise));
    
    if (!manager) {
      logger.warn(`No manager found for expertise: ${expertise}`);
      continue;
    }
    
    // Initialize manager's worker list if not exists
    if (!managerWorkers[manager.id]) {
      managerWorkers[manager.id] = [];
    }
    
    // Create 1-2 workers per expertise area
    const workerCount = expertise === AgentExpertise.SUMMARY_GENERATION ? 1 : 2;
    
    for (let i = 0; i < workerCount; i++) {
      const worker = new SpecialistWorkerAgent({
        id: `worker-${expertise}-${i}-${uuidv4()}`,
        name: `${expertise.replace('_', ' ')} Specialist ${i+1}`,
        logger,
        llm,
        expertise: [expertise],
        managerId: manager.id,
      });
      
      workers.push(worker);
      managerWorkers[manager.id].push(worker);
      
      // Update team map
      if (!teamMap.has(expertise)) {
        teamMap.set(expertise, { 
          manager, 
          workers: [] 
        });
      }
      
      teamMap.get(expertise)!.workers.push(worker);
    }
  }
  
  // Initialize agents
  void supervisor.initialize();
  
  for (const manager of managers) {
    void manager.initialize();
  }
  
  for (const worker of workers) {
    void worker.initialize();
  }
  
  return {
    supervisor,
    managers,
    workers,
    teamMap,
  };
} 