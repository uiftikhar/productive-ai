/**
 * State schema definition for the hierarchical meeting analysis graph
 * 
 * This file defines the state schema using LangGraph's Annotation system,
 * providing typed definitions and reducers for state management.
 */
import { END, Annotation } from "@langchain/langgraph";
import { 
  AgentExpertise, 
  AgentMessage, 
  AgentOutput, 
  AgentRole,
  AnalysisGoalType, 
  AnalysisTaskStatus,
  MessageType
} from '../interfaces/agent.interface';
import { MeetingTranscript, MeetingMetadata } from '../interfaces/state.interface';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { BaseMessage } from '@langchain/core/messages';

/**
 * Team structure information for hierarchical analysis
 */
export interface TeamStructure {
  supervisorId: string;
  managers: Record<string, {
    managerId: string;
    expertise: AgentExpertise[];
    workerIds: string[];
  }>;
  workers: Record<string, {
    workerId: string;
    expertise: AgentExpertise[];
    managerId?: string;
  }>;
}

/**
 * Task assignment and tracking
 */
export interface TaskAssignment {
  taskId: string;
  type: AnalysisGoalType;
  status: AnalysisTaskStatus;
  assignedTo: string;
  assignedBy?: string;
  priority: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  dependencies?: string[];
  context?: Record<string, any>;
}

/**
 * Analysis progress tracking
 */
export interface AnalysisProgressInfo {
  overallProgress: number;
  taskProgress: Record<string, number>;
  stageProgress: Record<string, number>;
  startTime: number;
  lastUpdateTime: number;
  estimatedTimeRemaining?: number;
}

/**
 * Define the meeting analysis state schema using Annotation API
 */
export const MeetingAnalysisStateSchema = Annotation.Root({
  // Messages between agents
  messages: Annotation<AgentMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  
  // Transcript data
  transcript: Annotation<string>({
    reducer: (x, y) => y || x,
    default: () => '',
  }),
  
  // Session and meeting IDs
  sessionId: Annotation<string>({
    reducer: (x, y) => y || x,
    default: () => '',
  }),
  
  meetingId: Annotation<string>({
    reducer: (x, y) => y || x,
    default: () => '',
  }),
  
  // Current routing target
  nextNode: Annotation<string>({
    reducer: (x, y) => y || x,
    default: () => 'supervisor',
  }),
  
  // Current analysis goal
  currentGoal: Annotation<AnalysisGoalType>({
    reducer: (x, y) => y || x,
    default: () => AnalysisGoalType.FULL_ANALYSIS,
  }),
  
  // Analysis progress tracking
  progress: Annotation<{
    overallProgress: number;
    completedNodes: number;
    totalNodes: number;
    currentStep?: string;
  }>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({ 
      overallProgress: 0, 
      completedNodes: 0, 
      totalNodes: 0 
    }),
  }),
  
  // Analysis metadata
  metadata: Annotation<MeetingMetadata>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({ 
      meetingId: '',
      participants: []
    }),
  }),
  
  // Analysis results
  results: Annotation<Record<string, any>>({
    reducer: (x, y) => ({ ...x, ...y }),
    default: () => ({}),
  }),
  
  // Final consolidated result
  finalResult: Annotation<any>({
    reducer: (x, y) => y || x,
    default: () => null,
  }),
  
  // Analysis status
  status: Annotation<string>({
    reducer: (x, y) => y || x, 
    default: () => 'pending',
  }),
  
  // Timestamps
  startTime: Annotation<number>({
    reducer: (x, y) => y || x,
    default: () => Date.now(),
  }),
  
  endTime: Annotation<number | null>({
    reducer: (x, y) => y || x,
    default: () => null,
  }),
});

// Export the type based on the schema definition
export type MeetingAnalysisState = any; // Using any as a temporary solution for the state type

/**
 * Create initial state for the meeting analysis graph
 */
export function createInitialState(
  sessionId: string,
  meetingId: string,
  transcript: string | MeetingTranscript,
  metadata: MeetingMetadata,
  goal: AnalysisGoalType = AnalysisGoalType.FULL_ANALYSIS,
  supervisorId: string = 'supervisor'
): typeof MeetingAnalysisStateSchema.State {
  // Create initial message with transcript content
  const initialMessage: AgentMessage = {
    id: `msg-${Date.now()}`,
    type: MessageType.NOTIFICATION,
    sender: 'system',
    recipients: [supervisorId],
    timestamp: Date.now(),
    content: {
      transcript: typeof transcript === 'string' ? transcript : JSON.stringify(transcript),
      options: {
        analysisGoal: goal
      }
    }
  };

  // Return the initial state
  return {
    messages: [initialMessage],
    transcript: typeof transcript === 'string' ? transcript : JSON.stringify(transcript),
    sessionId,
    meetingId,
    nextNode: supervisorId,
    currentGoal: goal,
    progress: {
      overallProgress: 0,
      completedNodes: 0,
      totalNodes: 0,
      currentStep: 'initialization'
    },
    metadata,
    results: {},
    finalResult: null,
    status: 'processing',
    startTime: Date.now(),
    endTime: null
  };
}

/**
 * Helper function to add a message to the state
 */
export function addMessage(message: AgentMessage): Partial<MeetingAnalysisState> {
  return {
    messages: [message],
    lastUpdateTime: Date.now()
  };
}

/**
 * Helper function to update task status
 */
export function updateTask(
  taskId: string, 
  updates: Partial<TaskAssignment>,
  output?: AgentOutput
): Partial<MeetingAnalysisState> {
  const result: Partial<MeetingAnalysisState> = {
    tasks: {
      [taskId]: updates as TaskAssignment
    },
    lastUpdateTime: Date.now()
  };
  
  if (output) {
    result.results = {
      [taskId]: output
    };
  }
  
  return result;
}

/**
 * Helper function to register an agent in the team structure
 */
export function registerAgent(
  agentId: string,
  role: AgentRole,
  expertise: AgentExpertise[],
  managerId?: string
): Partial<MeetingAnalysisState> {
  const update: Partial<MeetingAnalysisState> = {
    lastUpdateTime: Date.now(),
    teamStructure: {
      supervisorId: '',
      managers: {},
      workers: {}
    }
  };
  
  switch (role) {
    case AgentRole.SUPERVISOR:
      update.teamStructure.supervisorId = agentId;
      break;
      
    case AgentRole.MANAGER:
      update.teamStructure.managers = {
        [agentId]: {
          managerId: agentId,
          expertise,
          workerIds: []
        }
      };
      break;
      
    case AgentRole.WORKER:
      update.teamStructure.workers = {
        [agentId]: {
          workerId: agentId,
          expertise,
          managerId
        }
      };
      break;
  }
  
  return update;
}

/**
 * Helper function to navigate to the next node
 */
export function navigateTo(nodeId: string): Partial<MeetingAnalysisState> {
  return {
    nextNode: nodeId,
    lastUpdateTime: Date.now()
  };
}

/**
 * Helper function to update the status
 */
export function updateStatus(
  status: 'initializing' | 'in_progress' | 'completed' | 'failed' | 'canceled'
): Partial<MeetingAnalysisState> {
  return {
    status,
    lastUpdateTime: Date.now()
  };
}

/**
 * Helper function to complete execution
 */
export function completeExecution(
  finalResult?: any
): Partial<MeetingAnalysisState> {
  const result: Partial<MeetingAnalysisState> = {
    status: 'completed',
    endTime: Date.now(),
    lastUpdateTime: Date.now(),
    nextNode: END
  };
  
  if (finalResult !== undefined) {
    result.finalResult = finalResult;
  }
  
  return result;
} 