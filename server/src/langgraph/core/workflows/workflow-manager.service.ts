import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { SupervisorAdapter } from '../adapters/supervisor-adapter';
import { SupervisorWorkflow } from './supervisor-workflow';
import { SupervisorAgent } from '../../../agents/specialized/facilitator-supervisor-agent';
import { v4 as uuidv4 } from 'uuid';
import { UserContextFacade } from '../../../shared/services/user-context/user-context.facade';

/**
 * Service responsible for managing LangGraph workflows
 * Provides centralized creation and cleanup of workflow instances
 */
export class WorkflowManagerService {
  private static instance: WorkflowManagerService;
  private logger: Logger;
  private activeWorkflows: Map<string, SupervisorWorkflow> = new Map();
  private activeAdapters: Map<string, SupervisorAdapter> = new Map();

  /**
   * Private constructor for singleton pattern
   */
  private constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
    this.logger.info('WorkflowManagerService initialized');
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(logger?: Logger): WorkflowManagerService {
    if (!WorkflowManagerService.instance) {
      WorkflowManagerService.instance = new WorkflowManagerService(logger);
    }
    return WorkflowManagerService.instance;
  }

  /**
   * Create a new SupervisorWorkflow instance
   */
  createSupervisorWorkflow(
    agent: SupervisorAgent,
    options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
      userContext?: UserContextFacade;
      id?: string;
    } = {},
  ): SupervisorWorkflow {
    const workflowId = options.id || `supervisor-workflow-${uuidv4()}`;

    const workflow = new SupervisorWorkflow(agent, {
      tracingEnabled: options.tracingEnabled,
      includeStateInLogs: options.includeStateInLogs,
      logger: this.logger,
      userContext: options.userContext,
      id: workflowId,
    });

    this.activeWorkflows.set(workflowId, workflow);
    this.logger.info(
      `Created and registered SupervisorWorkflow: ${workflowId}`,
    );

    return workflow;
  }

  /**
   * Create a new SupervisorAdapter instance
   */
  createSupervisorAdapter(
    agent: SupervisorAgent,
    options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
      userContext?: UserContextFacade;
      workflowId?: string;
      maxRecoveryAttempts?: number;
      retryDelayMs?: number;
      errorHandlingLevel?: 'basic' | 'advanced';
    } = {},
  ): SupervisorAdapter {
    const adapterId = `supervisor-adapter-${uuidv4()}`;

    const adapter = new SupervisorAdapter(agent, {
      tracingEnabled: options.tracingEnabled,
      includeStateInLogs: options.includeStateInLogs,
      logger: this.logger,
      userContext: options.userContext,
      workflowId: options.workflowId,
      maxRecoveryAttempts: options.maxRecoveryAttempts,
      retryDelayMs: options.retryDelayMs,
      errorHandlingLevel: options.errorHandlingLevel,
    });

    this.activeAdapters.set(adapterId, adapter);
    this.logger.info(`Created and registered SupervisorAdapter: ${adapterId}`);

    return adapter;
  }

  /**
   * Get a workflow by ID
   */
  getWorkflow(workflowId: string): SupervisorWorkflow | undefined {
    return this.activeWorkflows.get(workflowId);
  }

  /**
   * Remove a workflow from management
   */
  removeWorkflow(workflowId: string): boolean {
    const workflow = this.activeWorkflows.get(workflowId);

    if (workflow) {
      workflow.cleanup();
      this.activeWorkflows.delete(workflowId);
      this.logger.info(`Removed and cleaned up workflow: ${workflowId}`);
      return true;
    }

    return false;
  }

  /**
   * Remove an adapter from management
   */
  removeAdapter(adapterId: string): boolean {
    const adapter = this.activeAdapters.get(adapterId);

    if (adapter) {
      adapter.cleanup();
      this.activeAdapters.delete(adapterId);
      this.logger.info(`Removed and cleaned up adapter: ${adapterId}`);
      return true;
    }

    return false;
  }

  /**
   * Clean up all workflows and adapters
   */
  cleanup(): void {
    this.logger.info(
      `Cleaning up all workflows and adapters. Active workflows: ${this.activeWorkflows.size}, Active adapters: ${this.activeAdapters.size}`,
    );

    // Clean up all workflows
    for (const [id, workflow] of this.activeWorkflows.entries()) {
      try {
        workflow.cleanup();
        this.logger.debug(`Cleaned up workflow: ${id}`);
      } catch (error) {
        this.logger.error(`Error cleaning up workflow ${id}: ${error}`);
      }
    }

    // Clean up all adapters
    for (const [id, adapter] of this.activeAdapters.entries()) {
      try {
        adapter.cleanup();
        this.logger.debug(`Cleaned up adapter: ${id}`);
      } catch (error) {
        this.logger.error(`Error cleaning up adapter ${id}: ${error}`);
      }
    }

    // Clear maps
    this.activeWorkflows.clear();
    this.activeAdapters.clear();

    this.logger.info('All workflows and adapters have been cleaned up');
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  static resetInstance(): void {
    if (WorkflowManagerService.instance) {
      WorkflowManagerService.instance.cleanup();
      WorkflowManagerService.instance = undefined as any;
    }
  }
}
