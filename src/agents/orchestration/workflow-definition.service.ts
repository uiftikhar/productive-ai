import { v4 as uuidv4 } from 'uuid';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';

/**
 * Workflow step definition
 */
export interface WorkflowStepDefinition {
  id: string;
  name: string;
  description?: string;
  agentId?: string;
  capability?: string;
  input?: string | ((state: Record<string, any>) => string);
  condition?: (state: Record<string, any>) => boolean;
  parameters?: Record<string, any> | ((state: Record<string, any>) => Record<string, any>);
  onSuccess?: string[];
  onFailure?: string[];
  maxRetries?: number;
  timeout?: number;
}

/**
 * Workflow branch definition for conditional logic
 */
export interface WorkflowBranchDefinition {
  id: string;
  name: string;
  description?: string;
  condition: (state: Record<string, any>) => boolean;
  thenStepId: string;
  elseStepId: string;
}

/**
 * Workflow definition including metadata and execution settings
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description?: string;
  version: string;
  createdAt: number;
  updatedAt: number;
  steps: WorkflowStepDefinition[];
  branches: WorkflowBranchDefinition[];
  startAt: string; // ID of the first step
  parallelSteps?: Record<string, string[]>; // Map of step ID to array of parallel step IDs
  metadata?: Record<string, any>;
}

/**
 * Service responsible for creating, storing, and retrieving workflow definitions
 */
export class WorkflowDefinitionService {
  private static instance: WorkflowDefinitionService;
  private logger: Logger;
  private workflows: Map<string, WorkflowDefinition> = new Map();
  private workflowsByName: Map<string, string[]> = new Map(); // name -> [id1, id2, ...] (for versioning)

  private constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(logger?: Logger): WorkflowDefinitionService {
    if (!WorkflowDefinitionService.instance) {
      WorkflowDefinitionService.instance = new WorkflowDefinitionService(logger);
    }
    return WorkflowDefinitionService.instance;
  }

  /**
   * Create a new workflow definition
   */
  public createWorkflow(
    name: string,
    description: string = '',
    steps: WorkflowStepDefinition[] = [],
    branches: WorkflowBranchDefinition[] = [],
    startAt: string = '',
    metadata: Record<string, any> = {}
  ): WorkflowDefinition {
    // Generate a unique ID for the workflow
    const id = uuidv4();
    const now = Date.now();
    
    // Initialize the version
    const existingVersions = this.workflowsByName.get(name) || [];
    const version = `1.${existingVersions.length}`;

    // Validate steps have unique IDs
    const stepIds = new Set<string>();
    for (const step of steps) {
      if (stepIds.has(step.id)) {
        throw new Error(`Duplicate step ID: ${step.id}`);
      }
      stepIds.add(step.id);
    }

    // Default to first step if startAt not specified
    if (!startAt && steps.length > 0) {
      startAt = steps[0].id;
    }

    // Create the workflow definition
    const workflow: WorkflowDefinition = {
      id,
      name,
      description,
      version,
      createdAt: now,
      updatedAt: now,
      steps,
      branches,
      startAt,
      metadata
    };

    // Store the workflow
    this.workflows.set(id, workflow);
    
    // Update the workflow name index
    if (!this.workflowsByName.has(name)) {
      this.workflowsByName.set(name, []);
    }
    this.workflowsByName.get(name)?.push(id);

    this.logger.info(`Created workflow: ${name} (${id})`);
    return workflow;
  }

  /**
   * Get a workflow by ID
   */
  public getWorkflow(id: string): WorkflowDefinition | undefined {
    return this.workflows.get(id);
  }

  /**
   * Get the latest version of a workflow by name
   */
  public getLatestWorkflow(name: string): WorkflowDefinition | undefined {
    const ids = this.workflowsByName.get(name);
    if (!ids || ids.length === 0) {
      return undefined;
    }
    
    // Get the latest version (last in the array)
    const latestId = ids[ids.length - 1];
    return this.workflows.get(latestId);
  }

  /**
   * Get all versions of a workflow by name
   */
  public getWorkflowVersions(name: string): WorkflowDefinition[] {
    const ids = this.workflowsByName.get(name) || [];
    return ids.map(id => this.workflows.get(id)).filter(Boolean) as WorkflowDefinition[];
  }

