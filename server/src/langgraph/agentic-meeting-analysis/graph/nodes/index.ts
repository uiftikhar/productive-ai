/**
 * Node registry for the hierarchical meeting analysis graph
 * 
 * This file defines node handlers for supervisor, manager, and worker agents
 * to be used in the LangGraph implementation.
 */
import { END } from "@langchain/langgraph";
import { 
  AgentExpertise, 
  AgentMessage, 
  AgentOutput,
  AgentResultCollection,
  AgentRole, 
  AnalysisGoalType, 
  AnalysisTaskStatus,
  MessageType
} from '../../interfaces/agent.interface';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';

import { MeetingAnalysisState, addMessage, navigateTo, updateTask, completeExecution, TaskAssignment } from '../state-schema';
import { BaseMeetingAnalysisAgent } from '../../agents/base-meeting-analysis-agent';
import { EnhancedSupervisorAgent } from '../../agents/coordinator/enhanced-supervisor-agent';
import { AnalysisManagerAgent } from '../../agents/manager/analysis-manager-agent';
import { SpecialistWorkerAgent } from '../../agents/workers/specialist-worker-agent';

/**
 * Node types in the hierarchical graph
 */
export enum NodeType {
  SUPERVISOR = 'supervisor',
  MANAGER = 'manager',
  WORKER = 'worker',
  ROUTER = 'router',
  INIT = 'initialize',
  FINISH = 'finish'
}

/**
 * Type for node handlers that process state
 */
export type NodeHandler = (state: MeetingAnalysisState) => Promise<Partial<MeetingAnalysisState>>;

/**
 * Configuration for node creation
 */
export interface NodeCreationConfig {
  logger?: Logger;
}

/**
 * Creates the initialize node handler
 */
export function createInitializeNode(config: NodeCreationConfig = {}): NodeHandler {
  const logger = config.logger || new ConsoleLogger();
  
  return async (state: MeetingAnalysisState): Promise<Partial<MeetingAnalysisState>> => {
    logger.info('Initializing meeting analysis graph', {
      meetingId: state.meetingId,
      sessionId: state.sessionId
    });
    
    return {
      status: 'in_progress',
      nextNode: 'supervisor',
      lastUpdateTime: Date.now()
    };
  };
}

/**
 * Creates the router node handler
 */
export function createRouterNode(config: NodeCreationConfig = {}): NodeHandler {
  const logger = config.logger || new ConsoleLogger();
  
  return async (state: MeetingAnalysisState): Promise<Partial<MeetingAnalysisState>> => {
    logger.debug('Routing to next node', {
      currentNode: state.currentNode,
      nextNode: state.nextNode
    });
    
    return {
      currentNode: state.nextNode,
      lastUpdateTime: Date.now()
    };
  };
}

/**
 * Creates the finish node handler
 */
export function createFinishNode(config: NodeCreationConfig = {}): NodeHandler {
  const logger = config.logger || new ConsoleLogger();
  
  return async (state: MeetingAnalysisState): Promise<Partial<MeetingAnalysisState>> => {
    logger.info('Completing meeting analysis', {
      meetingId: state.meetingId,
      sessionId: state.sessionId
    });
    
    return completeExecution(state.finalResult);
  };
}

/**
 * Creates a supervisor node handler
 */
