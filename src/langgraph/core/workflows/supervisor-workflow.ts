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
import { v4 as uuidv4 } from 'uuid';

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
  taskList?: Task[];
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
      taskList: Annotation<Task[] | undefined>(),
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
      taskList?: Task[];
    }) => {
      try {
        this.logger.info('Planning tasks for supervisor workflow');
        
        // Add debug logging for state parameters
        this.logger.info('State parameters:', {
          hasParameters: !!state.parameters,
          hasTasksParam: !!state.parameters?.tasks,
          taskParamType: state.parameters?.tasks ? typeof state.parameters.tasks : 'undefined',
          isTaskParamArray: state.parameters?.tasks ? Array.isArray(state.parameters.tasks) : false,
        });

        // Check if we already have tasks directly in the parameters
        if (state.parameters?.tasks) {
          let taskMap: Record<string, Task> = {};
          let taskList: Task[] = [];

          if (Array.isArray(state.parameters.tasks)) {
            // Case: Tasks provided as an array
            const directTasks = state.parameters.tasks;

            this.logger.info(`Using ${directTasks.length} tasks provided directly in parameters (array format)`);

            // Process each task in the array
            directTasks.forEach(task => {
              if (!task.id) {
                task.id = uuidv4();
              }

              taskMap[task.id] = task;
            });

            taskList = directTasks;
          }
          else if (typeof state.parameters.tasks === 'object') {
            // Case: Tasks provided as a map
            taskMap = state.parameters.tasks as Record<string, Task>;

            this.logger.info(`Using ${Object.keys(taskMap).length} tasks provided directly in parameters (map format)`);

            // Convert map to list if needed
            taskList = Object.values(taskMap);
          }

          // Check if we also have a separate task list
          if (state.parameters.taskList && Array.isArray(state.parameters.taskList)) {
            this.logger.info(`Using provided taskList with ${state.parameters.taskList.length} tasks`);
            taskList = state.parameters.taskList;

            // Make sure any tasks in the list are also in the map
            taskList.forEach(task => {
              if (task.id && !taskMap[task.id]) {
                taskMap[task.id] = task;
              }
            });
          }

          // Add debug logging for task processing results
          this.logger.info('Task data after processing:', {
            taskMapSize: Object.keys(taskMap).length,
            taskListLength: taskList.length,
            taskMapKeys: Object.keys(taskMap),
            taskListIds: taskList.map(t => t.id),
          });

          // Update state with the direct tasks
          const newState = {
            ...state,
            tasks: taskMap,
            taskList: taskList,
            currentPhase: 'delegation',
            executionStrategy: state.parameters.executionStrategy || 'sequential',
            status: WorkflowStatus.EXECUTING,
          };
          
          // Add debug logging for the new state
          this.logger.info('New state after planning:', {
            tasksCount: Object.keys(newState.tasks || {}).length,
            taskListLength: newState.taskList?.length || 0,
            currentPhase: newState.currentPhase,
          });
          
          return newState;
        }

        // If no direct tasks, try task planning
        this.logger.info('No direct tasks found, attempting task planning');

        // Format the input as a string if it's not already
        let inputString = '';
        if (typeof state.input === 'string') {
          inputString = state.input;
        } else if (Array.isArray(state.input)) {
          // If input is an array of BaseMessages, convert to string
          //  TODO fix this typing frp, any
          inputString = (state.input as any[]).map(m => {
            if (typeof m === 'string') return m;
            // For BaseMessage objects, try to get content
            if (typeof m === 'object' && m !== null) {
              return 'content' in m && typeof m.content === 'string'
                ? m.content
                : JSON.stringify(m);
            }
            return String(m);
          }).join('\n');
        } else if (state.input !== undefined && state.input !== null) {
          inputString = JSON.stringify(state.input);
        }

        // Prepare task planning request
        const planningRequest: AgentRequest = {
          input: inputString,
          capability: 'task-planning',
          parameters: {
            name: state.parameters?.name || 'Task Plan',
            description: state.parameters?.description || inputString,
          },
          context: state.metadata?.context,
        };

        // Execute planning through the supervisor agent
        const planningResponse = await this.agent.execute(planningRequest);

        // Log the planning response for debugging
        this.logger.debug('Planning response:', {
          responseType: typeof planningResponse.output,
          hasOutput: !!planningResponse.output,
          planId: planningResponse.artifacts?.planId
        });

        let tasks: Record<string, Task> = {};
        let taskList: Task[] = [];

        // Try to extract tasks from the planning response
        if (planningResponse.output) {
          if (typeof planningResponse.output === 'object') {
            // Case 1: Output is already a map of tasks
            tasks = (planningResponse.output as unknown) as Record<string, Task>;
            taskList = Object.values(tasks);
            this.logger.info(`Extracted ${taskList.length} tasks from plan response (object)`);
          } else if (Array.isArray(planningResponse.output)) {
            // Case 2: Output is an array of tasks
            taskList = (planningResponse.output as unknown) as Task[];
            taskList.forEach((task) => {
              if (task.id) {
                tasks[task.id] = task;
              }
            });
            this.logger.info(`Extracted ${taskList.length} tasks from plan response (array)`);
          } else if (typeof planningResponse.output === 'string') {
            // Case 3: Output is a string, try to parse as JSON
            try {
              const parsed = JSON.parse(planningResponse.output);
              if (Array.isArray(parsed)) {
                taskList = parsed as Task[];
                taskList.forEach((task) => {
                  if (task.id) {
                    tasks[task.id] = task;
                  }
                });
                this.logger.info(`Extracted ${taskList.length} tasks from plan response (parsed array)`);
              } else if (typeof parsed === 'object') {
                // Check if it's a map of tasks or a single task
                if (parsed.id && parsed.name && parsed.description) {
                  taskList = [parsed as Task];
                  tasks[parsed.id] = parsed as Task;
                  this.logger.info(`Extracted 1 task from plan response (parsed object)`);
                } else {
                  tasks = parsed as Record<string, Task>;
                  taskList = Object.values(tasks);
                  this.logger.info(`Extracted ${taskList.length} tasks from plan response (parsed map)`);
                }
              }
            } catch (e) {
              this.logger.warn('Failed to parse string output as tasks', {
                error: e instanceof Error ? e.message : String(e),
              });
            }
          }
        }

        if (taskList.length === 0) {
          this.logger.warn('No tasks were created or found');

          // Create a placeholder task using the user's input
          const taskId = uuidv4();
          const defaultTask: Task = {
            id: taskId,
            name: 'Process User Request',
            description: typeof state.input === 'string' ? state.input : JSON.stringify(state.input),
            status: 'pending',
            priority: 5,
            createdAt: Date.now(),
          };

          // Create a tasks map
          const tasks = { [taskId]: defaultTask };

          return {
            ...state,
            tasks,
            taskList: [defaultTask],
            currentPhase: 'delegation',
            status: WorkflowStatus.EXECUTING,
          };
        } else {
          this.logger.info(`Planning complete with ${taskList.length} tasks`);
          taskList.forEach(task => {
            this.logger.debug(`- Task: ${task.name}`);
          });
        }

        // Update state with planning results
        return {
          ...state,
          currentPhase: 'delegation',
          tasks,
          taskList,
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
   * This node handles assigning tasks to agents
   */
  private createDelegateTasksNode() {
    return async (state: AgentExecutionState & {
      tasks?: Record<string, Task>;
      taskList?: Task[];
      agentAssignments?: Record<string, string>;
      assignedTasks?: Record<string, Task>;
      unassignedTasks?: Record<string, Task>;
    }) => {
      try {
        this.logger.info('Delegating tasks to agents');
        
        // Add debug logging for input state
        this.logger.info('Delegation input state:', {
          hasState: !!state,
          hasTasks: !!state.tasks,
          hasTaskList: !!state.taskList,
          stateKeys: Object.keys(state),
          currentPhase: (state as any).currentPhase || 'unknown',
        });

        // Prepare for task delegation
        const tasks = state.tasks || {};
        const taskList = state.taskList || Object.values(tasks);
        
        // Add more detailed logging
        this.logger.info('Tasks state:', {
          tasksCount: Object.keys(tasks).length,
          taskListLength: taskList.length,
          taskKeys: Object.keys(tasks),
          taskListIds: taskList.map(t => t.id),
        });

        // Skip delegation if no tasks
        if (taskList.length === 0) {
          this.logger.warn('No tasks available for assignment');
          return {
            ...state,
            currentPhase: 'execution', // Skip to execution phase
          };
        }

        // Initialize agent assignments if not exist
        const agentAssignments: Record<string, string> = state.agentAssignments || {};
        const assignedTasks: Record<string, Task> = state.assignedTasks || {};
        const unassignedTasks: Record<string, Task> = {};

        // Log the tasks we're working with
        this.logger.info(`Delegating ${taskList.length} tasks to agents`);

        // Process each task for assignment
        for (const task of taskList) {
          // Skip already assigned tasks
          if (agentAssignments[task.id] && assignedTasks[task.id]) {
            this.logger.info(`Task ${task.id} (${task.name}) already assigned to ${agentAssignments[task.id]}`);
            continue;
          }

          try {
            // Create task assignment request
            this.logger.info(`Assigning task: ${task.name} (${task.id})`);

            // Extract required capabilities from task metadata
            const requiredCapabilities = task.metadata?.requiredCapabilities || [];

            // Ensure we have a proper string input
            const taskDescription = typeof task.description === 'string' ? task.description :
              (typeof task.name === 'string' ? task.name : JSON.stringify(task));

            const assignmentRequest: AgentRequest = {
              input: taskDescription,
              capability: 'task-assignment',
              parameters: {
                taskId: task.id,
                taskName: task.name,
                taskDescription: task.description,
                priority: task.priority,
                requiredCapabilities: requiredCapabilities,
              },
            };

            // Execute the supervisor to get assignment
            const response = await this.agent.execute(assignmentRequest);

            // Process response to extract assignment
            let agentId: string | undefined;

            // Try to extract the assignment from response
            if (response.output) {
              if (typeof response.output === 'string') {
                // Try to parse as JSON first
                try {
                  const parsedOutput = JSON.parse(response.output);
                  agentId = parsedOutput.assignedTo || parsedOutput.agentId;
                } catch (e) {
                  // If not parseable, look for agent ID in the string
                  const match = response.output.match(/assignedTo["\s:]+([^"\s,}]+)/);
                  if (match && match[1]) {
                    agentId = match[1];
                  }
                }
              } else if (typeof response.output === 'object') {
                // Try to extract from object
                const output = response.output as Record<string, any>;
                agentId = output.assignedTo || output.agentId;
              }
            }

            // If we have artifacts with assignedTo, use that
            if (response.artifacts && response.artifacts.assignedTo) {
              agentId = response.artifacts.assignedTo;
            }

            if (agentId) {
              this.logger.info(`Task ${task.id} (${task.name}) assigned to agent ${agentId}`);

              // Update task status
              const updatedTask: Task = {
                ...task,
                status: 'assigned' as 'pending',
                assignedTo: agentId,
              };

              // Store the assignment
              agentAssignments[task.id] = agentId;
              assignedTasks[task.id] = updatedTask;

              // Update task in the tasks map
              tasks[task.id] = updatedTask;
            } else {
              this.logger.warn(`Failed to assign task ${task.id} (${task.name}): No agent ID found in response`);
              unassignedTasks[task.id] = task;
            }
          } catch (error) {
            this.logger.error(`Error assigning task ${task.id} (${task.name}):`, { error });
            unassignedTasks[task.id] = task;
          }
        }

        // Log assignment results
        const assignedCount = Object.keys(assignedTasks).length;
        const unassignedCount = Object.keys(unassignedTasks).length;

        this.logger.info(`Task assignment complete: ${assignedCount} assigned, ${unassignedCount} unassigned`);

        // Proceed to execution phase
        return {
          ...state,
          tasks,
          agentAssignments,
          assignedTasks,
          unassignedTasks,
          currentPhase: assignedCount > 0 ? 'execution' : 'completion', // Skip to completion if no tasks assigned
        };
      } catch (error) {
        this.logger.error('Error in delegateTasksNode:', { error });
        return {
          ...state,
          error: `Failed to delegate tasks: ${error}`,
          status: WorkflowStatus.ERROR,
        };
      }
    };
  }

  /**
   * Create the execute tasks node
   * This node kicks off task execution using the appropriate strategy
   */
  private createExecuteTasksNode() {
    return async (state: AgentExecutionState & SupervisorExecutionState) => {
      try {
        this.logger.info(`Executing tasks using ${state.executionStrategy || 'sequential'} strategy`);

        // Log execution state
        this.logger.debug('Execution state:', {
          hasTaskAssignments: !!state.taskAssignments && Object.keys(state.taskAssignments || {}).length > 0,
          tasksCount: Object.keys(state.tasks || {}).length,
          executionStrategy: state.executionStrategy || 'sequential',
        });

        // Check if we have tasks to execute
        if (!state.tasks || Object.keys(state.tasks).length === 0) {
          this.logger.warn('No tasks to execute');
          return {
            ...state,
            currentPhase: 'completion',
            status: WorkflowStatus.COMPLETED,
          };
        }

        // Prepare task data structure for execution
        const taskData = Object.values(state.tasks).map(task => {
          return {
            id: task.id,
            taskDescription: task.description,
            priority: task.priority,
            assignedAgentId: state.taskAssignments?.[task.id] || task.assignedTo,
          };
        });

        // Prepare work coordination request
        const executionRequest: AgentRequest = {
          input: "", // Empty string is valid for the input field
          capability: 'work-coordination',
          parameters: {
            tasks: taskData,
            executionStrategy: state.executionStrategy || 'sequential',
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
          input: "", // Empty string is valid for the input field
          capability: 'progress-tracking',
          parameters: {},
          context: state.metadata?.context,
        };

        // Execute monitoring through the supervisor agent
        const monitoringResponse = await this.agent.execute(monitoringRequest);

        // Extract progress information
        let progressTasks: Array<{ id?: string; status?: string; result?: any; metadata?: { error?: string } }> = [];

        if (monitoringResponse.output) {
          if (typeof monitoringResponse.output === 'object') {
            // Try to extract tasks array from the output
            const outputObj = monitoringResponse.output as Record<string, any>;
            if (outputObj.tasks && Array.isArray(outputObj.tasks)) {
              progressTasks = outputObj.tasks;
            }
          } else if (typeof monitoringResponse.output === 'string') {
            // Try to parse JSON string
            try {
              const parsed = JSON.parse(monitoringResponse.output);
              if (parsed.tasks && Array.isArray(parsed.tasks)) {
                progressTasks = parsed.tasks;
              }
            } catch (e) {
              this.logger.warn('Failed to parse monitoring response', {e});
            }
          }
        }

        // Update task status based on monitoring results
        const updatedTaskStatus = state.taskStatus ? { ...state.taskStatus } : {};
        const updatedTaskResults = state.taskResults ? { ...state.taskResults } : {};
        const updatedTaskErrors = state.taskErrors ? { ...state.taskErrors } : {};

        // Process task updates
        for (const task of progressTasks) {
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
    return async (state: AgentExecutionState & SupervisorExecutionState) => {
      try {
        // Check retry limits
        const retryCount = state.metadata?.retryCount || 0;
        const maxRetries = state.metadata?.maxRetries || 3;

        if (retryCount >= maxRetries) {
          this.logger.warn(`Maximum retries (${maxRetries}) reached, finishing with errors`);

          return {
            ...state,
            currentPhase: 'completion',
            status: WorkflowStatus.ERROR,
          };
        }

        // Identify failed tasks
        const failedTaskIds = Object.entries(state.taskStatus || {})
          .filter(([_, status]) => status === 'failed')
          .map(([id]) => id);

        if (failedTaskIds.length === 0) {
          this.logger.warn('No failed tasks found to handle');

          return {
            ...state,
            currentPhase: 'completion',
            status: WorkflowStatus.COMPLETED,
          };
        }

        this.logger.info(`Handling ${failedTaskIds.length} failed tasks`);

        // Create failed task error information
        const failedTasks = failedTaskIds.map(id => {
          const task = (state.tasks || {})[id];
          const error = (state.taskErrors || {})[id];

          return {
            id,
            name: task?.name || 'Unknown task',
            description: task?.description || '',
            error: error || 'Unknown error',
          };
        });

        // Convert failed tasks to a JSON string for the input
        const failedTasksStr = JSON.stringify(failedTasks);

        // Prepare task recovery request
        const recoveryRequest: AgentRequest = {
          input: failedTasksStr,
          capability: 'error-handling',
          parameters: {
            retryCount,
            maxRetries,
          },
          context: state.metadata?.context,
        };

        // Execute recovery through the supervisor agent
        const recoveryResponse = await this.agent.execute(recoveryRequest);

        // Extract the new task assignments
        let recoveryAssignments: Record<string, string> = {};

        if (recoveryResponse.output) {
          if (typeof recoveryResponse.output === 'object') {
            recoveryAssignments = recoveryResponse.output as unknown as Record<string, string>;
          } else if (typeof recoveryResponse.output === 'string') {
            try {
              recoveryAssignments = JSON.parse(recoveryResponse.output) as Record<string, string>;
            } catch (e) {
              this.logger.warn('Failed to parse recovery response', {e});
            }
          }
        }

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
            retryCount: retryCount + 1,
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