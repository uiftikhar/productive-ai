/**
 * Interruption Handler Service Implementation
 * Part of Milestone 2.3: Human-in-the-Loop Integration
 */
import { v4 as uuidv4 } from 'uuid';
import {
  InterruptionHandlerService,
  CheckpointService,
  StateCaptureService,
  Interruption,
  Checkpoint,
  InterruptionStatus,
  InterruptionType,
  ContinuationAction,
  InterruptionEvent,
  CheckpointCondition
} from '../interfaces/interruption.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Configuration for the interruption handler
 */
export interface InterruptionHandlerConfig {
  defaultExpirationTime?: number; // milliseconds
  automaticStateCapture?: boolean;
  abortOnExpiration?: boolean;
  cleanupInterval?: number; // milliseconds
  logger?: Logger;
}

/**
 * Implementation of checkpoint service
 */
export class CheckpointServiceImpl implements CheckpointService {
  private checkpoints: Map<string, Checkpoint> = new Map();
  private logger: Logger;
  
  /**
   * Create a new checkpoint service
   */
  constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
  }
  
  /**
   * Register a checkpoint in a workflow
   */
  async registerCheckpoint(checkpoint: Omit<Checkpoint, 'id'>): Promise<Checkpoint> {
    const id = uuidv4();
    const fullCheckpoint: Checkpoint = {
      id,
      ...checkpoint
    };
    
    this.checkpoints.set(id, fullCheckpoint);
    this.logger.info(`Registered checkpoint: ${id}`, { name: fullCheckpoint.name });
    
    return fullCheckpoint;
  }
  
  /**
   * Get a checkpoint by ID
   */
  async getCheckpoint(id: string): Promise<Checkpoint | null> {
    return this.checkpoints.get(id) || null;
  }
  
  /**
   * Get all checkpoints for a node
   */
  async getCheckpointsForNode(nodeId: string): Promise<Checkpoint[]> {
    return Array.from(this.checkpoints.values())
      .filter(checkpoint => checkpoint.nodeId === nodeId);
  }
  
  /**
   * Check if a checkpoint should be triggered
   */
  async shouldTriggerCheckpoint(checkpointId: string, context: any): Promise<boolean> {
    const checkpoint = await this.getCheckpoint(checkpointId);
    
    if (!checkpoint) {
      return false;
    }
    
    // If no condition is specified, always trigger
    if (!checkpoint.condition) {
      return true;
    }
    
    return this.evaluateCondition(checkpoint.condition, context);
  }
  
  /**
   * Delete a checkpoint
   */
  async deleteCheckpoint(id: string): Promise<boolean> {
    const exists = this.checkpoints.has(id);
    
    if (exists) {
      this.checkpoints.delete(id);
      this.logger.info(`Deleted checkpoint: ${id}`);
    }
    
    return exists;
  }
  
  /**
   * Evaluate a checkpoint condition
   */
  private evaluateCondition(condition: CheckpointCondition, context: any): boolean {
    switch (condition.type) {
      case 'always':
        return true;
        
      case 'expression':
        if (!condition.expression) {
          return true;
        }
        
        try {
          // Create a safe evaluation context
          const evalContext = { context };
          
          // Simple expression evaluator (in production, would need a safer approach)
          const result = new Function('context', `return ${condition.expression}`)(context);
          return Boolean(result);
        } catch (error) {
          this.logger.error(`Error evaluating expression: ${condition.expression}`, { error });
          return false;
        }
        
      case 'probability':
        if (condition.probability === undefined) {
          return true;
        }
        
        // Trigger based on probability
        return Math.random() < condition.probability;
        
      case 'metric':
        if (!condition.metric) {
          return true;
        }
        
        // Get metric value from context
        const metricValue = context?.[condition.metric.name];
        
        if (metricValue === undefined) {
          return false;
        }
        
        // Compare metric value
        switch (condition.metric.operator) {
          case 'gt': return metricValue > condition.metric.value;
          case 'lt': return metricValue < condition.metric.value;
          case 'eq': return metricValue === condition.metric.value;
          case 'gte': return metricValue >= condition.metric.value;
          case 'lte': return metricValue <= condition.metric.value;
          default: return false;
        }
        
      default:
        return false;
    }
  }
}

/**
 * Simple in-memory implementation of the state capture service
 */
export class InMemoryStateCaptureService implements StateCaptureService {
  private states: Map<string, any> = new Map();
  private logger: Logger;
  
