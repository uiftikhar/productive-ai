/**
 * Factory for creating hierarchical agent teams
 * Simplified mock version for testing purposes
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

/**
 * Options for creating a hierarchical team
 */
export interface HierarchicalTeamOptions {
  debugMode?: boolean;
  analysisGoal?: AnalysisGoalType;
  enabledExpertise?: AgentExpertise[];
  maxWorkers?: number;
  maxManagers?: number;
  preferredWorkersByArea?: Record<AgentExpertise, string[]>;
}

/**
 * Result from team creation
 */
export interface HierarchicalTeamResult {
  supervisor: EnhancedSupervisorAgent;
  managers: AnalysisManagerAgent[];
  workers: SpecialistWorkerAgent[];
  teamMap: Map<AgentExpertise, {
    manager: AnalysisManagerAgent;
    workers: SpecialistWorkerAgent[];
  }>;
}

/**
 * Create a hierarchical agent team structure
 */
export function createHierarchicalAgentTeam(options: HierarchicalTeamOptions = {}): HierarchicalTeamResult {
  const logger = new ConsoleLogger();
  
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
  
  logger.info(`Initialized Analysis Supervisor agent with ID: ${supervisorId}`);
  
  // Create manager agents
  const managedExpertiseAreas = [
    AgentExpertise.TOPIC_ANALYSIS,
    AgentExpertise.ACTION_ITEM_EXTRACTION,
    AgentExpertise.SUMMARY_GENERATION
  ];
  
  const managers: AnalysisManagerAgent[] = [];
  const workers: SpecialistWorkerAgent[] = [];
  const teamMap = new Map<AgentExpertise, {
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