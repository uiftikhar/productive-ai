/**
 * Implementation of a hierarchical meeting analysis graph using LangGraph.
 * 
 * This implementation follows the hierarchical agent teams pattern from LangGraph,
 * with a supervisor agent coordinating managers who in turn coordinate workers.
 */
import { END } from '@langchain/langgraph';
import { ChatMessage } from '@langchain/core/messages';
import { AgentMessage } from '../interfaces/agent.interface';

import { EnhancedSupervisorAgent } from '../agents/coordinator/enhanced-supervisor-agent';
import { AnalysisManagerAgent } from '../agents/manager/analysis-manager-agent';
import { SpecialistWorkerAgent } from '../agents/workers/specialist-worker-agent';
import { AgentExpertise, AnalysisGoalType, AgentRole } from '../interfaces/agent.interface';
import { DynamicGraphState } from '../../dynamic/dynamic-graph.service';
import { 
  EnhancedDynamicGraphService, 
  EnhancedDynamicGraphState,
  EnhancedGraphNode, 
  EnhancedGraphEdge, 
  EnhancedGraph 
} from '../../dynamic/enhanced-dynamic-graph.service';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * Configuration options for hierarchical meeting analysis graph
 */
export interface HierarchicalMeetingAnalysisConfig {
  supervisorAgent: EnhancedSupervisorAgent;
  managerAgents: AnalysisManagerAgent[];
  workerAgents: SpecialistWorkerAgent[];
  analysisGoal?: AnalysisGoalType;
}

/**
 * Extended state for hierarchical analysis
 */
export interface HierarchicalAnalysisState extends EnhancedDynamicGraphState {
  messages: AgentMessage[];
  transcript: string;
  analysisGoal: AnalysisGoalType;
  teamStructure: {
    supervisor: string;
    managers: Record<string, string[]>;
  };
  currentNode: string;
  nextStep: string;
  results: Record<string, any>;
}

/**
 * Create a hierarchical meeting analysis graph using the EnhancedDynamicGraphService
 */
