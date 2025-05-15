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
  AnalysisTaskStatus 
} from '../interfaces/agent.interface';
import { MeetingTranscript, MeetingMetadata } from '../interfaces/state.interface';
import { v4 as uuidv4 } from 'uuid';

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
 * Define the core state schema for meeting analysis using LangGraph's Annotation
 */
export const MeetingAnalysisStateSchema = Annotation.Root({
  // Execution identifiers
  runId: Annotation<string>({
    default: () => `run-${uuidv4()}`,
    value: (curr, update) => update || curr
  }),
  
  sessionId: Annotation<string>(),
  
  meetingId: Annotation<string>(),
  
  // Input data
  transcript: Annotation<MeetingTranscript>(),
  
  metadata: Annotation<MeetingMetadata>(),
  
  analysisGoal: Annotation<AnalysisGoalType>({
    default: () => AnalysisGoalType.FULL_ANALYSIS,
    value: (curr, update) => update || curr
  }),
  
  // Hierarchical agent structure - with proper merging behavior
  teamStructure: Annotation<TeamStructure>({
    default: () => ({
      supervisorId: '',
      managers: {},
      workers: {}
    }),
    value: (curr, update) => {
      if (!update) return curr;
      
      return {
        supervisorId: update.supervisorId || curr.supervisorId,
        managers: { ...curr.managers, ...update.managers },
        workers: { ...curr.workers, ...update.workers }
      };
    }
  }),
  
  // Task and process tracking
  tasks: Annotation<Record<string, TaskAssignment>>({
    default: () => ({}),
    value: (curr, update) => ({ ...curr, ...update }),
  }),
  
  // Progress tracking
  progress: Annotation<AnalysisProgressInfo>({
    default: () => ({
      overallProgress: 0,
      taskProgress: {},
      stageProgress: {},
      startTime: Date.now(),
      lastUpdateTime: Date.now()
    }),
    value: (curr, update) => {
      if (!update) return curr;
      
      return {
        overallProgress: update.overallProgress ?? curr.overallProgress,
        taskProgress: { ...curr.taskProgress, ...update.taskProgress },
        stageProgress: { ...curr.stageProgress, ...update.stageProgress },
        startTime: curr.startTime, // Keep original start time
        lastUpdateTime: Date.now(),
        estimatedTimeRemaining: update.estimatedTimeRemaining
      };
    }
  }),
  
  // Communication - with proper reducer for message accumulation
  messages: Annotation<AgentMessage[]>({
    default: () => [],
    value: (curr, update) => {
      if (!update || !Array.isArray(update)) return curr;
      return [...curr, ...update];
    }
  }),
  
  // Output and results - merge objects when updating
  results: Annotation<Record<string, AgentOutput>>({
    default: () => ({}),
    value: (curr, update) => ({ ...curr, ...update }),
  }),
  
  finalResult: Annotation<any>({
    default: () => null,
    value: (curr, update) => update ?? curr
  }),
  
  // Execution control - next node routing
  currentNode: Annotation<string>({
    default: () => "initialize",
    value: (curr, update) => update || curr,
  }),
  
  // Routing determines which node to execute next
  nextNode: Annotation<string>({
    default: () => "supervisor",
    value: (curr, update) => update || curr,
  }),
  
  // Error tracking
  error: Annotation<Error | null>({
    default: () => null,
    value: (curr, update) => update ?? curr
  }),
  
  // Execution metadata
  startTime: Annotation<number>({
    default: () => Date.now(),
    value: (curr, update) => update || curr
  }),
  
  endTime: Annotation<number | null>({
    default: () => null,
    value: (curr, update) => update ?? curr
  }),
  
  lastUpdateTime: Annotation<number>({
    default: () => Date.now(),
    value: () => Date.now(), // Always update to current time
  }),
  
  status: Annotation<'initializing' | 'in_progress' | 'completed' | 'failed' | 'canceled'>({
    default: () => 'initializing',
    value: (curr, update) => update || curr,
  }),
});

// Export the type based on the schema definition
export type MeetingAnalysisState = any; // Using any as a temporary solution for the state type

/**
 * Create an initial state object with default values
 */
export function createInitialState(
  sessionId: string,
  meetingId: string,
  transcript: MeetingTranscript,
  metadata: MeetingMetadata,
  goal: AnalysisGoalType = AnalysisGoalType.FULL_ANALYSIS,
  supervisorId: string
): MeetingAnalysisState {
  const now = Date.now();
  
  return {
    runId: `run-${uuidv4()}`,
    sessionId,
    meetingId,
    transcript,
    metadata,
    analysisGoal: goal,
    teamStructure: {
      supervisorId,
      managers: {},
      workers: {}
    },
    tasks: {},
    progress: {
      overallProgress: 0,
      taskProgress: {},
      stageProgress: {},
      startTime: now,
      lastUpdateTime: now
    },
    messages: [],
    results: {},
    finalResult: null,
    currentNode: 'initialize',
    nextNode: 'supervisor',
    startTime: now,
    endTime: null,
    lastUpdateTime: now,
    status: 'initializing',
    error: null
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