/**
 * Meeting Analysis Graph Implementation
 * 
 * This file implements the main hierarchical meeting analysis graph
 * using LangGraph's patterns for agent coordination.
 */
import { StateGraph, END, START } from "@langchain/langgraph";
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { Logger } from '../../../shared/logger/logger.interface';
import { v4 as uuidv4 } from 'uuid';

import { 
  MeetingAnalysisState, 
  MeetingAnalysisStateSchema,
  createInitialState 
} from './state-schema';
import {
  createSupervisorNode,
  createManagerNode,
  createWorkerNode,
  createInitializeNode,
  createRouterNode,
  createFinishNode,
  NodeType
} from './nodes';
import { EnhancedSupervisorAgent } from '../agents/coordinator/enhanced-supervisor-agent';
import { AnalysisManagerAgent } from '../agents/manager/analysis-manager-agent';
import { SpecialistWorkerAgent } from '../agents/workers/specialist-worker-agent';
import { AgentExpertise, AnalysisGoalType } from '../interfaces/agent.interface';
import { MeetingTranscript, MeetingMetadata } from '../interfaces/state.interface';
import { MeetingAnalysisServiceRegistry } from '../services/service-registry';

/**
 * Configuration for creating a meeting analysis graph
 */
export interface MeetingAnalysisGraphConfig {
  logger?: Logger;
  supervisorAgent?: EnhancedSupervisorAgent;
  managerAgents?: AnalysisManagerAgent[];
  workerAgents?: SpecialistWorkerAgent[];
  serviceRegistry?: MeetingAnalysisServiceRegistry;
}

/**
 * Creates a hierarchical meeting analysis graph using LangGraph
 */
export function createMeetingAnalysisGraph(config: MeetingAnalysisGraphConfig = {}) {
  const logger = config.logger || new ConsoleLogger();
  
  // Create the graph with the state schema
  const graph: any = new StateGraph(MeetingAnalysisStateSchema);
  
  // Get agents from config or create defaults
  const supervisor = config.supervisorAgent || createDefaultSupervisor(logger);
  const managers = config.managerAgents || [];
  const workers = config.workerAgents || [];
  
  // Add system nodes
  graph.addNode(NodeType.INIT, createInitializeNode({ logger }));
  graph.addNode(NodeType.ROUTER, createRouterNode({ logger }));
  graph.addNode(NodeType.FINISH, createFinishNode({ logger }));
  
  // Add supervisor node
  graph.addNode('supervisor', createSupervisorNode(supervisor, { logger }));
  
  // Add manager nodes
  for (const manager of managers) {
    graph.addNode(manager.id, createManagerNode(manager, { logger }));
  }
  
  // Add worker nodes
  for (const worker of workers) {
    graph.addNode(worker.id, createWorkerNode(worker, { logger }));
  }
  
  // Add edges
  // From START to initialize node
  graph.addEdge(START, NodeType.INIT);
  
  // From initialize to router
  graph.addEdge(NodeType.INIT, NodeType.ROUTER);
  
  // From finish to END
  graph.addEdge(NodeType.FINISH, END);
  
  // Build mapping of all possible node destinations
  const nodeMapping: Record<string, string> = {
    [NodeType.FINISH]: NodeType.FINISH,
    'supervisor': 'supervisor',
  };
  
  // Add manager nodes to mapping
  for (const manager of managers) {
    nodeMapping[manager.id] = manager.id;
  }
  
  // Add worker nodes to mapping
  for (const worker of workers) {
    nodeMapping[worker.id] = worker.id;
  }
  
  // Add edges from agent nodes back to router
  graph.addEdge('supervisor', NodeType.ROUTER);
  
  for (const manager of managers) {
    graph.addEdge(manager.id, NodeType.ROUTER);
  }
  
  for (const worker of workers) {
    graph.addEdge(worker.id, NodeType.ROUTER);
  }
  
  // Conditional edge from router to any node based on nextNode field
  graph.addConditionalEdges(
    NodeType.ROUTER,
    (state: MeetingAnalysisState) => {
      // If nextNode is not set or invalid, default to supervisor
      if (!state.nextNode || !nodeMapping[state.nextNode]) {
        logger.warn(`Invalid nextNode: ${state.nextNode}, defaulting to supervisor`);
        return 'supervisor';
      }
      return state.nextNode;
    },
    nodeMapping
  );
  
  // Helper method to get all nodes in the graph
  const getNodes = () => {
    // Return all node names including system nodes, supervisor, managers, and workers
    return [
      NodeType.INIT,
      NodeType.ROUTER,
      NodeType.FINISH,
      'supervisor',
      ...managers.map(m => m.id),
      ...workers.map(w => w.id)
    ];
  };
  
  // Attach the helper method to the compiled graph
  const compiledGraph = graph.compile();
  compiledGraph.getNodes = getNodes;
  
  return compiledGraph;
}

/**
 * Main execution interface for the meeting analysis graph
 */