  /**
   * Update an existing workflow definition
   */
  public updateWorkflow(
    id: string,
    updates: Partial<Omit<WorkflowDefinition, 'id' | 'createdAt' | 'version'>>
  ): WorkflowDefinition {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${id}`);
    }

    // Update the workflow
    const updatedWorkflow: WorkflowDefinition = {
      ...workflow,
      ...updates,
      updatedAt: Date.now()
    };

    // Store the updated workflow
    this.workflows.set(id, updatedWorkflow);
    this.logger.info(`Updated workflow: ${updatedWorkflow.name} (${id})`);
    
    return updatedWorkflow;
  }

  /**
   * Clone a workflow to create a new version
   */
  public cloneWorkflow(id: string, newName?: string): WorkflowDefinition {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${id}`);
    }

    const name = newName || workflow.name;
    
    // Create a new workflow based on the existing one
    return this.createWorkflow(
      name,
      workflow.description,
      workflow.steps,
      workflow.branches,
      workflow.startAt,
      { ...workflow.metadata, clonedFrom: id }
    );
  }

  /**
   * Delete a workflow
   */
  public deleteWorkflow(id: string): boolean {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      return false;
    }

    // Remove from workflows map
    this.workflows.delete(id);
    
    // Update the workflows by name index
    const ids = this.workflowsByName.get(workflow.name) || [];
    const updatedIds = ids.filter(wfId => wfId !== id);
    
    if (updatedIds.length === 0) {
      this.workflowsByName.delete(workflow.name);
    } else {
      this.workflowsByName.set(workflow.name, updatedIds);
    }

    this.logger.info(`Deleted workflow: ${workflow.name} (${id})`);
    return true;
  }

  /**
   * List all workflows
   */
  public listWorkflows(): WorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Create a simple linear workflow
   */
  public createLinearWorkflow(
    name: string,
    description: string,
    steps: Omit<WorkflowStepDefinition, 'id' | 'onSuccess' | 'onFailure'>[]
  ): WorkflowDefinition {
    // Create steps with IDs and sequential connections
    const workflowSteps: WorkflowStepDefinition[] = steps.map((step, index) => {
      const id = `step-${index + 1}`;
      const nextIndex = index < steps.length - 1 ? index + 1 : -1;
      const onSuccess = nextIndex >= 0 ? [`step-${nextIndex + 1}`] : [];
      
      return {
        id,
        ...step,
        onSuccess
      };
    });

    return this.createWorkflow(
      name,
      description,
      workflowSteps,
      [], // No branches for linear workflow
      'step-1' // Start at first step
    );
  }

  /**
   * Load a predefined workflow from a JSON definition
   */
  public loadWorkflowFromDefinition(definition: Partial<WorkflowDefinition>): WorkflowDefinition {
    if (!definition.name) {
      throw new Error('Workflow definition must include a name');
    }
    
    if (!definition.steps || definition.steps.length === 0) {
      throw new Error('Workflow definition must include at least one step');
    }

    return this.createWorkflow(
      definition.name,
      definition.description || '',
      definition.steps,
      definition.branches || [],
      definition.startAt || definition.steps[0].id,
      definition.metadata || {}
    );
  }

  /**
   * Initialize default workflows
   */
  public initializeDefaultWorkflows(): void {
    // Create a simple RAG workflow
    this.createLinearWorkflow(
      'rag-query',
      'Retrieve and generate answers using RAG',
      [
        {
          name: 'retrieve-knowledge',
          description: 'Retrieve relevant knowledge based on query',
          capability: 'retrieve_knowledge',
          parameters: (state) => ({
            query: state.input,
            strategy: 'hybrid',
            maxItems: 5
          })
        },
        {
          name: 'generate-answer',
          description: 'Generate answer based on retrieved knowledge',
          capability: 'answer_with_context',
          parameters: (state) => ({
            query: state.input,
            retrievedContext: state.steps[0].output
          })
        }
      ]
    );
    
    // Add more default workflows as needed
  }
} 