  /**
   * Create a new state capture service
   */
  constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
  }
  
  /**
   * Capture the current state of a workflow
   */
  async captureState(workflowId: string, nodeId: string): Promise<any> {
    // In a real implementation, this would query the workflow state
    // For this simple version, we'll create a placeholder state
    const state = {
      workflowId,
      nodeId,
      capturedAt: new Date(),
      data: {
        // This would be populated with actual workflow state
        currentNodeId: nodeId,
        timestamp: new Date(),
        variables: {}
      }
    };
    
    // Store the state
    const stateKey = `${workflowId}:${new Date().getTime()}`;
    this.states.set(stateKey, state);
    
    this.logger.debug(`Captured state for workflow: ${workflowId}`, { nodeId });
    
    return state;
  }
  
  /**
   * Restore a previously captured state
   */
  async restoreState(workflowId: string, state: any): Promise<boolean> {
    // In a real implementation, this would restore the workflow state
    this.logger.info(`Restoring state for workflow: ${workflowId}`);
    return true;
  }
  
  /**
   * Get differences between two states
   */
  async getStateDiff(originalState: any, modifiedState: any): Promise<any> {
    // Simple diff implementation
    const diff: Record<string, { original: any; modified: any }> = {};
    
    // Compare modified state against original
    for (const key in modifiedState) {
      if (JSON.stringify(originalState[key]) !== JSON.stringify(modifiedState[key])) {
        diff[key] = {
          original: originalState[key],
          modified: modifiedState[key]
        };
      }
    }
    
    // Check for keys in original that are not in modified
    for (const key in originalState) {
      if (!(key in modifiedState)) {
        diff[key] = {
          original: originalState[key],
          modified: undefined
        };
      }
    }
    
    return diff;
  }
}

/**
 * Implementation of the interruption handler service
 */
export class InterruptionHandlerServiceImpl implements InterruptionHandlerService {
  private interruptions: Map<string, Interruption> = new Map();
  private eventSubscriptions: Map<string, (event: InterruptionEvent) => void> = new Map();
  private logger: Logger;
  private config: InterruptionHandlerConfig;
  private checkpointService: CheckpointService;
  private stateCaptureService: StateCaptureService;
  private cleanupTimer?: NodeJS.Timeout;
  
