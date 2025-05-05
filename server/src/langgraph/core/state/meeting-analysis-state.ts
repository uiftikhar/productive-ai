import { BaseAgentState, createBaseAgentState } from './base-agent-state';
import {
  AgenticMeetingAnalysisState,
  MeetingMetadata,
  MeetingTranscript,
  TranscriptSegment,
  AnalysisTeam,
  AnalysisResults,
  AnalysisProgress,
} from '../../agentic-meeting-analysis/interfaces/state.interface';
import { AgentExpertise, AnalysisGoalType, AnalysisTaskStatus, AgentOutput } from '../../agentic-meeting-analysis/interfaces/agent.interface';

/**
 * Meeting analysis specific state additions that extend the base agent state
 */
export interface MeetingAnalysisState extends BaseAgentState, Omit<AgenticMeetingAnalysisState, 'status'> {
  // Core meeting information (from AgenticMeetingAnalysisState)
  meetingId: string;
  metadata: MeetingMetadata;
  transcript: MeetingTranscript;
  segments: TranscriptSegment[];

  // Analysis process state
  team?: AnalysisTeam;
  goals: AnalysisGoalType[];
  tasks: Record<
    string,
    {
      id: string;
      type: AnalysisGoalType;
      status: AnalysisTaskStatus;
      assignedTo?: string;
      dependencies?: string[];
      input: any;
      output?: AgentOutput;
      created: number;
      updated: number;
    }
  >;
  progress: AnalysisProgress;

  // Results
  results?: AnalysisResults;

  // Execution metadata
  executionId: string;
  startTime: number;
  endTime?: number;
  // Using BaseAgentState status instead of AgenticMeetingAnalysisState status
  // status: 'pending' | 'in_progress' | 'completed' | 'failed';
  agenticStatus?: 'pending' | 'in_progress' | 'completed' | 'failed';
  errors?: any[];

  // Additional fields for workflow management
  currentlyProcessingTaskId?: string;
  taskCompletionMap?: Record<string, boolean>;
  annotationHistory?: Array<{
    taskId: string;
    agentId: string;
    timestamp: number;
    annotation: string;
  }>;

  // Store custom workflow metadata separately
  workflow: {
    lastPartialAnalysisTimestamp?: number;
    analysisCompletedTimestamp?: number;
    lastTaskCompletedTimestamp?: number;
  };
}

/**
 * Create a new meeting analysis state
 */
export function createMeetingAnalysisState(
  overrides: Partial<MeetingAnalysisState> = {},
): MeetingAnalysisState {
  // First create a base state
  const baseState = createBaseAgentState({
    agentId: overrides.agentId || 'meeting-analysis-agent',
    ...overrides,
  });

  const now = Date.now();
  
  // Default for meeting metadata
  const defaultMetadata: MeetingMetadata = {
    meetingId: overrides.meetingId || `meeting-${baseState.runId}`,
    participants: overrides.metadata?.participants || [],
    title: overrides.metadata?.title || '',
  };

  // Default for transcript
  const defaultTranscript: MeetingTranscript = {
    meetingId: overrides.meetingId || `meeting-${baseState.runId}`,
    segments: overrides.transcript?.segments || [],
    rawText: overrides.transcript?.rawText || '',
  };

  // Default for progress
  const defaultProgress: AnalysisProgress = {
    meetingId: overrides.meetingId || `meeting-${baseState.runId}`,
    goals: overrides.progress?.goals || [],
    taskStatuses: overrides.progress?.taskStatuses || {},
    overallProgress: overrides.progress?.overallProgress || 0,
    started: overrides.progress?.started || now,
    lastUpdated: overrides.progress?.lastUpdated || now,
  };

  const meetingState: MeetingAnalysisState = {
    ...baseState,
    meetingId: overrides.meetingId || `meeting-${baseState.runId}`,
    metadata: overrides.metadata || defaultMetadata,
    transcript: overrides.transcript || defaultTranscript,
    segments: overrides.segments || [],
    team: overrides.team,
    goals: overrides.goals || [],
    tasks: overrides.tasks || {},
    progress: overrides.progress || defaultProgress,
    results: overrides.results,
    executionId: overrides.executionId || `exec-${baseState.runId}`,
    startTime: overrides.startTime || now,
    endTime: overrides.endTime,
    agenticStatus: overrides.agenticStatus || 'pending',
    errors: overrides.errors || [],
    currentlyProcessingTaskId: overrides.currentlyProcessingTaskId,
    taskCompletionMap: overrides.taskCompletionMap || {},
    annotationHistory: overrides.annotationHistory || [],
    workflow: {
      lastPartialAnalysisTimestamp: overrides.workflow?.lastPartialAnalysisTimestamp,
      analysisCompletedTimestamp: overrides.workflow?.analysisCompletedTimestamp,
      lastTaskCompletedTimestamp: overrides.workflow?.lastTaskCompletedTimestamp,
    },
  };

  return meetingState;
}

