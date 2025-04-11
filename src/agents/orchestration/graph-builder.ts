// src/agents/orchestration/graph-builder.ts

import { StateGraph, END, START } from '@langchain/langgraph';
import { WorkflowDefinition, WorkflowStepDefinition, WorkflowBranchDefinition } from './workflow-definition.service.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';
import { AgentRegistryService } from '../services/agent-registry.service.ts';

/**
 * Default state type for workflow graphs
 */
export interface WorkflowState {
  input: string;
  userId?: string;
  conversationId?: string;
  sessionId?: string;
  taskId?: string;
  workflow?: string;
  workflowInstanceId?: string;
  currentStep?: string;
  steps: Array<{
    id: string;
    stepId: string;
    name: string;
    agentId?: string;
    capability?: string;
    input: string;
    output?: string;
    artifacts?: Record<string, any>;
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
    error?: string;
    startTime?: number;
    endTime?: number;
  }>;
  activeAgents: string[];
  result?: string;
  error?: string;
  metadata: Record<string, any>;
  variables: Record<string, any>;
}

/**
 * Graph node function type for workflow steps
 */
export type GraphNodeFunction = (state: WorkflowState) => Partial<WorkflowState>;

/**
 * Options for creating state channel definitions
 */
export interface StateChannelOptions {
  additionalChannels?: Record<string, {
    value: (current: any, update?: any) => any;
    default: () => any;
  }>;
}

/**
 * Utility for building LangGraph StateGraphs from workflow definitions
 */
export class GraphBuilder {
  private logger: Logger;
  private registry: AgentRegistryService;
  