export function createSupervisorNode(
  agent: EnhancedSupervisorAgent,
  config: NodeCreationConfig = {}
): NodeHandler {
  const logger = config.logger || new ConsoleLogger();
  
  return async (state: MeetingAnalysisState): Promise<Partial<MeetingAnalysisState>> => {
    logger.info(`Processing supervisor node: ${agent.name}`, {
      supervisorId: agent.id,
    });
    
    try {
      // Get the latest messages
      const messages = state.messages || [];
      
      // Let the supervisor decide which team/agent should act next
      const nextAgent = await agent.decideNextAgent({ messages });
      
      if (nextAgent === 'FINISH') {
        logger.info('Supervisor decided to finish execution');
        
        if (!state.finalResult) {
          // If there's no final result yet, synthesize from all results
          const taskResults: AgentResultCollection[] = Object.entries(state.results || {}).map(
            ([taskId, output]) => ({
              taskId,
              results: [output as AgentOutput],
              metadata: {
                workerIds: [(output as AgentOutput).metadata?.agentId || 'unknown'],
                startTime: (output as AgentOutput).timestamp || Date.now(),
                endTime: Date.now()
              }
            })
          );
          
          // Synthesize final results
          const finalResult = await agent.synthesizeResults(taskResults);
          
          return {
            finalResult,
            nextNode: NodeType.FINISH,
            lastUpdateTime: Date.now()
          };
        }
        
        return navigateTo(NodeType.FINISH);
      }
      
      // Handle team-specific routing
      if (nextAgent.endsWith('Team')) {
        // Extract team name and map to expertise
        const teamName = nextAgent.replace('Team', '');
        const expertise = mapTeamNameToExpertise(teamName);
        
        // Create a message requesting team action
        const teamRequestMessage: AgentMessage = {
          id: `msg-${uuidv4()}`,
          type: MessageType.DELEGATE,
          sender: agent.id,
          recipients: ['broadcast'],
          content: {
            type: 'team_request',
            teamName,
            expertise,
            context: {
              transcript: state.transcript,
              meetingMetadata: state.metadata
            }
          },
          timestamp: Date.now()
        };
        
        // Find manager with matching expertise, if any
        const managerWithExpertise = findManagerWithExpertise(state, expertise);
        
        if (managerWithExpertise) {
          logger.info(`Routing to manager for ${teamName}`, {
            managerId: managerWithExpertise
          });
          
          return {
            ...addMessage(teamRequestMessage),
            nextNode: managerWithExpertise
          };
        } else {
          logger.info(`No manager found for ${teamName}, staying with supervisor`);
          
          // Create a task for this expertise to be assigned later
          const taskId = `task-${uuidv4()}`;
          const taskUpdate = updateTask(taskId, {
            taskId,
            type: mapExpertiseToGoalType(expertise),
            status: AnalysisTaskStatus.PENDING,
            assignedTo: '',
            priority: 3,
            createdAt: Date.now(),
            updatedAt: Date.now()
          });
          
          return {
            ...addMessage(teamRequestMessage),
            ...taskUpdate,
            nextNode: agent.id // Stay with supervisor
          };
        }
      }
      
      // Handle direct agent routing
      if (nextAgent !== agent.id) {
        // If next agent is explicitly specified, route to it
        return navigateTo(nextAgent);
      }
      
      // Default: continue with supervisor
      return navigateTo(agent.id);
      
    } catch (error) {
      logger.error(`Error in supervisor node: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        error: error instanceof Error ? error : new Error(String(error)),
        nextNode: NodeType.FINISH, // Abort on error
        lastUpdateTime: Date.now()
      };
    }
  };
}

/**
 * Creates a manager node handler
 */
export function createManagerNode(
  agent: AnalysisManagerAgent,
  config: NodeCreationConfig = {}
): NodeHandler {
  const logger = config.logger || new ConsoleLogger();
  
  return async (state: MeetingAnalysisState): Promise<Partial<MeetingAnalysisState>> => {
    logger.info(`Processing manager node: ${agent.name}`, {
      managerId: agent.id,
      expertise: agent.managedExpertise
    });
    
    try {
      // Find messages directed to this manager
      const managerMessages = state.messages.filter((msg: AgentMessage) => 
        msg.recipients.includes(agent.id) || msg.recipients === 'broadcast'
      );
      
      // Find tasks relevant to this manager's expertise
      const relevantTasks = Object.values(state.tasks || {}).filter((task) => {
        // Need to type cast task to TaskAssignment
        const typedTask = task as TaskAssignment;
        
        // Tasks explicitly assigned to this manager
        if (typedTask.assignedTo === agent.id) return true;
        
        // Tasks whose goal aligns with manager's expertise
        const taskExpertise = mapGoalTypeToExpertise(typedTask.type);
        return agent.managedExpertise.includes(taskExpertise);
      });
      
      // Get available workers for this manager
      const managersWorkers = state.teamStructure.managers[agent.id]?.workerIds || [];
      const availableWorkers = managersWorkers.filter((workerId: string) => {
        // Check if worker is already assigned to a task
        return !Object.values(state.tasks || {}).some((task) => {
          const typedTask = task as TaskAssignment;
          return typedTask.assignedTo === workerId && 
                 typedTask.status !== AnalysisTaskStatus.COMPLETED;
        });
      });
      
      // Handle team requests
      const teamRequests = managerMessages.filter((msg: AgentMessage) => 
        msg.type === MessageType.DELEGATE && 
        msg.content.type === 'team_request'
      );
      
      if (teamRequests.length > 0) {
        // Process the most recent team request
        const request = teamRequests[teamRequests.length - 1];
        
        // Create a task for this request if none exists
        const existingTask = relevantTasks.find((task) => {
          const typedTask = task as TaskAssignment;
          return typedTask.status !== AnalysisTaskStatus.COMPLETED;
        });
        
        if (!existingTask) {
          const taskId = `task-${uuidv4()}`;
          const expertise = request.content.expertise;
          
          // Create a new task
          const newTask = {
            taskId,
            type: mapExpertiseToGoalType(expertise),
            status: AnalysisTaskStatus.PENDING,
            assignedTo: agent.id,
            assignedBy: request.sender,
            priority: 2,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            context: request.content.context
          };
          
          // Update state with new task
          const taskUpdate = updateTask(taskId, newTask);
          
          // Acknowledge receipt of request
          const acknowledgment: AgentMessage = {
            id: `msg-${uuidv4()}`,
            type: MessageType.RESPONSE,
            sender: agent.id,
            recipients: [request.sender],
            content: {
              type: 'task_acknowledgment',
              taskId,
              status: 'accepted'
            },
            timestamp: Date.now()
          };
          
          return {
            ...taskUpdate,
            ...addMessage(acknowledgment),
            nextNode: agent.id // Stay with manager to process task
          };
        }
      }
      
      // Process pending tasks
      const pendingTasks = relevantTasks.filter((task) => {
        const typedTask = task as TaskAssignment;
        return typedTask.status === AnalysisTaskStatus.PENDING || 
               typedTask.status === AnalysisTaskStatus.IN_PROGRESS;
      });
      
      if (pendingTasks.length > 0) {
        // Cast the task to the correct type
        const taskObj = pendingTasks[0]; // Process one task at a time
        const task = taskObj as TaskAssignment; 
        
        // Check if task needs decomposition
        if (task.assignedTo === agent.id) {
          // Update task status to in progress
          const taskUpdate = updateTask(task.taskId, {
            ...task,
            status: AnalysisTaskStatus.IN_PROGRESS,
            updatedAt: Date.now()
          });
          
          // If there are available workers, delegate to a worker
          if (availableWorkers.length > 0) {
            const workerId = availableWorkers[0];
            const workerExpertise = state.teamStructure.workers[workerId]?.expertise || [];
            
            // Check if worker has relevant expertise
            const taskExpertise = mapGoalTypeToExpertise(task.type);
            const isQualified = workerExpertise.includes(taskExpertise);
            
            if (isQualified) {
              // Create a subtask for the worker
              const subtaskId = `subtask-${uuidv4()}`;
              const subtask = {
                taskId: subtaskId,
                type: task.type,
                status: AnalysisTaskStatus.PENDING,
                assignedTo: workerId,
                assignedBy: agent.id,
                priority: task.priority,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                dependencies: [task.taskId],
                context: task.context
              };
              
              // Update state with subtask
              const subtaskUpdate = updateTask(subtaskId, subtask);
              
              // Create delegation message
              const delegation: AgentMessage = {
                id: `msg-${uuidv4()}`,
                type: MessageType.DELEGATE,
                sender: agent.id,
                recipients: [workerId],
                content: {
                  type: 'task_assignment',
                  taskId: subtaskId,
                  parentTaskId: task.taskId,
                  context: task.context
                },
                timestamp: Date.now()
              };
              
              // Route to worker
              return {
                ...taskUpdate,
                ...subtaskUpdate,
                ...addMessage(delegation),
                nextNode: workerId
              };
            }
          }
          
          // If no suitable worker found, process task with manager
          const result = await agent.processTask({
            id: task.taskId,
            type: task.type,
            status: AnalysisTaskStatus.IN_PROGRESS,
            assignedTo: agent.id,
            priority: task.priority,
            input: task.context || {},
            created: task.createdAt,
            updated: task.updatedAt
          });
          
          // Mark task as completed and store result
          const completedTaskUpdate = updateTask(task.taskId, {
            ...task,
            status: AnalysisTaskStatus.COMPLETED,
            updatedAt: Date.now(),
            completedAt: Date.now()
          }, result);
          
          // Report back to supervisor
          const reportMessage: AgentMessage = {
            id: `msg-${uuidv4()}`,
            type: MessageType.RESPONSE,
            sender: agent.id,
            recipients: [state.teamStructure.supervisorId],
            content: {
              type: 'task_completed',
              taskId: task.taskId,
              result
            },
            timestamp: Date.now()
          };
          
          return {
            ...completedTaskUpdate,
            ...addMessage(reportMessage),
            nextNode: state.teamStructure.supervisorId
          };
        }
      }
      
      // Process completed subtasks from workers
      const completionMessages = state.messages.filter((msg: AgentMessage) =>
        msg.type === MessageType.RESPONSE &&
        msg.recipients.includes(agent.id) &&
        msg.content.type === 'task_completed'
      );
      
      if (completionMessages.length > 0) {
        // Process the oldest completion message first
        const completion = completionMessages[0];
        const subtaskId = completion.content.taskId;
        const result = completion.content.result;
        
        // Find the parent task
        const subtask = state.tasks?.[subtaskId] as TaskAssignment | undefined;
        if (!subtask || !subtask.dependencies || subtask.dependencies.length === 0) {
          // Invalid subtask or no parent task, return to supervisor
          return navigateTo(state.teamStructure.supervisorId);
        }
        
        const parentTaskId = subtask.dependencies[0];
        const parentTask = state.tasks?.[parentTaskId] as TaskAssignment | undefined;
        
        if (!parentTask) {
          // Parent task not found, return to supervisor
          return navigateTo(state.teamStructure.supervisorId);
        }
        
        // Mark parent task as completed and store combined result
        const completedTaskUpdate = updateTask(parentTaskId, {
          ...parentTask,
          status: AnalysisTaskStatus.COMPLETED,
          updatedAt: Date.now(),
          completedAt: Date.now()
        }, result);
        
        // Report back to supervisor
        const reportMessage: AgentMessage = {
          id: `msg-${uuidv4()}`,
          type: MessageType.RESPONSE,
          sender: agent.id,
          recipients: [state.teamStructure.supervisorId],
          content: {
            type: 'task_completed',
            taskId: parentTaskId,
            result
          },
          timestamp: Date.now()
        };
        
        return {
          ...completedTaskUpdate,
          ...addMessage(reportMessage),
          nextNode: state.teamStructure.supervisorId
        };
      }
      
      // No active tasks or messages to process, return to supervisor
      return navigateTo(state.teamStructure.supervisorId);
      
    } catch (error) {
      logger.error(`Error in manager node: ${error instanceof Error ? error.message : String(error)}`);
      
      // Report error to supervisor
      const errorMessage: AgentMessage = {
        id: `msg-${uuidv4()}`,
        type: MessageType.NOTIFICATION,
        sender: agent.id,
        recipients: [state.teamStructure.supervisorId],
        content: {
          type: 'error',
          error: error instanceof Error ? error.message : String(error)
        },
        timestamp: Date.now()
      };
      
      return {
        error: error instanceof Error ? error : new Error(String(error)),
        ...addMessage(errorMessage),
        nextNode: state.teamStructure.supervisorId,
        lastUpdateTime: Date.now()
      };
    }
  };
}

/**
 * Creates a worker node handler
 */
export function createWorkerNode(
  agent: SpecialistWorkerAgent,
  config: NodeCreationConfig = {}
): NodeHandler {
  const logger = config.logger || new ConsoleLogger();
  
  return async (state: MeetingAnalysisState): Promise<Partial<MeetingAnalysisState>> => {
    logger.info(`Processing worker node: ${agent.name}`, {
      workerId: agent.id,
      expertise: agent.expertise
    });
    
    try {
      // Find the worker's manager
      const managerId = state.teamStructure.workers[agent.id]?.managerId;
      
      if (!managerId) {
        logger.warn(`Worker ${agent.id} has no assigned manager, returning to supervisor`);
        return navigateTo(state.teamStructure.supervisorId);
      }
      
      // Find tasks assigned to this worker
      const assignedTasks = Object.values(state.tasks || {}).filter((task) => {
        const typedTask = task as TaskAssignment;
        return typedTask.assignedTo === agent.id && 
               typedTask.status !== AnalysisTaskStatus.COMPLETED;
      });
      
      // Find delegation messages for this worker
      const delegations = state.messages.filter((msg: AgentMessage) =>
        msg.type === MessageType.DELEGATE &&
        msg.recipients.includes(agent.id) &&
        msg.content.type === 'task_assignment'
      );
      
      // Process tasks or delegations
      if (assignedTasks.length > 0 || delegations.length > 0) {
        // Prioritize tasks already in the state
        let taskObj;
        if (assignedTasks.length > 0) {
          taskObj = assignedTasks[0];
        } else {
          const latestDelegation = delegations[delegations.length - 1];
          taskObj = state.tasks?.[latestDelegation.content.taskId];
        }
        
        if (!taskObj) {
          // Task referenced in delegation not found in state
          // This shouldn't happen, but handle it gracefully
          return navigateTo(managerId);
        }
        
        const task = taskObj as TaskAssignment;
        
        // Update task status to in progress
        const taskUpdate = updateTask(task.taskId, {
          ...task,
          status: AnalysisTaskStatus.IN_PROGRESS,
          updatedAt: Date.now()
        });
        
        // Process the task with the agent
        const result = await agent.processTask({
          id: task.taskId,
          type: task.type,
          status: AnalysisTaskStatus.IN_PROGRESS,
          assignedTo: agent.id,
          priority: task.priority,
          input: task.context || { transcript: state.transcript },
          created: task.createdAt,
          updated: task.updatedAt
        });
        
        // Mark task as completed and store result
        const completedTaskUpdate = updateTask(task.taskId, {
          ...task,
          status: AnalysisTaskStatus.COMPLETED,
          updatedAt: Date.now(),
          completedAt: Date.now()
        }, result);
        
        // Report completion to manager
        const completionMessage: AgentMessage = {
          id: `msg-${uuidv4()}`,
          type: MessageType.RESPONSE,
          sender: agent.id,
          recipients: [managerId],
          content: {
            type: 'task_completed',
            taskId: task.taskId,
            result
          },
          timestamp: Date.now()
        };
        
        return {
          ...taskUpdate,
          ...completedTaskUpdate,
          ...addMessage(completionMessage),
          nextNode: managerId
        };
      }
      
      // No tasks to process, return to manager
      return navigateTo(managerId);
      
    } catch (error) {
      logger.error(`Error in worker node: ${error instanceof Error ? error.message : String(error)}`);
      
      // Find the worker's manager
      const managerId = state.teamStructure.workers[agent.id]?.managerId || state.teamStructure.supervisorId;
      
      // Report error to manager
      const errorMessage: AgentMessage = {
        id: `msg-${uuidv4()}`,
        type: MessageType.NOTIFICATION,
        sender: agent.id,
        recipients: [managerId],
        content: {
          type: 'error',
          error: error instanceof Error ? error.message : String(error)
        },
        timestamp: Date.now()
      };
      
      return {
        error: error instanceof Error ? error : new Error(String(error)),
        ...addMessage(errorMessage),
        nextNode: managerId,
        lastUpdateTime: Date.now()
      };
    }
  };
}

/**
 * Map team name to agent expertise
 */
function mapTeamNameToExpertise(teamName: string): AgentExpertise {
  const normalizedName = teamName.toLowerCase();
  
  switch (normalizedName) {
    case 'topic':
      return AgentExpertise.TOPIC_ANALYSIS;
    case 'action':
    case 'actionitem':
      return AgentExpertise.ACTION_ITEM_EXTRACTION;
    case 'decision':
      return AgentExpertise.DECISION_TRACKING;
    case 'sentiment':
      return AgentExpertise.SENTIMENT_ANALYSIS;
    case 'participant':
    case 'participation':
      return AgentExpertise.PARTICIPANT_DYNAMICS;
    case 'summary':
      return AgentExpertise.SUMMARY_GENERATION;
    case 'context':
      return AgentExpertise.CONTEXT_INTEGRATION;
    default:
      return AgentExpertise.TOPIC_ANALYSIS; // Default
  }
}

/**
 * Map expertise to goal type
 */
function mapExpertiseToGoalType(expertise: AgentExpertise): AnalysisGoalType {
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
    case AgentExpertise.COORDINATION:
    case AgentExpertise.MANAGEMENT:
    default:
      return AnalysisGoalType.FULL_ANALYSIS;
  }
}

/**
 * Map goal type to expertise
 */
function mapGoalTypeToExpertise(goalType: AnalysisGoalType): AgentExpertise {
  switch (goalType) {
    case AnalysisGoalType.EXTRACT_TOPICS:
      return AgentExpertise.TOPIC_ANALYSIS;
    case AnalysisGoalType.EXTRACT_ACTION_ITEMS:
      return AgentExpertise.ACTION_ITEM_EXTRACTION;
    case AnalysisGoalType.EXTRACT_DECISIONS:
      return AgentExpertise.DECISION_TRACKING;
    case AnalysisGoalType.ANALYZE_SENTIMENT:
      return AgentExpertise.SENTIMENT_ANALYSIS;
    case AnalysisGoalType.ANALYZE_PARTICIPATION:
      return AgentExpertise.PARTICIPANT_DYNAMICS;
    case AnalysisGoalType.GENERATE_SUMMARY:
      return AgentExpertise.SUMMARY_GENERATION;
    case AnalysisGoalType.INTEGRATE_CONTEXT:
      return AgentExpertise.CONTEXT_INTEGRATION;
    default:
      return AgentExpertise.COORDINATION;
  }
}

/**
 * Find manager with specific expertise
 */
function findManagerWithExpertise(
  state: MeetingAnalysisState,
  expertise: AgentExpertise
): string | undefined {
  // Check all managers
  for (const [managerId, managerData] of Object.entries(state.teamStructure.managers)) {
    const manager = managerData as {expertise: AgentExpertise[]};
    if (manager.expertise.includes(expertise)) {
      return managerId;
    }
  }
  
  return undefined;
} 