/**
 * Add a partial analysis to the state
 */
export function addPartialAnalysis(
  state: MeetingAnalysisState,
  analysisText: string,
  taskId: string,
  agentId: string = state.agentId,
): MeetingAnalysisState {
  // Add to annotation history
  const updatedAnnotationHistory = [
    ...(state.annotationHistory || []),
    {
      taskId,
      agentId,
      timestamp: Date.now(),
      annotation: analysisText,
    },
  ];

  // Update task status if needed
  const updatedTasks = { ...state.tasks };
  if (updatedTasks[taskId]) {
    updatedTasks[taskId] = {
      ...updatedTasks[taskId],
      status: AnalysisTaskStatus.IN_PROGRESS,
      updated: Date.now(),
    };
  }

  // Update progress
  const updatedProgress = {
    ...state.progress,
    taskStatuses: {
      ...state.progress.taskStatuses,
      [taskId]: AnalysisTaskStatus.IN_PROGRESS,
    },
    lastUpdated: Date.now(),
  };

  // Calculate overall progress
  const totalTasks = Object.keys(updatedTasks).length;
  const completedTasks = Object.values(updatedTasks).filter(
    task => task.status === AnalysisTaskStatus.COMPLETED
  ).length;
  const inProgressTasks = Object.values(updatedTasks).filter(
    task => task.status === AnalysisTaskStatus.IN_PROGRESS
  ).length;
  
  updatedProgress.overallProgress = totalTasks 
    ? Math.floor((completedTasks * 100 + inProgressTasks * 50) / totalTasks)
    : 0;

  return {
    ...state,
    annotationHistory: updatedAnnotationHistory,
    tasks: updatedTasks,
    progress: updatedProgress,
    currentlyProcessingTaskId: taskId,
    agenticStatus: 'in_progress',
    metadata: {
      ...state.metadata,
    },
    workflow: {
      ...state.workflow,
      lastPartialAnalysisTimestamp: Date.now(),
    },
  };
}

/**
 * Set the analysis result
 */
export function setAnalysisResult(
  state: MeetingAnalysisState,
  result: AnalysisResults,
): MeetingAnalysisState {
  const now = Date.now();
  
  return {
    ...state,
    results: result,
    agenticStatus: 'completed',
    endTime: now,
    progress: {
      ...state.progress,
      overallProgress: 100,
      lastUpdated: now,
    },
    metadata: {
      ...state.metadata,
    },
    workflow: {
      ...state.workflow,
      analysisCompletedTimestamp: now,
    },
  };
}

/**
 * Mark a task as completed
 */
export function completeTask(
  state: MeetingAnalysisState,
  taskId: string,
  output?: AgentOutput,
): MeetingAnalysisState {
  const now = Date.now();
  
  // Update the task
  const updatedTasks = { ...state.tasks };
  if (updatedTasks[taskId]) {
    updatedTasks[taskId] = {
      ...updatedTasks[taskId],
      status: AnalysisTaskStatus.COMPLETED,
      updated: now,
      output,
    };
  }

  // Update task completion map
  const updatedTaskCompletionMap = {
    ...state.taskCompletionMap,
    [taskId]: true,
  };

  // Update progress
  const updatedProgress = {
    ...state.progress,
    taskStatuses: {
      ...state.progress.taskStatuses,
      [taskId]: AnalysisTaskStatus.COMPLETED,
    },
    lastUpdated: now,
  };

  // Calculate overall progress
  const totalTasks = Object.keys(updatedTasks).length;
  const completedTasks = Object.values(updatedTasks).filter(
    task => task.status === AnalysisTaskStatus.COMPLETED
  ).length;
  
  updatedProgress.overallProgress = totalTasks 
    ? Math.floor((completedTasks * 100) / totalTasks)
    : 0;

  // Check if all tasks are completed
  const allTasksCompleted = totalTasks > 0 && completedTasks === totalTasks;

  return {
    ...state,
    tasks: updatedTasks,
    taskCompletionMap: updatedTaskCompletionMap,
    progress: updatedProgress,
    agenticStatus: allTasksCompleted ? 'completed' : state.agenticStatus,
    endTime: allTasksCompleted ? now : state.endTime,
    metadata: {
      ...state.metadata,
    },
    workflow: {
      ...state.workflow,
      lastTaskCompletedTimestamp: now,
    },
  };
}