export class MeetingAnalysisClient {
  private logger: Logger;
  private serviceRegistry?: MeetingAnalysisServiceRegistry;
  private graph: any;
  private graphConfig: MeetingAnalysisGraphConfig;
  
  /**
   * Create a new meeting analysis client
   */
  constructor(config: MeetingAnalysisGraphConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.serviceRegistry = config.serviceRegistry;
    this.graphConfig = config;
    
    // Create the graph
    this.graph = createMeetingAnalysisGraph(config);
    
    this.logger.info('Initialized MeetingAnalysisClient');
  }
  
  /**
   * Analyze a meeting transcript
   */
  async analyzeMeeting(
    transcript: MeetingTranscript,
    metadata: MeetingMetadata,
    goal: AnalysisGoalType = AnalysisGoalType.FULL_ANALYSIS,
    options: {
      callbacks?: any[];
      sessionId?: string;
    } = {}
  ): Promise<{
    sessionId: string;
    meetingId: string;
    result: any;
  }> {
    try {
      // Generate session IDs
      const sessionId = options.sessionId || `session-${uuidv4()}`;
      const meetingId = metadata.meetingId || `meeting-${uuidv4()}`;
      
      this.logger.info(`Starting meeting analysis for session ${sessionId}`, {
        meetingId,
        goal
      });
      
      // Get supervisor from config or create default
      const supervisor = this.graphConfig.supervisorAgent || createDefaultSupervisor(this.logger);
      
      // Create initial state
      const initialState = createInitialState(
        sessionId,
        meetingId,
        transcript,
        metadata,
        goal,
        supervisor.id
      );
      
      // Invoke the graph
      const result = await this.graph.invoke(
        { state: initialState },
        { 
          recursionLimit: 100,
          callbacks: options.callbacks
        }
      );
      
      // Store the results in the service registry if available
      await this.storeResults(sessionId, meetingId, result.state);
      
      this.logger.info(`Completed meeting analysis for session ${sessionId}`);
      
      return {
        sessionId,
        meetingId,
        result: result.state.finalResult || result.state.results
      };
    } catch (error: any) {
      // Create a structured error object with detailed information
      const errorDetails = {
        message: error.message || 'Unknown error during meeting analysis',
        stack: error.stack,
        name: error.name,
        code: error.code,
        sessionId: options.sessionId,
        meetingId: metadata.meetingId,
        goal: goal,
        graphState: error.graphState || 'unknown'
      };
      
      this.logger.error('Error during meeting analysis', {
        error: errorDetails
      });
      
      // Create an enhanced error with additional context
      const enhancedError = new Error(`Analysis failed: ${error.message}`);
      (enhancedError as any).originalError = error;
      (enhancedError as any).analysisDetails = {
        meetingId: metadata.meetingId,
        goal: goal,
        sessionId: options.sessionId
      };
      
      throw enhancedError;
    }
  }
  
  /**
   * Check the status of an ongoing analysis
   */
  async getAnalysisStatus(sessionId: string): Promise<{
    status: string;
    progress: number;
    meetingId?: string;
  }> {
    if (!this.serviceRegistry) {
      return {
        status: 'unknown',
        progress: 0
      };
    }
    
    try {
      const stateService = this.serviceRegistry.getService('stateService');
      
      if (stateService && typeof stateService.getSessionProgress === 'function') {
        const progress = await stateService.getSessionProgress(sessionId);
        
        return {
          status: progress.status,
          progress: progress.progress,
          meetingId: progress.meetingId
        };
      }
      
      return {
        status: 'unknown',
        progress: 0
      };
    } catch (error) {
      this.logger.error(`Error fetching analysis status for session ${sessionId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        status: 'error',
        progress: 0
      };
    }
  }
  
  /**
   * Store analysis results in the service registry
   */
  private async storeResults(
    sessionId: string, 
    meetingId: string, 
    state: MeetingAnalysisState
  ): Promise<void> {
    if (!this.serviceRegistry) {
      return;
    }
    
    try {
      // Create session data
      const sessionData = {
        sessionId,
        meetingId,
        status: state.status,
        progress: state.progress.overallProgress,
        startTime: state.startTime,
        endTime: state.endTime,
        results: state.finalResult || state.results,
        completedAt: Date.now()
      };
      
      // Store in service registry
      const stateService = this.serviceRegistry.getService('stateService');
      
      if (stateService && typeof stateService.saveSessionResults === 'function') {
        await stateService.saveSessionResults(sessionId, sessionData);
        this.logger.debug(`Stored results for session ${sessionId}`);
      }
    } catch (error) {
      this.logger.error(`Error storing results for session ${sessionId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

/**
 * Create a default supervisor agent
 */
function createDefaultSupervisor(logger: Logger): EnhancedSupervisorAgent {
  return new EnhancedSupervisorAgent({
    name: 'Analysis Supervisor',
    expertise: [AgentExpertise.COORDINATION, AgentExpertise.MANAGEMENT],
    capabilities: [AnalysisGoalType.FULL_ANALYSIS],
    logger
  });
} 