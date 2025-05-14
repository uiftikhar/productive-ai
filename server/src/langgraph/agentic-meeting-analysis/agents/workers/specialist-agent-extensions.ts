/**
 * Extensions to help specialist agents implement the SpecialistWorkerAgent interface
 */
import { v4 as uuidv4 } from 'uuid';
import {
  AgentExpertise,
  AgentRole,
  AnalysisGoalType,
  // TODO: Why is this oimported? Should this be used in the agent?
  AnalysisTaskStatus,
  AgentMessage,
  AgentOutput,
  ConfidenceLevel,
  MessageType,
  SubTask
} from '../../interfaces/agent.interface';
import { EventEmitter } from 'events';

/**
 * Common properties needed by all specialist agents to be compatible with SpecialistWorkerAgent
 */
export interface SpecialistAgentCommonProperties {
  id: string;
  name: string;
  role: AgentRole;
  expertise: AgentExpertise[];
  logger: any;
  managerId: string;
  primaryExpertise: AgentExpertise;
  activeTask: SubTask | null;
  analysisResults: Map<string, AgentOutput>;
  handleRequest(message: AgentMessage): Promise<void>;
}

/**
 * Initialize missing properties needed for SpecialistWorkerAgent compatibility
 * 
 * @param agent The specialist agent to extend
 * @param managerId The ID of the manager this agent reports to
 * @param primaryExpertise The primary expertise of this agent
 */
export function extendSpecialistAgent(
  agent: any, 
  managerId: string,
  primaryExpertise?: AgentExpertise
): void {
  // Set required properties
  agent.managerId = managerId;
  agent.primaryExpertise = primaryExpertise || agent.expertise[0];
  agent.activeTask = null;
  agent.analysisResults = new Map<string, AgentOutput>();

  // Implement handleRequest method if it doesn't exist
  if (!agent.handleRequest) {
    agent.handleRequest = async function(message: AgentMessage): Promise<void> {
      const { requestType } = message.content;
      
      switch (requestType) {
        case 'task_execution':
          // Basic task handling for agent
          await handleTaskAssignment(this, message);
          break;
          
        case 'worker_info':
          // Request for worker information
          await sendWorkerInfo(this, message.sender);
          break;
          
        default:
          this.logger.warn(`Unknown request type: ${requestType}`);
          break;
      }
    };
  }

  // Only add the event emitter functionality if not already present
  if (!agent.on) {
    Object.setPrototypeOf(agent, Object.create(EventEmitter.prototype));
    EventEmitter.call(agent);
  }
  
  // Register message handler
  agent.on('request', agent.handleRequest.bind(agent));
}

/**
 * Handles task assignment for specialist agents
 */
async function handleTaskAssignment(agent: any, message: AgentMessage): Promise<void> {
  const { task } = message.content;
  
  agent.logger.info(`Received task assignment: ${task.id}`);
  
  // Set as active task
  agent.activeTask = task;
  
  try {
    // Process the task
    const result = await agent.processTask(task);
    
    // Store result
    agent.analysisResults.set(task.id, result);
    
    // Mark task as complete
    agent.activeTask = null;
    
    // Send response to manager
    await agent.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.RESPONSE,
      sender: agent.id,
      recipients: [agent.managerId],
      content: {
        responseType: 'task_completed',
        taskId: task.id,
        result
      },
      timestamp: Date.now()
    });
    
    agent.logger.info(`Completed task: ${task.id}`);
  } catch (error) {
    agent.logger.error(`Error executing task ${task.id}: ${error instanceof Error ? error.message : String(error)}`);
    
    // Reset active task
    agent.activeTask = null;
    
    // Report failure
    await agent.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.RESPONSE,
      sender: agent.id,
      recipients: [agent.managerId],
      content: {
        responseType: 'task_failed',
        taskId: task.id,
        error: error instanceof Error ? error.message : String(error)
      },
      timestamp: Date.now()
    });
  }
}

/**
 * Sends worker information to requester
 */
async function sendWorkerInfo(agent: any, requesterId: string): Promise<void> {
  await agent.sendMessage({
    id: `msg-${uuidv4()}`,
    type: MessageType.RESPONSE,
    sender: agent.id,
    recipients: [requesterId],
    content: {
      requestType: 'worker_info',
      workerId: agent.id,
      expertise: agent.expertise,
      primaryExpertise: agent.primaryExpertise,
      capabilities: Array.from(agent.capabilities),
      busy: agent.activeTask !== null,
      status: agent.activeTask ? 'working' : 'available'
    },
    timestamp: Date.now()
  });
}

/**
 * Helper functions to map expertise to goal types
 */
export function mapExpertiseToGoalType(expertise: AgentExpertise): AnalysisGoalType {
  switch (expertise) {
    case AgentExpertise.TOPIC_ANALYSIS:
      return AnalysisGoalType.EXTRACT_TOPICS;
    case AgentExpertise.ACTION_ITEM_EXTRACTION:
      return AnalysisGoalType.EXTRACT_ACTION_ITEMS;
    case AgentExpertise.DECISION_TRACKING:
      return AnalysisGoalType.EXTRACT_DECISIONS;
    case AgentExpertise.SENTIMENT_ANALYSIS:
      return AnalysisGoalType.ANALYZE_SENTIMENT;
    case AgentExpertise.PARTICIPANT_DYNAMICS:
      return AnalysisGoalType.ANALYZE_PARTICIPATION;
    case AgentExpertise.SUMMARY_GENERATION:
      return AnalysisGoalType.GENERATE_SUMMARY;
    case AgentExpertise.CONTEXT_INTEGRATION:
      return AnalysisGoalType.INTEGRATE_CONTEXT;
    default:
      return AnalysisGoalType.FULL_ANALYSIS;
  }
} 