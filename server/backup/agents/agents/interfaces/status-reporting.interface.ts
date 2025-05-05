/**
 * Status Reporting Interface
 *
 * Defines standardized formats for agent status updates, progress tracking,
 * and coordination to support team-wide awareness of task progress.
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Status update priority levels
 */
export enum StatusPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Types of status updates
 */
export enum StatusUpdateType {
  PROGRESS = 'progress', // Regular progress update
  MILESTONE = 'milestone', // Milestone completion
  BLOCKER = 'blocker', // Issue blocking progress
  ASSISTANCE = 'assistance', // Request for help
  DEVIATION = 'deviation', // Deviation from plan
  RESOURCE = 'resource', // Resource availability update
  DEPENDENCY = 'dependency', // Dependency status
  COMPLETION = 'completion', // Task completion
}

/**
 * Progress status categories
 */
export enum ProgressStatus {
  NOT_STARTED = 'not_started',
  PLANNING = 'planning',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  WAITING_FOR_DEPENDENCY = 'waiting_for_dependency',
  REVIEW = 'review',
  COMPLETED = 'completed',
  ABANDONED = 'abandoned',
}

/**
 * Base interface for status updates
 */
export interface StatusUpdate {
  id: string;
  agentId: string;
  taskId: string;
  timestamp: number;
  type: StatusUpdateType;
  priority: StatusPriority;
  message: string;
  metadata?: Record<string, any>;
}

/**
 * Progress update for task advancement
 */
export interface ProgressUpdate extends StatusUpdate {
  type: StatusUpdateType.PROGRESS;
  status: ProgressStatus;
  percentComplete: number; // 0-100
  timeSpent: number; // In milliseconds
  estimatedTimeRemaining?: number; // In milliseconds
  subtasksCompleted?: number;
  subtasksTotal?: number;
  metrics?: Record<string, number>;
  recentActivities?: string[];
}

/**
 * Milestone completion update
 */
export interface MilestoneUpdate extends StatusUpdate {
  type: StatusUpdateType.MILESTONE;
  milestoneName: string;
  outcomes: string[];
  deliverables?: string[];
  impactedTasks?: string[];
  nextMilestones?: string[];
}

/**
 * Blocker or impediment report
 */
export interface BlockerUpdate extends StatusUpdate {
  type: StatusUpdateType.BLOCKER;
  blockerDescription: string;
  impact: 'minor' | 'moderate' | 'major' | 'critical';
  estimatedResolutionTime?: number;
  potentialSolutions?: string[];
  resourcesNeeded?: string[];
  affectedTasks?: string[];
  escalationLevel?: number; // Higher numbers mean broader escalation
}

/**
 * Assistance request
 */
export interface AssistanceRequest extends StatusUpdate {
  type: StatusUpdateType.ASSISTANCE;
  requestType: 'information' | 'resource' | 'expertise' | 'review' | 'decision';
  requestDescription: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  expertise?: string[];
  context?: string;
  attemptedSolutions?: string[];
  possibleAssistants?: string[]; // Agent IDs that might be able to help
  requiredBy?: number; // Timestamp when assistance is needed by
}

/**
 * Plan deviation notification
 */
export interface DeviationUpdate extends StatusUpdate {
  type: StatusUpdateType.DEVIATION;
  originalPlan: any;
  currentState: any;
  deviationReason: string;
  severity: 'minor' | 'moderate' | 'significant' | 'critical';
  impact: string;
  mitigationStrategy?: string;
  recommendedAdjustments?: any;
}

/**
 * Resource status update
 */
export interface ResourceUpdate extends StatusUpdate {
  type: StatusUpdateType.RESOURCE;
  resourceType: string;
  resourceId: string;
  availability: 'available' | 'limited' | 'unavailable';
  usageLevel: number; // 0-1 representing current usage
  estimatedAvailabilityTime?: number; // When resource will be available
  alternatives?: string[]; // Alternative resources
}

/**
 * Dependency status update
 */
export interface DependencyUpdate extends StatusUpdate {
  type: StatusUpdateType.DEPENDENCY;
  dependencyTaskId: string;
  dependencyStatus: ProgressStatus;
  isBlocking: boolean;
  expectedResolutionTime?: number;
  impact: 'minor' | 'moderate' | 'major' | 'critical';
  alternativeApproaches?: string[];
}

/**
 * Task completion report
 */