  constructor(options: {
    logger?: Logger;
    registry?: AgentRegistryService;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.registry = options.registry || AgentRegistryService.getInstance();
  }
  
  /**
   * Create a LangGraph StateGraph from a workflow definition
   */
  public createGraphFromWorkflow(
    workflow: WorkflowDefinition,
    options: StateChannelOptions = {}
  ): any {
    this.logger.info(`Building graph for workflow: ${workflow.name}`);
    
    // Create state channels for the graph
    const channels = this.createStateChannels(options);
    
    // Create the base graph with properly typed channels
    const graph = new StateGraph<WorkflowState>({
      channels: channels as any,
    });
    
    // Add nodes for each step in the workflow
    for (const step of workflow.steps) {
      const stepNode = this.createCompatibleNodeFunction(this.createNodeForStep(step));
      graph.addNode(step.id, stepNode);
    }
    
    // Add nodes for each branch in the workflow
    for (const branch of workflow.branches) {
      const branchNode = this.createCompatibleNodeFunction(this.createNodeForBranch(branch));
      graph.addNode(branch.id, branchNode);
    }
    
    // Add edges based on the workflow definition
    this.addEdgesToGraph(graph, workflow);
    
    // Compile the graph
    const compiledGraph = graph.compile();
    
    this.logger.info(`Graph build completed for workflow: ${workflow.name}`);
    return compiledGraph;
  }
  
  /**
   * Create standard state channels for workflow graphs
   */
  private createStateChannels(options: StateChannelOptions): Record<string, any> {
    const standardChannels = {
      input: {
        value: (current: string, update?: string) => update ?? current,
        default: () => '',
      },
      userId: {
        value: (current: string | undefined, update?: string) => update ?? current,
        default: () => undefined,
      },
      conversationId: {
        value: (current: string | undefined, update?: string) => update ?? current,
        default: () => undefined,
      },
      sessionId: {
        value: (current: string | undefined, update?: string) => update ?? current,
        default: () => undefined,
      },
      taskId: {
        value: (current: string | undefined, update?: string) => update ?? current,
        default: () => undefined,
      },
      workflow: {
        value: (current: string | undefined, update?: string) => update ?? current,
        default: () => undefined,
      },
      workflowInstanceId: {
        value: (current: string | undefined, update?: string) => update ?? current,
        default: () => undefined,
      },
      currentStep: {
        value: (current: string | undefined, update?: string) => update ?? current,
        default: () => undefined,
      },
      steps: {
        value: (current: Array<any>, update?: Array<any>) => {
          if (update) {
            return [...current, ...update];
          }
          return current;
        },
        default: () => [],
      },
      activeAgents: {
        value: (current: string[], update?: string[]) => {
          if (update) {
            return [...current, ...update];
          }
          return current;
        },
        default: () => [],
      },
      result: {
        value: (current: string | undefined, update?: string) => update ?? current,
        default: () => undefined,
      },
      error: {
        value: (current: string | undefined, update?: string) => update ?? current,
        default: () => undefined,
      },
      metadata: {
        value: (current: Record<string, any>, update?: Record<string, any>) => {
          if (update) {
            return { ...current, ...update };
          }
          return current;
        },
        default: () => ({}),
      },
      variables: {
        value: (current: Record<string, any>, update?: Record<string, any>) => {
          if (update) {
            return { ...current, ...update };
          }
          return current;
        },
        default: () => ({}),
      },
    };
    
    // Merge with any additional channels
    return {
      ...standardChannels,
      ...(options.additionalChannels || {})
    };
  }

  /**
   * Wrap a node function to make it compatible with LangGraph's expected type
   */
  private createCompatibleNodeFunction(fn: GraphNodeFunction): any {
    return {
      invoke: async (state: WorkflowState) => {
        return fn(state);
      }
    };
  }
  
  /**
   * Create a node function for a workflow step
   */
  private createNodeForStep(step: WorkflowStepDefinition): GraphNodeFunction {
    return (state: WorkflowState) => {
      // Check if condition is satisfied
      if (step.condition && !this.evaluateCondition(step.condition, state)) {
        // Skip this step if condition is not met
        return {};
      }
      
      // Get input for the step
      let input = state.input;
      if (typeof step.input === 'function') {
        input = step.input(state);
      } else if (typeof step.input === 'string') {
        input = step.input;
      }
      
      // Get parameters for the step
      let parameters = {};
      if (typeof step.parameters === 'function') {
        parameters = step.parameters(state);
      } else if (step.parameters) {
        parameters = step.parameters;
      }
      
      // In a real implementation, this would dispatch to the agent
      // and wait for its response, but for now we'll simulate it
      this.logger.info(`Executing step: ${step.name}`);
      
      // Record this execution as a step
      const newStep = {
        id: `execution-${Date.now()}`,
        stepId: step.id,
        name: step.name,
        agentId: step.agentId,
        capability: step.capability,
        input,
        output: `Processed: ${input}`,
        status: 'completed' as const,
        startTime: Date.now(),
        endTime: Date.now() + 100, // Simulate 100ms execution time
      };
      
      // Update current step
      return {
        currentStep: step.id,
        steps: [newStep],
        // In a real implementation, this would be the result from the agent
        result: newStep.output,
      };
    };
  }
  
  /**
   * Create a node function for a workflow branch
   */
  private createNodeForBranch(branch: WorkflowBranchDefinition): GraphNodeFunction {
    return (state: WorkflowState) => {
      // Evaluate the condition
      const conditionResult = this.evaluateCondition(branch.condition, state);
      
      // Record this as a step for visibility
      const newStep = {
        id: `branch-${Date.now()}`,
        stepId: branch.id,
        name: branch.name,
        input: JSON.stringify({ condition: conditionResult }),
        status: 'completed' as const,
        startTime: Date.now(),
        endTime: Date.now(),
      };
      
      // Update next step based on condition result
      return {
        currentStep: branch.id,
        steps: [newStep],
        // Store the branch result in variables for edges to use
        variables: {
          ...state.variables,
          [branch.id]: conditionResult
        }
      };
    };
  }
  
  /**
   * Add edges to the graph based on workflow definition
   */
  private addEdgesToGraph(graph: any, workflow: WorkflowDefinition): void {
    // Add starting edge
    graph.addEdge(START, workflow.startAt);
    
    // Add edges between steps
    for (const step of workflow.steps) {
      // Process onSuccess edges
      if (step.onSuccess && step.onSuccess.length > 0) {
        for (const nextStepId of step.onSuccess) {
          graph.addEdge(step.id, nextStepId);
        }
      } else if (!step.onSuccess && !step.onFailure) {
        // If no success or failure edges, add edge to END
        graph.addEdge(step.id, END);
      }
      
      // Process onFailure edges
      if (step.onFailure && step.onFailure.length > 0) {
        // In a real implementation, we'd need conditional routing for failures
        for (const nextStepId of step.onFailure) {
          // Add conditional edge that only routes on failure
          graph.addConditionalEdge(
            step.id,
            nextStepId,
            (state: WorkflowState) => {
              const stepExecution = state.steps.find(s => s.stepId === step.id);
              return stepExecution?.status === 'failed';
            }
          );
        }
      }
    }
    
    // Add conditional edges for branches
    for (const branch of workflow.branches) {
      // Add edge for 'then' branch
      graph.addConditionalEdge(
        branch.id,
        branch.thenStepId,
        (state: WorkflowState) => {
          return state.variables[branch.id] === true;
        }
      );
      
      // Add edge for 'else' branch
      graph.addConditionalEdge(
        branch.id,
        branch.elseStepId,
        (state: WorkflowState) => {
          return state.variables[branch.id] === false;
        }
      );
    }
    
    // Add parallel execution paths if defined
    if (workflow.parallelSteps) {
      for (const [stepId, parallelSteps] of Object.entries(workflow.parallelSteps)) {
        // For each parallel step, add an edge from the parent step
        for (const parallelStepId of parallelSteps) {
          graph.addEdge(stepId, parallelStepId);
        }
      }
    }
  }
  
  /**
   * Evaluate a condition function with the current state
   */
  private evaluateCondition(
    condition: (state: Record<string, any>) => boolean,
    state: WorkflowState
  ): boolean {
    try {
      return condition(state);
    } catch (error) {
      this.logger.error(`Error evaluating condition:`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
} 