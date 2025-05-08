/**
 * Analysis Manager Agent for the Hierarchical Agentic Meeting Analysis System
 * 
 * This implementation provides a manager-level agent that sits between the
 * supervisor and worker agents, managing a team of specialized workers
 * focused on a specific expertise area.
 */
import { v4 as uuidv4 } from 'uuid';
import {
  IManagerAgent,
  AgentExpertise,
  AgentRole,
  AnalysisGoalType,
  AnalysisTaskStatus,
  SubTask,
  AgentOutput,
  ConfidenceLevel,
  MessageType,
  AgentMessage,
  SubTaskComponent,
  TaskComplexity,
  SubtaskRelationship,
} from '../../interfaces/agent.interface';
import { BaseMeetingAnalysisAgent } from '../base-meeting-analysis-agent';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ChatOpenAI } from '@langchain/openai';

/**
 * Configuration options for AnalysisManagerAgent
 */
export interface AnalysisManagerAgentConfig {
  id?: string;
  name?: string;
  logger?: Logger;
  llm?: ChatOpenAI;
  systemPrompt?: string;
  expertiseAreas: AgentExpertise[];
  supervisorId: string;
  maxWorkers?: number;
  taskDecompositionStrategy?: 'simple' | 'balanced' | 'complex';
}

/**
 * Task analysis result
 */
interface TaskAnalysisResult {
  complexity: TaskComplexity;
  components: SubTaskComponent[];
  estimatedSubtaskCount: number;
  requiredExpertise: AgentExpertise[];
  dependencies: SubtaskRelationship[];
  suggestedApproach: string;
}

/**
 * Analysis Manager Agent implementation
 * 
 * This agent is responsible for:
 * - Managing a team of worker agents focused on specific expertise
 * - Breaking down tasks from supervisor into worker-sized chunks
 * - Assigning work to appropriate workers
 * - Monitoring worker progress and performance
 * - Aggregating worker results before sending to supervisor
 * - Escalating issues that can't be resolved at manager level
 */
