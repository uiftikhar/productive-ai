import { StateGraph, Annotation } from '@langchain/langgraph';
import { END, START } from '@langchain/langgraph';
import { AgentWorkflow } from './agent-workflow';
import { BaseWorkflow, WorkflowStatus } from './base-workflow';
import { SupervisorAgent } from '../../../agents/specialized/supervisor-agent';
import { 
  AgentRequest, 
  AgentResponse, 
  BaseAgentInterface 
} from '../../../agents/interfaces/base-agent.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { Task } from '../../../agents/specialized/supervisor-agent';
import { AgentExecutionState } from './agent-workflow';

/**
 * Interface for SupervisorWorkflow state
 * Extends AgentExecutionState with supervisor-specific fields
 */
export interface SupervisorExecutionState {
  // Core fields inherited from BaseWorkflowState
  id: string;
  runId: string;
  status: string;
  startTime: number;
  endTime?: number;
  errorCount: number;
  errors: any[];
  metrics: Record<string, any>;
  metadata: Record<string, any>;
  
  // Agent fields inherited from AgentExecutionState
  agentId: string;
  input: string;
  capability?: string;
  parameters?: Record<string, any>;
  output?: string;
  artifacts?: Record<string, any>;
  messages: any[];
  
  // Supervisor-specific fields
  teamMembers: string[]; // IDs of team member agents
  tasks: Record<string, Task>; // Tasks mapped by task ID
  taskAssignments: Record<string, string>; // Task ID to Agent ID mapping
  taskStatus: Record<string, string>; // Status updates for tasks
  taskResults: Record<string, any>; // Results from completed tasks
  taskErrors: Record<string, string>; // Errors from failed tasks
  currentPhase: 'planning' | 'delegation' | 'execution' | 'monitoring' | 'completion';
  planId?: string; // ID of the current task plan
  executionStrategy?: 'sequential' | 'parallel' | 'prioritized';
}

/**
 * SupervisorWorkflow
 * 
 * Specialized workflow for the supervisor agent to coordinate multiple agents,
 * manage task delegation, handle errors, and track task execution.
 */
export class SupervisorWorkflow extends AgentWorkflow<SupervisorAgent> {
  protected logger: Logger;
  