export function createHierarchicalMeetingAnalysisGraph(
  config: HierarchicalMeetingAnalysisConfig
): EnhancedGraph {
  // Initialize agents
  const supervisor = config.supervisorAgent;
  const managers = config.managerAgents;
  const workers = config.workerAgents;
  
  // Create logger
  const logger = new ConsoleLogger();
  
  // Define the initial nodes for the dynamic graph
  const initialNodes: EnhancedGraphNode[] = [];
  const initialEdges: EnhancedGraphEdge[] = [];
  
  // Create supervisor node
  const supervisorNode: EnhancedGraphNode = {
    id: 'supervisor',
    type: 'agent',
    label: 'Supervisor',
    metadata: {
      agentId: supervisor.id,
      role: AgentRole.SUPERVISOR
    },
    handler: async (state: HierarchicalAnalysisState) => {
      // Process with supervisor agent
      logger.info(`Processing supervisor node with agent: ${supervisor.id}`);
      
      // Convert ChatMessages to AgentMessages if needed
      const messages = state.messages || [];
      
      // Decide which agent/team should process next
      const nextAgent = await supervisor.decideNextAgent({ messages });
      
      // Create a new state based on the current state
      const newState = { ...state };
      
      if (nextAgent === "FINISH") {
        newState.currentNode = "FINISH";
        newState.nextStep = "FINISH";
      } else if (nextAgent.endsWith("Team")) {
        // Route to appropriate manager based on team
        const teamExpertise = mapTeamNameToExpertise(nextAgent);
        const managerId = findManagerForExpertise(managers, teamExpertise);
        
        if (managerId) {
          newState.currentNode = managerId;
          newState.nextStep = managerId;
        }
      } else {
        // Default: stay with supervisor
        newState.currentNode = "supervisor";
        newState.nextStep = "supervisor";
      }
      
      // Return the complete modified state
      return newState;
    }
  };
  
  initialNodes.push(supervisorNode);
  
  // Create manager nodes
  for (const manager of managers) {
    const managerNode: EnhancedGraphNode = {
      id: manager.id,
      type: 'agent',
      label: `Manager: ${manager.name}`,
      metadata: {
        agentId: manager.id,
        role: AgentRole.MANAGER,
        expertise: manager.managedExpertise
      },
      handler: async (state: HierarchicalAnalysisState) => {
        // Process with the manager agent
        logger.info(`Processing manager node with agent: ${manager.id}`);
        
        // Get available workers for this manager
        const workerIds = await manager.getAvailableWorkers();
        
        // Create a new state based on the current state
        const newState = { ...state };
        
        // In a real implementation, process assigned tasks and delegate to workers
        // For now, simulate completion and return to supervisor
        newState.currentNode = "supervisor";
        newState.nextStep = "supervisor";
        
        // Add results if needed
        newState.results = { 
          ...newState.results,
          [manager.id]: {
            processed: true,
            timestamp: Date.now()
          }
        };
        
        // Return the complete modified state
        return newState;
      }
    };
    
    initialNodes.push(managerNode);
    
    // Add edge from supervisor to manager
    const supervisorToManagerEdge: EnhancedGraphEdge = {
      id: `edge-supervisor-to-${manager.id}`,
      source: 'supervisor',
      target: manager.id,
      label: `Delegate to ${manager.name}`
    };
    
    initialEdges.push(supervisorToManagerEdge);
    
    // Add edge from manager back to supervisor
    const managerToSupervisorEdge: EnhancedGraphEdge = {
      id: `edge-${manager.id}-to-supervisor`,
      source: manager.id,
      target: 'supervisor',
      label: `Report to Supervisor`
    };
    
    initialEdges.push(managerToSupervisorEdge);
  }
  
  // Create worker nodes
  for (const worker of workers) {
    const workerNode: EnhancedGraphNode = {
      id: worker.id,
      type: 'agent',
      label: `Worker: ${worker.name}`,
      metadata: {
        agentId: worker.id,
        role: AgentRole.WORKER,
        expertise: worker.expertise
      },
      handler: async (state: HierarchicalAnalysisState) => {
        // Process with the worker agent
        logger.info(`Processing worker node with agent: ${worker.id}`);
        
        // Create a new state based on the current state
        const newState = { ...state };
        
        // Find manager for this worker
        const matchingManagerId = findManagerForWorker(managers, worker);
        
        if (matchingManagerId) {
          newState.currentNode = matchingManagerId;
          newState.nextStep = matchingManagerId;
        } else {
          // Default: return to supervisor if no manager found
          newState.currentNode = "supervisor";
          newState.nextStep = "supervisor";
        }
        
        // Add worker results
        newState.results = {
          ...newState.results,
          [worker.id]: {
            processed: true,
            timestamp: Date.now()
          }
        };
        
        // Return the complete modified state
        return newState;
      }
    };
    
    initialNodes.push(workerNode);
    
    // Find the manager for this worker
    const matchingManager = managers.find(manager => 
      worker.expertise.some(exp => manager.managedExpertise.includes(exp))
    );
    
    if (matchingManager) {
      // Add edge from manager to worker
      const managerToWorkerEdge: EnhancedGraphEdge = {
        id: `edge-${matchingManager.id}-to-${worker.id}`,
        source: matchingManager.id,
        target: worker.id,
        label: `Assign task to ${worker.name}`
      };
      
      initialEdges.push(managerToWorkerEdge);
      
      // Add edge from worker back to manager
      const workerToManagerEdge: EnhancedGraphEdge = {
        id: `edge-${worker.id}-to-${matchingManager.id}`,
        source: worker.id,
        target: matchingManager.id,
        label: `Report to ${matchingManager.name}`
      };
      
      initialEdges.push(workerToManagerEdge);
    }
  }
  
  // Add completion edge
  const completionEdge: EnhancedGraphEdge = {
    id: 'edge-completion',
    source: 'supervisor',
    target: END,
    condition: (state: HierarchicalAnalysisState) => state.currentNode === "FINISH"
  };
  
  initialEdges.push(completionEdge);
  
  // Create the enhanced dynamic graph service
  const graphService = new EnhancedDynamicGraphService<HierarchicalAnalysisState>({
    initialNodes,
    initialEdges,
    logger
  });
  
  // Create the enhanced graph
  const graph = graphService.createEnhancedGraph();
  
  return graph;
}

/**
 * Map a team name to the corresponding expertise
 */
function mapTeamNameToExpertise(teamName: string): AgentExpertise {
  switch (teamName) {
    case "TopicTeam":
      return AgentExpertise.TOPIC_ANALYSIS;
    case "ActionItemTeam":
      return AgentExpertise.ACTION_ITEM_EXTRACTION;
    case "SummaryTeam":
      return AgentExpertise.SUMMARY_GENERATION;
    case "SentimentTeam":
      return AgentExpertise.SENTIMENT_ANALYSIS;
    case "ResearchTeam":
      return AgentExpertise.CONTEXT_INTEGRATION;
    default:
      return AgentExpertise.TOPIC_ANALYSIS; // Default
  }
}

/**
 * Find a manager that handles a specific expertise
 */
function findManagerForExpertise(
  managers: AnalysisManagerAgent[], 
  expertise: AgentExpertise
): string | undefined {
  const manager = managers.find(m => m.managedExpertise.includes(expertise));
  return manager?.id;
}

/**
 * Find the manager for a specific worker
 */
function findManagerForWorker(
  managers: AnalysisManagerAgent[],
  worker: SpecialistWorkerAgent
): string | undefined {
  const manager = managers.find(m => 
    worker.expertise.some(exp => m.managedExpertise.includes(exp))
  );
  return manager?.id;
} 