export class AnalysisManagerAgent
  extends BaseMeetingAnalysisAgent
  implements IManagerAgent {

  public readonly role = AgentRole.MANAGER;
  public managedExpertise: AgentExpertise[];
  public managedAgents: string[] = [];
  
  private supervisorId: string;
  private activeWorkers: Map<string, {
    id: string;
    expertise: AgentExpertise[];
    availability: boolean;
    performance: number;
    taskCount: number;
  }> = new Map();
  
  private assignedTasks: Map<string, {
    task: SubTask;
    assignedWorkers: string[];
    status: AnalysisTaskStatus;
    results: AgentOutput[];
    analysisResult?: TaskAnalysisResult;
    subtaskComponents?: SubTaskComponent[];
  }> = new Map();

  private maxWorkers: number;
  private taskDecompositionStrategy: 'simple' | 'balanced' | 'complex';

  /**
   * Create a new Analysis Manager Agent
   */
  constructor(config: AnalysisManagerAgentConfig) {
    // Set up expertise and capabilities for manager
    const goalTypes = config.expertiseAreas.map(exp => {
      // Map expertise to corresponding goal types
      switch (exp) {
        case AgentExpertise.TOPIC_ANALYSIS:
          return AnalysisGoalType.EXTRACT_TOPICS;
        case AgentExpertise.ACTION_ITEM_EXTRACTION:
          return AnalysisGoalType.EXTRACT_ACTION_ITEMS;
        case AgentExpertise.DECISION_TRACKING:
          return AnalysisGoalType.EXTRACT_DECISIONS;
        case AgentExpertise.SENTIMENT_ANALYSIS:
          return AnalysisGoalType.ANALYZE_SENTIMENT;
        case AgentExpertise.PARTICIPANT_DYNAMICS:
          return AnalysisGoalType.ANALYZE_PARTICIPATION;
        case AgentExpertise.SUMMARY_GENERATION:
          return AnalysisGoalType.GENERATE_SUMMARY;
        case AgentExpertise.CONTEXT_INTEGRATION:
          return AnalysisGoalType.INTEGRATE_CONTEXT;
        default:
          return AnalysisGoalType.FULL_ANALYSIS;
      }
    });
    
    super({
      id: config.id,
      name: config.name || `${config.expertiseAreas[0]} Manager`,
      expertise: [...config.expertiseAreas, AgentExpertise.MANAGEMENT],
      capabilities: goalTypes,
      logger: config.logger,
      llm: config.llm,
      systemPrompt: config.systemPrompt,
    });

    this.managedExpertise = config.expertiseAreas;
    this.supervisorId = config.supervisorId;
    this.maxWorkers = config.maxWorkers || 5;
    this.taskDecompositionStrategy = config.taskDecompositionStrategy || 'balanced';
    
    this.logger.info(
      `Initialized ${this.name} managing expertise: ${this.managedExpertise.join(', ')}`,
    );
    this.logger.info(`Task decomposition strategy: ${this.taskDecompositionStrategy}`);
  }

  /**
   * Initialize the manager agent
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);

    // Register with supervisor
    await this.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.NOTIFICATION,
      sender: this.id,
      recipients: [this.supervisorId],
      content: {
        event: 'manager_registration',
        managerId: this.id,
        expertise: this.managedExpertise,
        capabilities: Array.from(this.capabilities)
      },
      timestamp: Date.now()
    });

    // Set up message handlers
    this.on('request', this.handleRequest.bind(this));
    this.on('response', this.handleResponse.bind(this));
    this.on('delegate', this.handleDelegation.bind(this));

    this.logger.info(`${this.name} initialized and registered with supervisor`);
  }

  /**
   * Handle requests from supervisor or workers
   */
  private async handleRequest(message: AgentMessage): Promise<void> {
    // Process requests based on content
    const { requestType, data } = message.content;
    
    switch (requestType) {
      case 'task_assignment':
        // Supervisor is assigning a task to the manager
        await this.handleTaskAssignment(message);
        break;
        
      case 'status_update':
        // Request for status update
        await this.sendStatusUpdate(message.sender);
        break;
        
      case 'assistance_request':
        // Worker is requesting assistance
        await this.handleAssistanceRequest(message);
        break;
        
      default:
        this.logger.warn(`Unknown request type: ${requestType}`);
        break;
    }
  }

  /**
   * Handle responses from workers
   */
  private async handleResponse(message: AgentMessage): Promise<void> {
    const { requestType, taskId, result } = message.content;
    
    if (requestType === 'task_execution' && taskId && result) {
      this.logger.info(`Received task result from ${message.sender} for task ${taskId}`);
      
      // Update task status and record result
      const taskRecord = this.assignedTasks.get(taskId);
      
      if (taskRecord) {
        // Add result to the collection
        taskRecord.results.push(result);
        
        // Update worker availability
        const worker = this.activeWorkers.get(message.sender);
        if (worker) {
          worker.availability = true;
          worker.taskCount -= 1;
          
          // Update performance score based on result confidence
          const confidenceScore = this.getConfidenceScore(result.confidence);
          worker.performance = 0.8 * worker.performance + 0.2 * confidenceScore;
        }
        
        // Check if all workers have completed
        const allWorkersCompleted = taskRecord.assignedWorkers.every(workerId => {
          return taskRecord.results.some(r => r.metadata?.workerId === workerId);
        });
        
        if (allWorkersCompleted) {
          // All workers have completed, evaluate and send results to supervisor
          await this.finalizeTask(taskId);
        }
      }
    }
  }

  /**
   * Handle delegations from supervisor
   */
  private async handleDelegation(message: AgentMessage): Promise<void> {
    const { action, task } = message.content;
    
    switch (action) {
      case 'new_task':
        // Supervisor is delegating a new task
        const availableWorkers = await this.getAvailableWorkers();
        await this.delegateSubtasks(task, availableWorkers);
        break;
        
      case 'take_over_task':
        // Taking over a task from another manager
        const { task: reassignedTask, previousManager, escalationContext } = message.content;
        await this.handleTakeoverTask(reassignedTask, previousManager, escalationContext);
        break;
        
      default:
        this.logger.warn(`Unknown delegation action: ${action}`);
        break;
    }
  }

  /**
   * Get confidence score from confidence level enum
   */
  private getConfidenceScore(confidence: ConfidenceLevel): number {
    switch (confidence) {
      case ConfidenceLevel.HIGH:
        return 0.9;
      case ConfidenceLevel.MEDIUM:
        return 0.7;
      case ConfidenceLevel.LOW:
        return 0.5;
      case ConfidenceLevel.UNCERTAIN:
        return 0.3;
      default:
        return 0.5;
    }
  }

  /**
   * Handle task assignment from supervisor
   */
  private async handleTaskAssignment(message: AgentMessage): Promise<void> {
    const { task } = message.content;
    
    if (!task) {
      this.logger.warn('Received task assignment without task data');
      return;
    }
    
    this.logger.info(`Received task assignment: ${task.id} of type ${task.type}`);
    
    // First analyze the task to understand its characteristics
    const analysisResult = await this.analyzeTask(task);
    
    // Store task with analysis
    this.assignedTasks.set(task.id, {
      task,
      assignedWorkers: [],
      status: AnalysisTaskStatus.PENDING,
      results: [],
      analysisResult
    });
    
    // Get available workers
    const availableWorkers = await this.getAvailableWorkers();
    
    // Check if we have enough workers for the task
    if (availableWorkers.length < analysisResult.estimatedSubtaskCount) {
      this.logger.warn(
        `Not enough workers available. Need ${analysisResult.estimatedSubtaskCount}, have ${availableWorkers.length}`
      );
      
      // If we have at least one worker, we'll still proceed but may need to adjust decomposition
      if (availableWorkers.length === 0) {
        await this.escalateToSupervisor(task.id, 'No available workers for task execution');
        return;
      }
    }
    
    // Delegate to workers with intelligent task decomposition
    await this.delegateSubtasks(task, availableWorkers);
  }

  /**
   * Analyze a task to determine its characteristics, complexity, and optimal decomposition
   */
  private async analyzeTask(task: SubTask): Promise<TaskAnalysisResult> {
    this.logger.info(`Analyzing task ${task.id} for decomposition planning`);
    
    const prompt = `
      As a manager agent specializing in ${this.managedExpertise.join(', ')}, 
      you need to analyze this task to plan how to decompose it optimally.
      
      Task: ${JSON.stringify(task, null, 2)}
      
      Available expertise areas on your team: ${this.managedExpertise.join(', ')}
      
      Analyze this task and provide:
      1. The overall complexity (simple, moderate, complex)
      2. The distinct components/aspects of this task that can be worked on separately
      3. The estimated number of subtasks needed (be specific with a number)
      4. The required expertise areas for each component
      5. Any dependencies between components (which must be completed before others)
      6. A suggested approach for decomposition
      
      Return your analysis as a JSON object with the following structure:
      {
        "complexity": "simple" | "moderate" | "complex",
        "components": [
          {
            "id": string,
            "name": string,
            "description": string,
            "requiredExpertise": string[],
            "estimatedEffort": number (1-10)
          }
        ],
        "estimatedSubtaskCount": number,
        "requiredExpertise": string[],
        "dependencies": [
          {
            "prerequisite": "componentId",
            "dependent": "componentId"
          }
        ],
        "suggestedApproach": string
      }
    `;
    
    try {
      const response = await this.callLLM('Analyze task for decomposition', prompt);
      const analysis = JSON.parse(response);
      
      return {
        complexity: analysis.complexity as TaskComplexity,
        components: analysis.components,
        estimatedSubtaskCount: analysis.estimatedSubtaskCount,
        requiredExpertise: analysis.requiredExpertise as AgentExpertise[],
        dependencies: analysis.dependencies,
        suggestedApproach: analysis.suggestedApproach
      };
    } catch (error) {
      this.logger.error(`Error analyzing task: ${error}`);
      
      // Return a default analysis
      return {
        complexity: TaskComplexity.MODERATE,
        components: [],
        estimatedSubtaskCount: Math.min(3, this.maxWorkers),
        requiredExpertise: this.managedExpertise,
        dependencies: [],
        suggestedApproach: "Divide the task evenly among available workers"
      };
    }
  }

  /**
   * Delegate subtasks to workers
   */
  async delegateSubtasks(task: SubTask, workerIds: string[]): Promise<void> {
    this.logger.info(`Delegating task ${task.id} to ${workerIds.length} workers`);
    
    if (workerIds.length === 0) {
      this.logger.warn('No available workers for task delegation');
      await this.escalateToSupervisor(task.id, 'No available workers');
      return;
    }
    
    // Get the task analysis if available
    const taskRecord = this.assignedTasks.get(task.id);
    const analysisResult = taskRecord?.analysisResult;
    
    // Break down the task for worker assignments with intelligent decomposition
    const workerTasks = await this.createWorkerSubtasks(
      task, 
      workerIds.length,
      analysisResult
    );
    
    // Update task record with assignment information
    this.assignedTasks.set(task.id, {
      task,
      assignedWorkers: workerIds,
      status: AnalysisTaskStatus.IN_PROGRESS,
      results: [],
      analysisResult,
      subtaskComponents: analysisResult?.components || []
    });
    
    // Match workers to subtasks based on expertise
    const workerAssignments = this.matchWorkersToSubtasks(workerIds, workerTasks);
    
    // Assign subtasks to workers
    for (const [workerId, workerTask] of workerAssignments) {
      // Mark worker as busy
      const worker = this.activeWorkers.get(workerId);
      if (worker) {
        worker.availability = false;
        worker.taskCount += 1;
      }
      
      // Send task to worker
      await this.sendMessage({
        id: `msg-${uuidv4()}`,
        type: MessageType.REQUEST,
        sender: this.id,
        recipients: [workerId],
        content: {
          requestType: 'task_execution',
          taskId: task.id,
          workerTaskId: workerTask.id,
          task: workerTask
        },
        timestamp: Date.now()
      });
    }
  }

  /**
   * Match workers to subtasks based on expertise and workload
   */
  private matchWorkersToSubtasks(
    workerIds: string[], 
    subtasks: SubTask[]
  ): Map<string, SubTask> {
    const assignments = new Map<string, SubTask>();
    
    // If we have exact match of workers to subtasks, simple assignment
    if (workerIds.length === subtasks.length) {
      workerIds.forEach((workerId, index) => {
        assignments.set(workerId, subtasks[index]);
      });
      return assignments;
    }
    
    // If we have more subtasks than workers, some workers will get multiple tasks
    // For now, just distribute evenly and we'll implement more sophisticated matching later
    if (workerIds.length < subtasks.length) {
      let currentWorkerIndex = 0;
      
      for (const subtask of subtasks) {
        const workerId = workerIds[currentWorkerIndex];
        assignments.set(workerId, subtask);
        
        // Move to next worker in round-robin fashion
        currentWorkerIndex = (currentWorkerIndex + 1) % workerIds.length;
      }
      
      return assignments;
    }
    
    // If we have more workers than subtasks, some workers won't be assigned tasks
    // For now, just assign tasks to first N workers
    subtasks.forEach((subtask, index) => {
      assignments.set(workerIds[index], subtask);
    });
    
    return assignments;
  }

  /**
   * Create worker subtasks with enhanced decomposition logic
   */
  private async createWorkerSubtasks(
    task: SubTask,
    workerCount: number,
    analysisResult?: TaskAnalysisResult
  ): Promise<SubTask[]> {
    // For simple tasks or single worker case, just pass through
    if (workerCount === 1 || 
        (analysisResult?.complexity === TaskComplexity.SIMPLE && 
         analysisResult?.estimatedSubtaskCount <= 1)) {
      return [task];
    }
    
    // If we have analysis results with components, use them for decomposition
    if (analysisResult?.components && analysisResult.components.length > 0) {
      return this.decomposeTaskBasedOnAnalysis(task, analysisResult, workerCount);
    }
    
    // Fall back to LLM-based decomposition if no components available
    return this.decomposeTaskWithLLM(task, workerCount);
  }
  
  /**
   * Decompose task based on analysis components
   */
  private decomposeTaskBasedOnAnalysis(
    task: SubTask,
    analysis: TaskAnalysisResult,
    workerCount: number
  ): SubTask[] {
    const subtasks: SubTask[] = [];
    
    // Adjust component count based on available workers
    const components = analysis.components.slice(0, workerCount);
    
    // Create a subtask for each component
    for (const component of components) {
      const subtask: SubTask = {
        id: `worker-task-${component.id || uuidv4()}`,
        parentTaskId: task.id,
        type: task.type,
        status: AnalysisTaskStatus.PENDING,
        managedBy: this.id,
        input: {
          ...task.input,
          workerFocus: component.name,
          workerInstructions: component.description,
          requiredExpertise: component.requiredExpertise
        },
        context: {
          description: component.description,
          managerContext: task.context,
          componentId: component.id,
          dependencies: analysis.dependencies
            .filter(dep => dep.dependent === component.id)
            .map(dep => dep.prerequisite)
        },
        priority: this.calculatePriority(component, analysis.dependencies),
        created: Date.now(),
        updated: Date.now()
      };
      
      subtasks.push(subtask);
    }
    
    return subtasks;
  }
  
  /**
   * Calculate priority for a component based on dependencies
   */
  private calculatePriority(
    component: SubTaskComponent,
    dependencies: SubtaskRelationship[]
  ): number {
    // Components that are prerequisites get higher priority (lower number)
    const isPrerequisite = dependencies.some(dep => dep.prerequisite === component.id);
    const hasDependencies = dependencies.some(dep => dep.dependent === component.id);
    
    if (isPrerequisite && !hasDependencies) {
      // This is a root node in the dependency graph (highest priority)
      return 1;
    } else if (isPrerequisite) {
      // This is a middle node - medium-high priority
      return 2;
    } else if (!hasDependencies) {
      // This is a leaf node with no dependencies - medium priority
      return 3;
    } else {
      // This has dependencies and isn't a prerequisite - lower priority
      return 4;
    }
  }
  
  /**
   * Decompose task using LLM when no analysis components are available
   */
  private async decomposeTaskWithLLM(
    task: SubTask,
    workerCount: number
  ): Promise<SubTask[]> {
    // Use LLM to help break down the task
    const prompt = `
      As a manager agent specializing in ${this.managedExpertise.join(', ')},
      you need to break down this task into ${workerCount} worker subtasks.
      
      Task: ${JSON.stringify(task, null, 2)}
      
      Each worker should focus on a different aspect or part of the task.
      
      Analyze the task first to identify logical components that can be separated.
      Consider:
      1. Different aspects of analysis that can be done in parallel
      2. Different sections of the content that can be processed separately
      3. Different expertise areas that might be needed
      4. Dependencies between subtasks
      
      Return your answer as a JSON array where each element represents a worker subtask with:
      - "id": a unique identifier (string)
      - "description": a brief description (string)
      - "focus": the specific aspect to focus on (string)
      - "instructions": detailed instructions (string)
      - "requiredExpertise": what expertise is needed (string[])
      - "priority": relative priority from 1-5 with 1 being highest (number)
      - "dependencies": ids of other subtasks this depends on (string[])
    `;
    
    const response = await this.callLLM('Create worker subtasks', prompt);
    
    try {
      const workerTaskDefinitions = JSON.parse(response);
      
      // Create actual subtasks from the definitions
      return workerTaskDefinitions.map((definition: any) => {
        return {
          id: definition.id || `worker-task-${uuidv4()}`,
          parentTaskId: task.id,
          type: task.type,
          status: AnalysisTaskStatus.PENDING,
          managedBy: this.id,
          input: {
            ...task.input,
            workerFocus: definition.focus,
            workerInstructions: definition.instructions,
            requiredExpertise: definition.requiredExpertise || []
          },
          context: {
            description: definition.description,
            managerContext: task.context,
            dependencies: definition.dependencies || []
          },
          priority: definition.priority || 3,
          created: Date.now(),
          updated: Date.now()
        };
      });
    } catch (error) {
      this.logger.error(`Error parsing worker task definitions: ${error}`);
      
      // Fallback: create identical tasks
      return Array(workerCount).fill(null).map(() => ({
        ...task,
        id: `worker-task-${uuidv4()}`
      }));
    }
  }

  /**
   * Finalize a task by evaluating worker results and sending to supervisor
   */
  private async finalizeTask(taskId: string): Promise<void> {
    const taskRecord = this.assignedTasks.get(taskId);
    
    if (!taskRecord) {
      return;
    }
    
    this.logger.info(`Finalizing task ${taskId} with ${taskRecord.results.length} worker results`);
    
    // Evaluate and combine results
    const combinedResult = await this.evaluateResults(taskRecord.results);
    
    // Update task status
    taskRecord.status = AnalysisTaskStatus.COMPLETED;
    
    // Send result to supervisor
    await this.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.RESPONSE,
      sender: this.id,
      recipients: [this.supervisorId],
      content: {
        requestType: 'task_execution',
        taskId: taskRecord.task.id,
        result: combinedResult,
        metadata: {
          workerResults: taskRecord.results.length,
          managerId: this.id
        }
      },
      timestamp: Date.now()
    });
  }

  /**
   * Handle taking over a task from another manager
   */
  private async handleTakeoverTask(
    task: SubTask,
    previousManager: string,
    escalationContext: any
  ): Promise<void> {
    this.logger.info(`Taking over task ${task.id} from ${previousManager}`);
    
    // Add to assigned tasks
    this.assignedTasks.set(task.id, {
      task,
      assignedWorkers: [],
      status: task.status,
      results: []
    });
    
    // Use the context to guide the task execution
    const availableWorkers = await this.getAvailableWorkers();
    
    // Apply any additional context from the escalation
    const enhancedTask = {
      ...task,
      context: {
        ...task.context,
        escalationHistory: {
          previousManager,
          escalationReason: escalationContext.reason,
          additionalContext: escalationContext.context
        }
      }
    };
    
    // Delegate to workers with the enhanced context
    await this.delegateSubtasks(enhancedTask, availableWorkers);
  }

  /**
   * Send status update to requester
   */
  private async sendStatusUpdate(requesterId: string): Promise<void> {
    // Compile status information
    const status = {
      managerId: this.id,
      managedExpertise: this.managedExpertise,
      activeTasks: Array.from(this.assignedTasks.entries()).map(([taskId, record]) => ({
        taskId,
        status: record.status,
        assignedWorkers: record.assignedWorkers,
        resultsReceived: record.results.length
      })),
      workers: Array.from(this.activeWorkers.entries()).map(([workerId, worker]) => ({
        workerId,
        expertise: worker.expertise,
        availability: worker.availability,
        taskCount: worker.taskCount
      }))
    };
    
    // Send status message
    await this.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.RESPONSE,
      sender: this.id,
      recipients: [requesterId],
      content: {
        requestType: 'status_update',
        status
      },
      timestamp: Date.now()
    });
  }

  /**
   * Handle assistance request from worker
   */
  private async handleAssistanceRequest(message: AgentMessage): Promise<void> {
    const { taskId, issue, context } = message.content;
    
    this.logger.info(`Assistance request from ${message.sender} for task ${taskId}: ${issue}`);
    
    // Try to resolve the issue
    const resolution = await this.resolveWorkerIssue(taskId, message.sender, issue, context);
    
    if (resolution.resolved) {
      // Send guidance back to worker
      await this.sendMessage({
        id: `msg-${uuidv4()}`,
        type: MessageType.RESPONSE,
        sender: this.id,
        recipients: [message.sender],
        content: {
          requestType: 'assistance_request',
          taskId,
          resolution: resolution.guidance,
          additionalContext: resolution.additionalContext
        },
        timestamp: Date.now()
      });
    } else {
      // Escalate to supervisor
      await this.escalateToSupervisor(taskId, `Worker assistance request: ${issue}`);
    }
  }

  /**
   * Resolve issue for a worker
   */
  private async resolveWorkerIssue(
    taskId: string,
    workerId: string,
    issue: string,
    context: any
  ): Promise<{ resolved: boolean; guidance?: string; additionalContext?: any }> {
    // Get task information
    const taskRecord = this.assignedTasks.get(taskId);
    
    if (!taskRecord) {
      return { resolved: false };
    }
    
    // Use LLM to generate guidance
    const prompt = `
      As a manager agent, you need to resolve an issue reported by a worker:
      
      Task: ${JSON.stringify(taskRecord.task, null, 2)}
      Worker: ${workerId}
      Issue: ${issue}
      Context: ${JSON.stringify(context, null, 2)}
      
      Can you resolve this within your capability, or does it need escalation to the supervisor?
      
      If you can resolve it, provide:
      1. Specific guidance to address the issue
      2. Any additional context or information that might help
      
      If it needs escalation, explain why it exceeds your authority or capabilities.
      
      Return your answer as a JSON object:
      {
        "canResolve": boolean,
        "guidance": string (if canResolve is true),
        "additionalContext": object (if applicable),
        "escalationReason": string (if canResolve is false)
      }
    `;
    
    const response = await this.callLLM('Resolve worker issue', prompt);
    
    try {
      const result = JSON.parse(response);
      
      if (result.canResolve) {
        return {
          resolved: true,
          guidance: result.guidance,
          additionalContext: result.additionalContext
        };
      } else {
        return { resolved: false };
      }
    } catch (error) {
      this.logger.error(`Error parsing issue resolution: ${error}`);
      return { resolved: false };
    }
  }

  /**
   * Evaluate and combine results from multiple workers
   */
  async evaluateResults(results: AgentOutput[]): Promise<AgentOutput> {
    this.logger.info(`Evaluating ${results.length} worker results`);
    
    if (results.length === 0) {
      return {
        content: {},
        confidence: ConfidenceLevel.UNCERTAIN,
        timestamp: Date.now()
      };
    }
    
    if (results.length === 1) {
      // Only one result, return it with manager's endorsement
      return {
        ...results[0],
        metadata: {
          ...results[0].metadata,
          managerEvaluated: true,
          managerId: this.id
        }
      };
    }
    
    // Use LLM to evaluate and combine multiple results
    const prompt = `
      As a manager agent, evaluate and combine these worker results into a single coherent output.
      
      Results:
      ${results.map((r, i) => {
        return `
          WORKER RESULT ${i+1}:
          Confidence: ${r.confidence}
          Content: ${JSON.stringify(r.content, null, 2)}
          ${r.reasoning ? `Reasoning: ${r.reasoning}` : ''}
        `;
      }).join('\n')}
      
      For each aspect of the task:
      1. Identify the highest quality information across all workers
      2. Resolve any contradictions by selecting the most supported/accurate version
      3. Combine non-overlapping information in a coherent way
      4. Assign an overall confidence level
      
      Return your answer as a JSON object with:
      - "content": combined content (object)
      - "confidence": overall confidence ("high", "medium", "low", or "uncertain")
      - "reasoning": explanation of how you combined the results (string)
    `;
    
    const response = await this.callLLM('Evaluate worker results', prompt);
    
    try {
      const evaluation = JSON.parse(response);
      
      return {
        content: evaluation.content,
        confidence: evaluation.confidence as ConfidenceLevel,
        reasoning: evaluation.reasoning,
        metadata: {
          resultCount: results.length,
          managerEvaluated: true,
          managerId: this.id,
          workerIds: results.map(r => r.metadata?.workerId).filter(Boolean)
        },
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error(`Error parsing result evaluation: ${error}`);
      
      // Fallback: return the result with highest confidence
      const sortedResults = [...results].sort((a, b) => {
        return this.getConfidenceScore(b.confidence) - this.getConfidenceScore(a.confidence);
      });
      
      return {
        content: sortedResults[0].content,
        confidence: sortedResults[0].confidence,
        reasoning: 'Selected highest confidence result due to evaluation error',
        metadata: {
          evaluationError: String(error),
          fallbackToHighestConfidence: true,
          resultCount: results.length,
          managerId: this.id
        },
        timestamp: Date.now()
      };
    }
  }

  /**
   * Escalate an issue to the supervisor
   */
  async escalateToSupervisor(taskId: string, reason: string): Promise<void> {
    this.logger.info(`Escalating task ${taskId} to supervisor: ${reason}`);
    
    const taskRecord = this.assignedTasks.get(taskId);
    
    // Send escalation message
    await this.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.ESCALATE,
      sender: this.id,
      recipients: [this.supervisorId],
      content: {
        taskId,
        reason,
        context: {
          task: taskRecord?.task,
          assignedWorkers: taskRecord?.assignedWorkers || [],
          results: taskRecord?.results || [],
          managerId: this.id,
          escalatedAt: Date.now()
        }
      },
      timestamp: Date.now()
    });
  }

  /**
   * Add a worker to the team
   */
  async addWorker(workerId: string): Promise<void> {
    this.logger.info(`Adding worker ${workerId} to team`);
    
    // Request worker info
    await this.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.REQUEST,
      sender: this.id,
      recipients: [workerId],
      content: {
        requestType: 'worker_info'
      },
      timestamp: Date.now()
    });
    
    // For now, add with default values until response is received
    this.activeWorkers.set(workerId, {
      id: workerId,
      expertise: this.managedExpertise, // Assume same expertise as manager
      availability: true,
      performance: 0.8, // Default initial performance
      taskCount: 0
    });
    
    this.managedAgents.push(workerId);
  }

  /**
   * Remove a worker from the team
   */
  async removeWorker(workerId: string): Promise<void> {
    this.logger.info(`Removing worker ${workerId} from team`);
    
    // Find incomplete tasks assigned to this worker
    for (const [taskId, record] of this.assignedTasks.entries()) {
      if (
        record.status !== AnalysisTaskStatus.COMPLETED && 
        record.assignedWorkers.includes(workerId)
      ) {
        // Reassign to other worker
        const availableWorkers = await this.getAvailableWorkers();
        const otherWorkers = availableWorkers.filter(id => id !== workerId);
        
        if (otherWorkers.length > 0) {
          // Replace this worker
          const replacementWorker = otherWorkers[0];
          record.assignedWorkers = record.assignedWorkers.map(id => 
            id === workerId ? replacementWorker : id
          );
          
          // Notify the replacement worker
          await this.sendMessage({
            id: `msg-${uuidv4()}`,
            type: MessageType.REQUEST,
            sender: this.id,
            recipients: [replacementWorker],
            content: {
              requestType: 'task_execution',
              taskId,
              task: record.task,
              context: {
                reassigned: true,
                previousWorker: workerId
              }
            },
            timestamp: Date.now()
          });
        } else {
          // No replacement available, escalate
          await this.escalateToSupervisor(taskId, `Worker ${workerId} removed with no replacement`);
        }
      }
    }
    
    // Remove from active workers
    this.activeWorkers.delete(workerId);
    
    // Remove from managed agents
    this.managedAgents = this.managedAgents.filter(id => id !== workerId);
    
    // Notify worker of removal
    await this.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.NOTIFICATION,
      sender: this.id,
      recipients: [workerId],
      content: {
        event: 'team_removal',
        reason: 'Worker removed from team'
      },
      timestamp: Date.now()
    });
  }

  /**
   * Get list of available workers
   */
  async getAvailableWorkers(): Promise<string[]> {
    // Return workers that are available and under the task limit
    return Array.from(this.activeWorkers.entries())
      .filter(([_, worker]) => worker.availability && worker.taskCount < 3)
      .map(([id, _]) => id);
  }

  /**
   * Enhanced system prompt for the manager with task decomposition focus
   */
  protected getDefaultSystemPrompt(): string {
    return `
      You are an Analysis Manager Agent, responsible for leading a team of specialist workers
      to analyze meeting transcripts. Your key responsibilities include:

      1. Breaking down complex tasks into smaller, well-defined subtasks
      2. Matching subtasks to appropriate workers based on expertise
      3. Managing dependencies between subtasks to ensure efficient workflow
      4. Evaluating and combining results from multiple workers
      5. Resolving issues encountered by workers
      6. Escalating problems you cannot solve to your supervisor

      As a manager, you should:
      - Think analytically about task decomposition and parallel processing
      - Consider the expertise and strengths of your worker team members
      - Ensure proper coordination of dependent subtasks
      - Maintain high quality standards in your team's output
      - Communicate clearly with both workers and supervisor

      You specialize in: ${this.managedExpertise.join(', ')}
      
      Maintain objectivity and focus on producing accurate, comprehensive meeting analyses.
    `;
  }
} 