  /**
   * Create a new SupervisorWorkflow
   */
  constructor(
    agent: SupervisorAgent,
    options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
      logger?: Logger;
    } = {},
  ) {
    super(agent, options);
    this.logger = options.logger || new ConsoleLogger();
  }
  
  /**
   * Create the state schema for supervisor workflows
   * Extends the base agent schema with supervisor-specific fields
   */
  protected createStateSchema() {
    const baseSchema = super.createStateSchema();
    
    return {
      ...baseSchema,
      // Add additional supervisor-specific fields
      teamMembers: Annotation<string[]>({
        default: () => [],
        reducer: (curr, update) => update || curr,
      }),
      tasks: Annotation<Record<string, Task>>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),
      taskAssignments: Annotation<Record<string, string>>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),
      taskStatus: Annotation<Record<string, string>>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),
      taskResults: Annotation<Record<string, any>>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),
      taskErrors: Annotation<Record<string, string>>({
        default: () => ({}),
        reducer: (curr, update) => ({ ...(curr || {}), ...(update || {}) }),
      }),
      currentPhase: Annotation<'planning' | 'delegation' | 'execution' | 'monitoring' | 'completion'>({
        default: () => 'planning',
        reducer: (curr, update) => update || curr,
      }),
      planId: Annotation<string | undefined>(),
      executionStrategy: Annotation<'sequential' | 'parallel' | 'prioritized' | undefined>(),
    };
  }
  
  /**
   * Create the state graph for supervisor workflows
   * Extends agent workflow with additional nodes for task coordination
   */
  protected createStateGraph(
    schema: ReturnType<typeof this.createStateSchema>,
  ): StateGraph<any> {
    // TypeScript has issues with the StateGraph constructor
    // @ts-ignore - Need to bypass type checking for LangGraph compatibility
    const workflow = new StateGraph(schema);
    
    // Define state type for our workflow
    type SupervisorState = {
      status: WorkflowStatus;
      taskStatus?: Record<string, string>;
      metadata?: {
        retryCount?: number;
        maxRetries?: number;
      };
    } & Record<string, any>;
    
    // Add base nodes
    workflow
      .addNode('initialize', this.createInitNode())
      .addNode('error_handler', this.createErrorHandlerNode());
      
    // Add our own nodes for pre-execute, execute, post-execute
    // to bypass access control issues with the base class
    workflow
      .addNode('complete', this.createCompletionNode())
      .addNode('pre_execute', this.createSupervisorPreExecuteNode())
      .addNode('execute', this.createSupervisorExecuteNode())
      .addNode('post_execute', this.createSupervisorPostExecuteNode());
    
    // Add supervisor-specific nodes
    workflow
      .addNode('plan_tasks', this.createPlanTasksNode())
      .addNode('delegate_tasks', this.createDelegateTasksNode())
      .addNode('execute_tasks', this.createExecuteTasksNode())
      .addNode('monitor_tasks', this.createMonitorTasksNode())
      .addNode('handle_task_failure', this.createHandleTaskFailureNode());
    
    // Define routing functions
    const routeAfterInitialization = (state: SupervisorState) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      return 'pre_execute';
    };
    
    const routeAfterPreExecution = (state: SupervisorState) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      // In supervisor workflow, we go to planning instead of direct execution
      return 'plan_tasks';
    };
    
    const routeAfterPlanning = (state: SupervisorState) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      return 'delegate_tasks';
    };
    
    const routeAfterDelegation = (state: SupervisorState) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      return 'execute_tasks';
    };
    
    const routeAfterExecution = (state: SupervisorState) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'handle_task_failure';
      }
      return 'monitor_tasks';
    };
    
    const routeAfterMonitoring = (state: SupervisorState) => {
      if (!state.taskStatus) {
        return 'post_execute';
      }
      
      // Check if all tasks are complete
      const allTasksComplete = Object.values(state.taskStatus).every(
        status => status === 'completed'
      );
      
      // Check if any tasks failed
      const anyTasksFailed = Object.values(state.taskStatus).some(
        status => status === 'failed'
      );
      
      if (anyTasksFailed) {
        return 'handle_task_failure';
      }
      
      if (allTasksComplete) {
        return 'post_execute';
      }
      
      // Continue monitoring if tasks are still in progress
      return 'monitor_tasks';
    };
    
    const routeAfterFailureHandling = (state: SupervisorState) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      
      // Check if we've exceeded the retry limit
      const retryCount = state.metadata?.retryCount || 0;
      if (retryCount >= (state.metadata?.maxRetries || 3)) {
        // Too many retries, mark as error and proceed to post-execution
        return 'post_execute';
      }
      
      // Attempt to reassign and recover
      return 'delegate_tasks';
    };
    
    const routeAfterPostExecution = (state: SupervisorState) => {
      if (state.status === WorkflowStatus.ERROR) {
        return 'error_handler';
      }
      return 'complete';
    };
    
    // Define the supervisor workflow graph
    const typedWorkflow = workflow as any;
    typedWorkflow
      .addEdge(START, 'initialize')
      .addConditionalEdges('initialize', routeAfterInitialization)
      .addConditionalEdges('pre_execute', routeAfterPreExecution)
      .addConditionalEdges('plan_tasks', routeAfterPlanning)
      .addConditionalEdges('delegate_tasks', routeAfterDelegation)
      .addConditionalEdges('execute_tasks', routeAfterExecution)
      .addConditionalEdges('monitor_tasks', routeAfterMonitoring)
      .addConditionalEdges('handle_task_failure', routeAfterFailureHandling)
      .addConditionalEdges('post_execute', routeAfterPostExecution)
      .addEdge('complete', END)
      .addEdge('error_handler', END);
    
    return workflow;
  }
  
  /**
   * Create a pre-execute node specific to supervisor workflow
   */
  private createSupervisorPreExecuteNode() {
    return async (state: AgentExecutionState) => {
      try {
        this.logger.info('Pre-executing supervisor workflow');
        
        return {
          ...state,
          status: WorkflowStatus.EXECUTING,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'pre_execute',
        );
      }
    };
  }
  
  /**
   * Create an execute node specific to supervisor workflow
   */
  private createSupervisorExecuteNode() {
    return async (state: AgentExecutionState) => {
      try {
        this.logger.info('Executing supervisor workflow');
        
        return {
          ...state,
          status: WorkflowStatus.EXECUTING,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'execute',
        );
      }
    };
  }
  
  /**
   * Create the plan tasks node
   * This node creates and organizes tasks based on the input
   */
  private createPlanTasksNode() {
    return async (state: AgentExecutionState & { 
      tasks?: Record<string, Task>; 
      planId?: string;
      currentPhase?: string;
    }) => {
      try {
        this.logger.info('Planning tasks for supervisor workflow');
        
        // Prepare task planning request
        const planningRequest: AgentRequest = {
          input: state.input,
          capability: 'task-planning',
          parameters: {
            ...state.parameters,
          },
          context: state.metadata?.context,
        };
        
        // Execute planning through the supervisor agent
        const planningResponse = await this.agent.execute(planningRequest);
        
        // Update state with planning results
        return {
          ...state,
          currentPhase: 'delegation',
          tasks: planningResponse.output && typeof planningResponse.output === 'object' 
            ? (planningResponse.output as unknown) as Record<string, Task>
            : {},
          planId: planningResponse.artifacts?.planId,
          status: WorkflowStatus.EXECUTING,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'plan_tasks',
        );
      }
    };
  }
  
  /**
   * Create the delegate tasks node
   * This node handles task assignment to team members
   */
  private createDelegateTasksNode() {
    return async (state: AgentExecutionState & { 
      tasks?: Record<string, Task>; 
      planId?: string;
      currentPhase?: string;
      teamMembers?: string[];
      taskAssignments?: Record<string, string>;
      taskStatus?: Record<string, string>;
    }) => {
      try {
        this.logger.info('Delegating tasks to team members');
        
        // Prepare task assignment request
        const delegationRequest: AgentRequest = {
          input: state.input,
          capability: 'task-assignment',
          parameters: {
            tasks: Object.values(state.tasks || {}),
            planId: state.planId,
          },
          context: state.metadata?.context,
        };
        
        // Execute delegation through the supervisor agent
        const delegationResponse = await this.agent.execute(delegationRequest);
        
        // Extract the task assignments
        const taskAssignments = delegationResponse.output && typeof delegationResponse.output === 'object'
          ? (delegationResponse.output as unknown) as Record<string, string>
          : {};
        
        // Initialize task status for all tasks as 'pending'
        const taskStatus = Object.keys(state.tasks || {}).reduce((status, taskId) => {
          status[taskId] = 'pending';
          return status;
        }, {} as Record<string, string>);
        
        // Get team members from the supervisor agent
        const teamMembers = this.agent.listTeamMembers().map(member => member.agent.id);
        
        return {
          ...state,
          currentPhase: 'execution',
          teamMembers,
          taskAssignments,
          taskStatus,
          status: WorkflowStatus.EXECUTING,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'delegate_tasks',
        );
      }
    };
  }
  
  /**
   * Create the execute tasks node
   * This node kicks off task execution using the appropriate strategy
   */
  private createExecuteTasksNode() {
    return async (state: AgentExecutionState & { 
      tasks?: Record<string, Task>; 
      planId?: string;
      currentPhase?: string;
      executionStrategy?: 'sequential' | 'parallel' | 'prioritized';
    }) => {
      try {
        this.logger.info(`Executing tasks using ${state.executionStrategy} strategy`);
        
        // Prepare work coordination request
        const executionRequest: AgentRequest = {
          input: state.input,
          capability: 'work-coordination',
          parameters: {
            tasks: Object.values(state.tasks || {}),
            executionStrategy: state.executionStrategy,
            useTaskPlanningService: !!state.planId,
            planId: state.planId,
            teamContext: state.metadata?.context,
          },
          context: state.metadata?.context,
        };
        
        // Kick off execution through the supervisor agent
        // For the workflow, we don't wait for completion here
        // We'll monitor progress in the monitoring node
        await this.agent.execute(executionRequest);
        
        return {
          ...state,
          currentPhase: 'monitoring',
          status: WorkflowStatus.EXECUTING,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'execute_tasks',
        );
      }
    };
  }
  
  /**
   * Create the monitor tasks node
   * This node checks task progress and updates state
   */
  private createMonitorTasksNode() {
    return async (state: AgentExecutionState & {
      taskStatus?: Record<string, string>;
      taskResults?: Record<string, any>;
      taskErrors?: Record<string, string>;
      currentPhase?: string;
    }) => {
      try {
        this.logger.info('Monitoring task progress');
        
        // Prepare progress tracking request
        const monitoringRequest: AgentRequest = {
          input: '',
          capability: 'progress-tracking',
          parameters: {},
          context: state.metadata?.context,
        };
        
        // Execute monitoring through the supervisor agent
        const monitoringResponse = await this.agent.execute(monitoringRequest);
        
        // Extract progress information
        const progress = monitoringResponse.output && typeof monitoringResponse.output === 'object'
          ? (monitoringResponse.output as unknown) as { tasks?: Array<{id?: string; status?: string; result?: any; metadata?: {error?: string}}> }
          : { tasks: [] };
        
        // Update task status based on monitoring results
        const updatedTaskStatus = state.taskStatus ? { ...state.taskStatus } : {};
        const updatedTaskResults = state.taskResults ? { ...state.taskResults } : {};
        const updatedTaskErrors = state.taskErrors ? { ...state.taskErrors } : {};
        
        // Process task updates
        if (progress.tasks && Array.isArray(progress.tasks)) {
          for (const task of progress.tasks) {
            if (task.id) {
              if (task.status) {
                updatedTaskStatus[task.id] = task.status;
              }
              
              // Capture results for completed tasks
              if (task.status === 'completed' && task.result) {
                updatedTaskResults[task.id] = task.result;
              }
              
              // Capture errors for failed tasks
              if (task.status === 'failed' && task.metadata?.error) {
                updatedTaskErrors[task.id] = task.metadata.error;
              }
            }
          }
        }
        
        // Check if all tasks are complete
        const allComplete = Object.values(updatedTaskStatus).every(
          status => status === 'completed' || status === 'failed'
        );
        
        // Update state with monitoring results
        return {
          ...state,
          taskStatus: updatedTaskStatus,
          taskResults: updatedTaskResults,
          taskErrors: updatedTaskErrors,
          currentPhase: allComplete ? 'completion' : 'monitoring',
          status: WorkflowStatus.EXECUTING,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'monitor_tasks',
        );
      }
    };
  }
  
  /**
   * Create the handle task failure node
   * This node implements recovery strategies for failed tasks
   */
  private createHandleTaskFailureNode() {
    return async (state: AgentExecutionState & {
      taskStatus?: Record<string, string>;
      taskErrors?: Record<string, string>;
      taskAssignments?: Record<string, string>;
      currentPhase?: string;
    }) => {
      try {
        this.logger.info('Handling task failures');
        
        // Get failed tasks
        const failedTaskIds = Object.entries(state.taskStatus || {})
          .filter(([, status]) => status === 'failed')
          .map(([taskId]) => taskId);
        
        if (failedTaskIds.length === 0) {
          // No failed tasks, just return the current state
          return state;
        }
        
        // Increment retry count
        const retryCount = (state.metadata?.retryCount || 0) + 1;
        const maxRetries = state.metadata?.maxRetries || 3;
        
        // Check if we've exceeded retry limit
        if (retryCount > maxRetries) {
          this.logger.warn(`Exceeded max retries (${maxRetries}) for failed tasks`);
          
          // Mark the workflow with partial completion
          return {
            ...state,
            currentPhase: 'completion',
            metadata: {
              ...state.metadata,
              retryCount,
              recoveryFailed: true,
            },
            status: WorkflowStatus.EXECUTING,
          };
        }
        
        // Prepare recovery request
        const recoveryRequest: AgentRequest = {
          input: '',
          capability: 'task-assignment',
          parameters: {
            reassignTasks: failedTaskIds,
            previousErrors: state.taskErrors,
            isRetry: true,
            retryCount,
          },
          context: state.metadata?.context,
        };
        
        // Execute recovery through the supervisor agent
        const recoveryResponse = await this.agent.execute(recoveryRequest);
        
        // Extract the new task assignments
        const recoveryAssignments = recoveryResponse.output && typeof recoveryResponse.output === 'object'
          ? (recoveryResponse.output as unknown) as Record<string, string>
          : {};
        
        // Update state with recovery results
        const updatedTaskAssignments = state.taskAssignments ? { ...state.taskAssignments } : {};
        const updatedTaskStatus = state.taskStatus ? { ...state.taskStatus } : {};
        
        // Reset failed tasks to pending with new assignments
        for (const taskId of failedTaskIds) {
          if (recoveryAssignments[taskId]) {
            updatedTaskAssignments[taskId] = recoveryAssignments[taskId];
            updatedTaskStatus[taskId] = 'pending';
          }
        }
        
        return {
          ...state,
          taskAssignments: updatedTaskAssignments,
          taskStatus: updatedTaskStatus,
          metadata: {
            ...state.metadata,
            retryCount,
          },
          currentPhase: 'execution', // Go back to execution phase
          status: WorkflowStatus.EXECUTING,
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'handle_task_failure',
        );
      }
    };
  }
  
  /**
   * Create a post execute node specific to supervisor workflow
   */
  private createSupervisorPostExecuteNode() {
    return async (state: AgentExecutionState & {
      tasks?: Record<string, Task>;
      taskStatus?: Record<string, string>;
      taskResults?: Record<string, any>;
      taskErrors?: Record<string, string>;
    }) => {
      try {
        this.logger.info('Finalizing supervisor workflow execution');
        
        // Calculate completion statistics
        const totalTasks = Object.keys(state.tasks || {}).length;
        const completedTasks = Object.values(state.taskStatus || {}).filter(
          status => status === 'completed'
        ).length;
        const failedTasks = Object.values(state.taskStatus || {}).filter(
          status => status === 'failed'
        ).length;
        
        // Determine overall status
        let overallStatus: 'success' | 'partial' | 'failed' = 'success';
        if (failedTasks === totalTasks) {
          overallStatus = 'failed';
        } else if (failedTasks > 0) {
          overallStatus = 'partial';
        }
        
        // Collect all results
        const results = Object.entries(state.taskResults || {}).reduce((allResults, [taskId, result]) => {
          const task = state.tasks?.[taskId];
          if (task) {
            allResults[task.name || taskId] = result;
          }
          return allResults;
        }, {} as Record<string, any>);
        
        // Prepare output summary
        const output = JSON.stringify({
          status: overallStatus,
          summary: `Completed ${completedTasks} of ${totalTasks} tasks`,
          results,
          stats: {
            totalTasks,
            completedTasks,
            failedTasks,
            successRate: totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0,
          }
        });
        
        // Track execution time
        const executionTime = state.startTime ? Date.now() - state.startTime : 0;
        
        return {
          ...state,
          output,
          artifacts: {
            taskResults: state.taskResults,
            taskErrors: state.taskErrors,
            overallStatus,
          },
          status: WorkflowStatus.COMPLETED,
          endTime: Date.now(),
          metrics: {
            ...state.metrics,
            executionTimeMs: executionTime,
            taskCompletion: {
              total: totalTasks,
              completed: completedTasks,
              failed: failedTasks,
              rate: totalTasks > 0 ? (completedTasks / totalTasks) : 0,
            },
          },
        };
      } catch (error) {
        return this.addErrorToState(
          state,
          error instanceof Error ? error : String(error),
          'post_execute',
        );
      }
    };
  }
  
  /**
   * Execute the workflow with the given input
   */
  async execute(request: AgentRequest): Promise<AgentResponse> {
    try {
      // Configure execution options
      const options = {
        metadata: {
          maxRetries: 3,
          retryCount: 0,
          ...request.context?.metadata,
        },
      };
      
      // Create the initial state
      const initialState = this.createInitialState(request);
      
      // Create the graph
      const graph = this.createStateGraph(this.createStateSchema());
      
      // Execute the graph - compile() is needed before invoke() 
      const compiledGraph = graph.compile();
      const result = await compiledGraph.invoke(initialState, options);
      
      // Parse output for better formatting
      let output: any;
      try {
        output = result.output ? JSON.parse(result.output) : '';
      } catch {
        output = result.output || '';
      }
      
      return {
        output,
        artifacts: result.artifacts,
        metrics: result.metrics,
      };
    } catch (error) {
      this.logger.error('SupervisorWorkflow execution failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      
      throw error;
    }
  }
} 