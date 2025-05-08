/**
 * Interruption System Interfaces
 * Part of Milestone 2.3: Human-in-the-Loop Integration
 */

/**
 * Types of interruption points in agent workflows
 */
export enum InterruptionType {
  CHECKPOINT = 'checkpoint',     // Planned pause for verification
  EXTERNAL = 'external',         // Unplanned interruption from outside
  ERROR = 'error',               // System error causing interruption
  TIMEOUT = 'timeout',           // Time-based interruption
  THRESHOLD = 'threshold',       // Metric threshold reached
  MANUAL = 'manual',             // Manual interruption by user
  APPROVAL = 'approval'          // Approval-related interruption
}

/**
 * Status of an interruption
 */
export enum InterruptionStatus {
  ACTIVE = 'active',             // Interruption is active
  RESOLVED = 'resolved',         // Interruption has been resolved
  ABORTED = 'aborted',           // Workflow was aborted due to interruption
  EXPIRED = 'expired',           // Interruption timed out
  IGNORED = 'ignored'            // Interruption was ignored
}

/**
 * Continuation action after an interruption
 */
export enum ContinuationAction {
  RESUME = 'resume',             // Resume from interruption point
  RESTART = 'restart',           // Restart the workflow
  MODIFY = 'modify',             // Modify and then resume
  ABORT = 'abort',               // Abort the workflow
  ALTERNATIVE = 'alternative'    // Take an alternative path
}

/**
 * Checkpoint definition for workflow
 */
export interface Checkpoint {
  id: string;
  name: string;
  description?: string;
  nodeId: string;  // ID of the graph node
  condition?: CheckpointCondition;
  requiredApproval?: boolean;
  autoResumeAfter?: number; // milliseconds
  metadata?: Record<string, any>;
}

/**
 * Condition for when to trigger a checkpoint
 */
export interface CheckpointCondition {
  type: 'always' | 'expression' | 'probability' | 'metric';
  expression?: string; // JS expression that evaluates to boolean
  probability?: number; // 0-1 chance of checkpoint triggering
  metric?: {
    name: string;
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte';
    value: number;
  };
}

/**
 * Interruption instance
 */
export interface Interruption {
  id: string;
  type: InterruptionType;
  status: InterruptionStatus;
  workflowId: string;  // ID of the workflow being interrupted
  agentId: string;
  nodeId: string;      // Current node when interrupted
  checkpointId?: string;
  createdAt: Date;
  resolvedAt?: Date;
  createdBy?: string;  // User or system ID that created the interruption
  resolvedBy?: string;
  state: any;          // Captured workflow state
  reason?: string;
  resolution?: {
    action: ContinuationAction;
    modifications?: any;
    comments?: string;
  };
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

/**
 * Checkpoint service interface
 */
export interface CheckpointService {
  /**
   * Register a checkpoint in a workflow
   */
  registerCheckpoint(checkpoint: Omit<Checkpoint, 'id'>): Promise<Checkpoint>;
  
  /**
   * Get a checkpoint by ID
   */
  getCheckpoint(id: string): Promise<Checkpoint | null>;
  
  /**
   * Get all checkpoints for a node
   */
  getCheckpointsForNode(nodeId: string): Promise<Checkpoint[]>;
  
  /**
   * Check if a checkpoint should be triggered
   */
  shouldTriggerCheckpoint(checkpointId: string, context: any): Promise<boolean>;
  
  /**
   * Delete a checkpoint
   */
  deleteCheckpoint(id: string): Promise<boolean>;
}

/**
 * Interruption handler service interface
 */
export interface InterruptionHandlerService {
  /**
   * Create a new interruption
   */
  createInterruption(
    interruption: Omit<Interruption, 'id' | 'status' | 'createdAt'>
  ): Promise<Interruption>;
  
  /**
   * Get an interruption by ID
   */
  getInterruption(id: string): Promise<Interruption | null>;
  
  /**
   * Resolve an interruption
   */
  resolveInterruption(
    id: string, 
    action: ContinuationAction,
    options?: {
      modifications?: any;
      comments?: string;
      resolvedBy?: string;
    }
  ): Promise<Interruption>;
  
  /**
   * Abort a workflow due to interruption
   */
  abortWorkflow(interruptionId: string, reason?: string): Promise<Interruption>;
  
  /**
   * Get active interruptions for a workflow
   */
  getActiveInterruptionsForWorkflow(workflowId: string): Promise<Interruption[]>;
  
  /**
   * Get active interruptions for an agent
   */
  getActiveInterruptionsForAgent(agentId: string): Promise<Interruption[]>;
  
  /**
   * Subscribe to interruption events
   */
  subscribeToEvents(callback: (event: InterruptionEvent) => void): string;
  
  /**
   * Unsubscribe from interruption events
   */
  unsubscribeFromEvents(subscriptionId: string): boolean;
}

/**
 * Interruption event for notification
 */
export interface InterruptionEvent {
  type: 'interruption_created' | 'interruption_resolved' | 'interruption_expired';
  timestamp: Date;
  interruptionId: string;
  interruption: Interruption;
  workflowId: string;
  agentId: string;
  actorId?: string;
}

/**
 * State capture and restoration interface
 */
export interface StateCaptureService {
  /**
   * Capture the current state of a workflow
   */
  captureState(workflowId: string, nodeId: string): Promise<any>;
  
  /**
   * Restore a previously captured state
   */
  restoreState(workflowId: string, state: any): Promise<boolean>;
  
  /**
   * Get differences between two states
   */
  getStateDiff(originalState: any, modifiedState: any): Promise<any>;
} 