  /**
   * Create a new interruption handler service
   */
  constructor(
    checkpointService: CheckpointService,
    stateCaptureService: StateCaptureService,
    config: InterruptionHandlerConfig = {}
  ) {
    this.checkpointService = checkpointService;
    this.stateCaptureService = stateCaptureService;
    this.logger = config.logger || new ConsoleLogger();
    
    this.config = {
      defaultExpirationTime: 24 * 60 * 60 * 1000, // 24 hours
      automaticStateCapture: true,
      abortOnExpiration: false,
      cleanupInterval: 60 * 60 * 1000, // 1 hour
      ...config
    };
    
    // Start cleanup timer
    if (this.config.cleanupInterval && this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanupExpiredInterruptions();
      }, this.config.cleanupInterval);
    }
    
    this.logger.info('Interruption handler service initialized');
  }
  
  /**
   * Create a new interruption
   */
  async createInterruption(
    interruption: Omit<Interruption, 'id' | 'status' | 'createdAt'>
  ): Promise<Interruption> {
    const id = uuidv4();
    const now = new Date();
    
    // Capture state if enabled and not already provided
    let state = interruption.state;
    
    if (!state && this.config.automaticStateCapture) {
      try {
        state = await this.stateCaptureService.captureState(
          interruption.workflowId,
          interruption.nodeId
        );
      } catch (error) {
        this.logger.error('Error capturing workflow state', { error });
      }
    }
    
    const fullInterruption: Interruption = {
      id,
      status: InterruptionStatus.ACTIVE,
      createdAt: now,
      ...interruption,
      state,
      expiresAt: interruption.expiresAt || new Date(now.getTime() + (this.config.defaultExpirationTime || 0))
    };
    
    // Store the interruption
    this.interruptions.set(id, fullInterruption);
    
    // Emit event for creation
    this.emitEvent({
      type: 'interruption_created',
      timestamp: new Date(),
      interruptionId: id,
      interruption: fullInterruption,
      workflowId: fullInterruption.workflowId,
      agentId: fullInterruption.agentId
    });
    
    this.logger.info(`Created interruption: ${id}`, {
      type: fullInterruption.type,
      workflowId: fullInterruption.workflowId,
      nodeId: fullInterruption.nodeId
    });
    
    return fullInterruption;
  }
  
  /**
   * Get an interruption by ID
   */
  async getInterruption(id: string): Promise<Interruption | null> {
    const interruption = this.interruptions.get(id);
    
    if (!interruption) {
      return null;
    }
    
    // Check if it's expired
    if (interruption.status === InterruptionStatus.ACTIVE && 
        interruption.expiresAt && 
        interruption.expiresAt < new Date()) {
      // Update status to expired
      interruption.status = InterruptionStatus.EXPIRED;
      this.interruptions.set(id, interruption);
      
      // Emit expiration event
      this.emitEvent({
        type: 'interruption_expired',
        timestamp: new Date(),
        interruptionId: id,
        interruption,
        workflowId: interruption.workflowId,
        agentId: interruption.agentId
      });
      
      // Abort workflow if configured
      if (this.config.abortOnExpiration) {
        await this.abortWorkflow(id, 'Interruption expired');
      }
    }
    
    return interruption;
  }
  
  /**
   * Resolve an interruption
   */
  async resolveInterruption(
    id: string, 
    action: ContinuationAction,
    options: {
      modifications?: any;
      comments?: string;
      resolvedBy?: string;
    } = {}
  ): Promise<Interruption> {
    const interruption = await this.getInterruption(id);
    
    if (!interruption) {
      throw new Error(`Interruption not found: ${id}`);
    }
    
    if (interruption.status !== InterruptionStatus.ACTIVE) {
      throw new Error(`Cannot resolve interruption with status: ${interruption.status}`);
    }
    
    // Update the interruption
    const updatedInterruption: Interruption = {
      ...interruption,
      status: InterruptionStatus.RESOLVED,
      resolvedAt: new Date(),
      resolvedBy: options.resolvedBy,
      resolution: {
        action,
        modifications: options.modifications,
        comments: options.comments
      }
    };
    
    // Store the updated interruption
    this.interruptions.set(id, updatedInterruption);
    
    // Handle the resolution based on the action
    if (action === ContinuationAction.MODIFY && options.modifications) {
      try {
        // In a real implementation, this would apply the modifications to the workflow state
        await this.stateCaptureService.restoreState(
          interruption.workflowId, 
          {
            ...interruption.state,
            ...options.modifications
          }
        );
      } catch (error) {
        this.logger.error(`Error applying modifications to workflow: ${interruption.workflowId}`, { error });
      }
    } else if (action === ContinuationAction.RESUME) {
      try {
        // In a real implementation, this would resume the workflow
        await this.stateCaptureService.restoreState(interruption.workflowId, interruption.state);
      } catch (error) {
        this.logger.error(`Error resuming workflow: ${interruption.workflowId}`, { error });
      }
    } else if (action === ContinuationAction.RESTART) {
      // In a real implementation, this would restart the workflow
    } else if (action === ContinuationAction.ABORT) {
      // Already handled by abortWorkflow
    } else if (action === ContinuationAction.ALTERNATIVE) {
      // In a real implementation, this would take an alternative path
    }
    
    // Emit resolution event
    this.emitEvent({
      type: 'interruption_resolved',
      timestamp: new Date(),
      interruptionId: id,
      interruption: updatedInterruption,
      workflowId: updatedInterruption.workflowId,
      agentId: updatedInterruption.agentId,
      actorId: options.resolvedBy
    });
    
    this.logger.info(`Resolved interruption: ${id}`, {
      action,
      resolvedBy: options.resolvedBy,
      comments: options.comments
    });
    
    return updatedInterruption;
  }
  
  /**
   * Abort a workflow due to interruption
   */
  async abortWorkflow(interruptionId: string, reason?: string): Promise<Interruption> {
    const interruption = await this.getInterruption(interruptionId);
    
    if (!interruption) {
      throw new Error(`Interruption not found: ${interruptionId}`);
    }
    
    // Update the interruption
    const updatedInterruption: Interruption = {
      ...interruption,
      status: InterruptionStatus.ABORTED,
      resolvedAt: new Date(),
      resolution: {
        action: ContinuationAction.ABORT,
        comments: reason
      }
    };
    
    // Store the updated interruption
    this.interruptions.set(interruptionId, updatedInterruption);
    
    // In a real implementation, this would abort the workflow
    
    // Emit abort event
    this.emitEvent({
      type: 'interruption_resolved',
      timestamp: new Date(),
      interruptionId,
      interruption: updatedInterruption,
      workflowId: updatedInterruption.workflowId,
      agentId: updatedInterruption.agentId
    });
    
    this.logger.info(`Aborted workflow due to interruption: ${interruptionId}`, {
      workflowId: interruption.workflowId,
      reason: reason || 'No reason provided'
    });
    
    return updatedInterruption;
  }
  
  /**
   * Get active interruptions for a workflow
   */
  async getActiveInterruptionsForWorkflow(workflowId: string): Promise<Interruption[]> {
    const activeInterruptions: Interruption[] = [];
    
    for (const interruption of this.interruptions.values()) {
      if (interruption.workflowId === workflowId && interruption.status === InterruptionStatus.ACTIVE) {
        // Check if it's expired
        if (interruption.expiresAt && interruption.expiresAt < new Date()) {
          // Update status to expired
          interruption.status = InterruptionStatus.EXPIRED;
          this.interruptions.set(interruption.id, interruption);
          
          // Emit expiration event
          this.emitEvent({
            type: 'interruption_expired',
            timestamp: new Date(),
            interruptionId: interruption.id,
            interruption,
            workflowId: interruption.workflowId,
            agentId: interruption.agentId
          });
          
          // Abort workflow if configured
          if (this.config.abortOnExpiration) {
            await this.abortWorkflow(interruption.id, 'Interruption expired');
          }
        } else {
          activeInterruptions.push(interruption);
        }
      }
    }
    
    return activeInterruptions;
  }
  
  /**
   * Get active interruptions for an agent
   */
  async getActiveInterruptionsForAgent(agentId: string): Promise<Interruption[]> {
    const activeInterruptions: Interruption[] = [];
    
    for (const interruption of this.interruptions.values()) {
      if (interruption.agentId === agentId && interruption.status === InterruptionStatus.ACTIVE) {
        // Check if it's expired
        if (interruption.expiresAt && interruption.expiresAt < new Date()) {
          // Update status to expired
          interruption.status = InterruptionStatus.EXPIRED;
          this.interruptions.set(interruption.id, interruption);
          
          // Emit expiration event
          this.emitEvent({
            type: 'interruption_expired',
            timestamp: new Date(),
            interruptionId: interruption.id,
            interruption,
            workflowId: interruption.workflowId,
            agentId: interruption.agentId
          });
          
          // Abort workflow if configured
          if (this.config.abortOnExpiration) {
            await this.abortWorkflow(interruption.id, 'Interruption expired');
          }
        } else {
          activeInterruptions.push(interruption);
        }
      }
    }
    
    return activeInterruptions;
  }
  
  /**
   * Subscribe to interruption events
   */
  subscribeToEvents(callback: (event: InterruptionEvent) => void): string {
    const subscriptionId = uuidv4();
    this.eventSubscriptions.set(subscriptionId, callback);
    return subscriptionId;
  }
  
  /**
   * Unsubscribe from interruption events
   */
  unsubscribeFromEvents(subscriptionId: string): boolean {
    return this.eventSubscriptions.delete(subscriptionId);
  }
  
  /**
   * Emit an interruption event to all subscribers
   */
  private emitEvent(event: InterruptionEvent): void {
    for (const callback of this.eventSubscriptions.values()) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error('Error in interruption event subscriber', { error });
      }
    }
  }
  
  /**
   * Clean up expired interruptions
   */
  private async cleanupExpiredInterruptions(): Promise<void> {
    const now = new Date();
    let expiredCount = 0;
    
    for (const interruption of this.interruptions.values()) {
      if (
        interruption.status === InterruptionStatus.ACTIVE && 
        interruption.expiresAt && 
        interruption.expiresAt < now
      ) {
        // Update status to expired
        interruption.status = InterruptionStatus.EXPIRED;
        this.interruptions.set(interruption.id, interruption);
        
        // Emit expiration event
        this.emitEvent({
          type: 'interruption_expired',
          timestamp: now,
          interruptionId: interruption.id,
          interruption,
          workflowId: interruption.workflowId,
          agentId: interruption.agentId
        });
        
        // Abort workflow if configured
        if (this.config.abortOnExpiration) {
          await this.abortWorkflow(interruption.id, 'Interruption expired');
        }
        
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      this.logger.info(`Cleaned up ${expiredCount} expired interruptions`);
    }
  }
  
  /**
   * Clean up resources on shutdown
   */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
} 