export interface CompletionUpdate extends StatusUpdate {
  type: StatusUpdateType.COMPLETION;
  completionLevel: 'partial' | 'complete' | 'exceeds_expectations';
  outputs: any[];
  qualityMetrics?: Record<string, number>;
  lessonsLearned?: string[];
  nextSteps?: string[];
  relatedTaskIds?: string[];
}

/**
 * Status anomaly detection result
 */
export interface StatusAnomaly {
  id: string;
  timestamp: number;
  agentId: string;
  taskId: string;
  anomalyType:
    | 'progress_slowdown'
    | 'resource_overuse'
    | 'quality_drop'
    | 'pattern_deviation'
    | 'coordination_issue';
  severity: number; // 0-1
  description: string;
  detectionMethod: string;
  relatedStatusUpdates: string[];
  recommendedActions?: string[];
}

/**
 * Status update summary for a task
 */
export interface TaskStatusSummary {
  taskId: string;
  status: ProgressStatus;
  lastUpdateTime: number;
  percentComplete: number;
  activeBlockers: BlockerUpdate[];
  pendingAssistanceRequests: AssistanceRequest[];
  recentUpdates: StatusUpdate[];
  predictedCompletion?: number; // Estimated completion timestamp
  healthIndicator: 'healthy' | 'at_risk' | 'blocked' | 'unknown';
  metrics: Record<string, number>;
}

/**
 * Status update helper functions
 */

export function createStatusUpdate(
  agentId: string,
  taskId: string,
  type: StatusUpdateType,
  message: string,
  priority: StatusPriority = StatusPriority.NORMAL,
  metadata?: Record<string, any>,
): StatusUpdate {
  return {
    id: uuidv4(),
    agentId,
    taskId,
    timestamp: Date.now(),
    type,
    priority,
    message,
    metadata,
  };
}

export function createProgressUpdate(
  agentId: string,
  taskId: string,
  status: ProgressStatus,
  percentComplete: number,
  timeSpent: number,
  message: string,
  options: Partial<
    Omit<
      ProgressUpdate,
      | 'id'
      | 'agentId'
      | 'taskId'
      | 'timestamp'
      | 'type'
      | 'status'
      | 'percentComplete'
      | 'timeSpent'
      | 'message'
    >
  > = {},
): ProgressUpdate {
  return {
    ...createStatusUpdate(
      agentId,
      taskId,
      StatusUpdateType.PROGRESS,
      message,
      options.priority,
    ),
    status,
    percentComplete,
    timeSpent,
    ...options,
  } as ProgressUpdate;
}

export function createBlockerUpdate(
  agentId: string,
  taskId: string,
  blockerDescription: string,
  impact: BlockerUpdate['impact'],
  message: string,
  options: Partial<
    Omit<
      BlockerUpdate,
      | 'id'
      | 'agentId'
      | 'taskId'
      | 'timestamp'
      | 'type'
      | 'blockerDescription'
      | 'impact'
      | 'message'
    >
  > = {},
): BlockerUpdate {
  return {
    ...createStatusUpdate(
      agentId,
      taskId,
      StatusUpdateType.BLOCKER,
      message,
      impact === 'critical'
        ? StatusPriority.CRITICAL
        : impact === 'major'
          ? StatusPriority.HIGH
          : impact === 'moderate'
            ? StatusPriority.NORMAL
            : StatusPriority.LOW,
    ),
    blockerDescription,
    impact,
    ...options,
  } as BlockerUpdate;
}

export function createAssistanceRequest(
  agentId: string,
  taskId: string,
  requestType: AssistanceRequest['requestType'],
  requestDescription: string,
  urgency: AssistanceRequest['urgency'],
  message: string,
  options: Partial<
    Omit<
      AssistanceRequest,
      | 'id'
      | 'agentId'
      | 'taskId'
      | 'timestamp'
      | 'type'
      | 'requestType'
      | 'requestDescription'
      | 'urgency'
      | 'message'
    >
  > = {},
): AssistanceRequest {
  return {
    ...createStatusUpdate(
      agentId,
      taskId,
      StatusUpdateType.ASSISTANCE,
      message,
      urgency === 'critical'
        ? StatusPriority.CRITICAL
        : urgency === 'high'
          ? StatusPriority.HIGH
          : urgency === 'medium'
            ? StatusPriority.NORMAL
            : StatusPriority.LOW,
    ),
    requestType,
    requestDescription,
    urgency,
    ...options,
  } as AssistanceRequest;
}
