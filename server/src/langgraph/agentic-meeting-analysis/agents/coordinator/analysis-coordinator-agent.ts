/**
 * Analysis Coordinator Agent for the Agentic Meeting Analysis System
 */
import { v4 as uuidv4 } from 'uuid';
import {
  IAnalysisCoordinatorAgent,
  AgentExpertise,
  AgentOutput,
  AnalysisGoalType,
  AnalysisTask,
  AnalysisTaskStatus,
  ConfidenceLevel,
  MessageType,
  AgentMessage,
  AgentRole,
  SynthesisFunction,
  AgentResultCollection,
  FinalResult,
} from '../../interfaces/agent.interface';
import { MeetingTranscript } from '../../interfaces/state.interface';
import { BaseMeetingAnalysisAgent } from '../base-meeting-analysis-agent';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ChatOpenAI } from '@langchain/openai';

/**
 * Configuration options for AnalysisCoordinatorAgent
 */
export interface AnalysisCoordinatorAgentConfig {
  id?: string;
  name?: string;
  logger?: Logger;
  llm?: ChatOpenAI;
  systemPrompt?: string;
  maxTeamSize?: number;
  qualityThreshold?: number;
}

/**
 * Implementation of the Analysis Coordinator Agent
 * This agent is responsible for:
 * - Analyzing meeting characteristics
 * - Forming and managing teams of specialist agents
 * - Assigning tasks to appropriate specialists
 * - Monitoring analysis quality and progress
 * - Synthesizing final results from specialist contributions
 */
export class AnalysisCoordinatorAgent
  extends BaseMeetingAnalysisAgent
  implements IAnalysisCoordinatorAgent
{
  public readonly role: AgentRole = AgentRole.COORDINATOR;
  private maxTeamSize: number;
  private qualityThreshold: number;
  private specialistRegistry: Map<
    string,
    {
      agentId: string;
      expertise: AgentExpertise[];
      capabilities: AnalysisGoalType[];
      availability: boolean;
      performance: number;
    }
  > = new Map();

  /**
   * Create a new Analysis Coordinator Agent
   */
  constructor(config: AnalysisCoordinatorAgentConfig) {
    // Set up expertise and capabilities for coordinator
    super({
      id: config.id,
      name: config.name || 'Analysis Coordinator',
      expertise: [AgentExpertise.COORDINATION],
      capabilities: [
        AnalysisGoalType.FULL_ANALYSIS,
        AnalysisGoalType.GENERATE_SUMMARY,
      ],
      logger: config.logger,
      llm: config.llm,
      systemPrompt: config.systemPrompt,
    });

    this.maxTeamSize = config.maxTeamSize || 8;
    this.qualityThreshold = config.qualityThreshold || 0.7;

    this.logger.info(
      `Initialized ${this.name} with max team size: ${this.maxTeamSize}`,
    );
  }

  /**
   * Initialize the coordinator agent
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);

    // Subscribe to agent registration messages
    this.on('notification', this.handleAgentRegistration.bind(this));

    // Subscribe to task completion messages
    this.on('response', this.handleTaskCompletion.bind(this));

    this.logger.info(`${this.name} initialized successfully`);
  }

  /**
   * Analyze meeting characteristics to determine required expertise
   */
  private async analyzeMeetingCharacteristics(transcript: string): Promise<{
    complexity: number;
    technicalLevel: number;
    controversyLevel: number;
    actionOriented: boolean;
    requiredExpertise: AgentExpertise[];
  }> {
    this.logger.info('Analyzing meeting characteristics');

    const prompt = `
      Analyze the following meeting transcript to evaluate its characteristics:
      1. Complexity (0-1 scale)
      2. Technical Level (0-1 scale)
      3. Controversy Level (0-1 scale)
      4. Action Oriented (true/false)
      5. List of required expertise from these options: TOPIC_ANALYSIS, ACTION_ITEM_EXTRACTION, 
         DECISION_TRACKING, SENTIMENT_ANALYSIS, PARTICIPANT_DYNAMICS, SUMMARY_GENERATION, CONTEXT_INTEGRATION

      Return your response as a JSON object with these properties.
      
      TRANSCRIPT:
      ${transcript.slice(0, 3000)}... (transcript continues)
    `;

    const response = await this.callLLM(
      'Analyze meeting characteristics',
      prompt,
    );

    try {
      const characteristics = JSON.parse(response);

      // Validate required expertise
      const validExpertise: AgentExpertise[] = [];
      for (const expertise of characteristics.requiredExpertise) {
        if (
          Object.values(AgentExpertise).includes(expertise as AgentExpertise)
        ) {
          validExpertise.push(expertise as AgentExpertise);
        }
      }

      // Always include summary generation
      if (!validExpertise.includes(AgentExpertise.SUMMARY_GENERATION)) {
        validExpertise.push(AgentExpertise.SUMMARY_GENERATION);
      }

      // Return validated characteristics
      return {
        complexity: Math.min(Math.max(characteristics.complexity, 0), 1),
        technicalLevel: Math.min(
          Math.max(characteristics.technicalLevel, 0),
          1,
        ),
        controversyLevel: Math.min(
          Math.max(characteristics.controversyLevel, 0),
          1,
        ),
        actionOriented: Boolean(characteristics.actionOriented),
        requiredExpertise: validExpertise,
      };
    } catch (error) {
      this.logger.error(
        `Error parsing meeting characteristics: ${error instanceof Error ? error.message : String(error)}`,
      );

      // Return default characteristics if parsing fails
      return {
        complexity: 0.5,
        technicalLevel: 0.5,
        controversyLevel: 0.3,
        actionOriented: true,
        requiredExpertise: [
          AgentExpertise.TOPIC_ANALYSIS,
          AgentExpertise.ACTION_ITEM_EXTRACTION,
          AgentExpertise.SUMMARY_GENERATION,
        ],
      };
    }
  }

  /**
   * Form a team of specialists for a specific analysis goal
   */
  async formTeam(
    analysisGoal: AnalysisGoalType,
    transcript: string,
  ): Promise<string[]> {
    this.logger.info(`Forming team for analysis goal: ${analysisGoal}`);

    // Analyze meeting characteristics
    const characteristics =
      await this.analyzeMeetingCharacteristics(transcript);

    // Get required expertise based on goal type
    let requiredExpertise = characteristics.requiredExpertise;

    // Adjust required expertise based on goal type
    if (analysisGoal !== AnalysisGoalType.FULL_ANALYSIS) {
      // For specific goals, prioritize the relevant expertise
      switch (analysisGoal) {
        case AnalysisGoalType.EXTRACT_TOPICS:
          requiredExpertise = [AgentExpertise.TOPIC_ANALYSIS];
          break;
        case AnalysisGoalType.EXTRACT_ACTION_ITEMS:
          requiredExpertise = [AgentExpertise.ACTION_ITEM_EXTRACTION];
          break;
        case AnalysisGoalType.EXTRACT_DECISIONS:
          requiredExpertise = [AgentExpertise.DECISION_TRACKING];
          break;
        case AnalysisGoalType.ANALYZE_SENTIMENT:
          requiredExpertise = [AgentExpertise.SENTIMENT_ANALYSIS];
          break;
        case AnalysisGoalType.ANALYZE_PARTICIPATION:
          requiredExpertise = [AgentExpertise.PARTICIPANT_DYNAMICS];
          break;
        case AnalysisGoalType.GENERATE_SUMMARY:
          requiredExpertise = [AgentExpertise.SUMMARY_GENERATION];
          break;
        case AnalysisGoalType.INTEGRATE_CONTEXT:
          requiredExpertise = [AgentExpertise.CONTEXT_INTEGRATION];
          break;
      }
    }

    // Select the best agents for each required expertise
    const selectedAgents: string[] = [];

    for (const expertise of requiredExpertise) {
      const expertAgents = Array.from(this.specialistRegistry.values())
        .filter(
          (agent) =>
            agent.expertise.includes(expertise) &&
            agent.availability &&
            agent.performance >= this.qualityThreshold,
        )
        .sort((a, b) => b.performance - a.performance);

      if (expertAgents.length > 0) {
        // Select the best performing agent for this expertise
        selectedAgents.push(expertAgents[0].agentId);

        // Mark agent as unavailable (simple scheduling mechanism)
        this.specialistRegistry.get(expertAgents[0].agentId)!.availability =
          false;
      }
    }

    // Ensure team size doesn't exceed maximum
    if (selectedAgents.length > this.maxTeamSize) {
      selectedAgents.splice(this.maxTeamSize);
    }

    // Always include the coordinator
    selectedAgents.push(this.id);

    this.logger.info(
      `Formed team with ${selectedAgents.length} agents for goal: ${analysisGoal}`,
    );

    return selectedAgents;
  }

  /**
   * Assign a task to a specific agent
   */
  async assignTask(taskId: string, agentId: string): Promise<void> {
    this.logger.info(`Assigning task ${taskId} to agent ${agentId}`);

    // Get task from state
    const taskData = await this.readMemory(`tasks.${taskId}`, 'analysis');

    if (!taskData) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Update task assignment
    const updatedTask = {
      ...taskData,
      assignedTo: agentId,
      status: AnalysisTaskStatus.IN_PROGRESS,
      updated: Date.now(),
    };

    // Save updated task
    await this.writeMemory(`tasks.${taskId}`, updatedTask, 'analysis');

    // Notify the assigned agent
    const message: AgentMessage = {
      id: `task-${uuidv4()}`,
      type: MessageType.REQUEST,
      sender: this.id,
      recipients: [agentId],
      content: {
        taskId,
        taskType: updatedTask.type,
        input: updatedTask.input,
        message: `You have been assigned to task ${taskId} of type ${updatedTask.type}`,
      },
      timestamp: Date.now(),
    };

    await this.sendMessage(message);
  }

  /**
   * Reassign a task to a different agent
   */
  async reassignTask(taskId: string, newAgentId: string): Promise<void> {
    this.logger.info(`Reassigning task ${taskId} to agent ${newAgentId}`);

    // Get task from state
    const taskData = await this.readMemory(`tasks.${taskId}`, 'analysis');

    if (!taskData) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Get current assignee
    const currentAssignee = taskData.assignedTo;

    if (currentAssignee === newAgentId) {
      this.logger.warn(`Task ${taskId} is already assigned to ${newAgentId}`);
      return;
    }

    // Update task assignment
    const updatedTask = {
      ...taskData,
      assignedTo: newAgentId,
      status: AnalysisTaskStatus.IN_PROGRESS,
      updated: Date.now(),
      reassignmentHistory: [
        ...(taskData.reassignmentHistory || []),
        {
          previousAgent: currentAssignee,
          timestamp: Date.now(),
        },
      ],
    };

    // Save updated task
    await this.writeMemory(`tasks.${taskId}`, updatedTask, 'analysis');

    // Notify the previous agent (if any)
    if (currentAssignee) {
      const previousAgentMessage: AgentMessage = {
        id: `task-reassign-${uuidv4()}`,
        type: MessageType.NOTIFICATION,
        sender: this.id,
        recipients: [currentAssignee],
        content: {
          taskId,
          message: `Task ${taskId} has been reassigned to another agent`,
        },
        timestamp: Date.now(),
      };

      await this.sendMessage(previousAgentMessage);
    }

    // Notify the new agent
    const newAgentMessage: AgentMessage = {
      id: `task-assign-${uuidv4()}`,
      type: MessageType.REQUEST,
      sender: this.id,
      recipients: [newAgentId],
      content: {
        taskId,
        taskType: updatedTask.type,
        input: updatedTask.input,
        message: `You have been assigned to task ${taskId} of type ${updatedTask.type}`,
      },
      timestamp: Date.now(),
    };

    await this.sendMessage(newAgentMessage);
  }

  /**
   * Create a workflow for an analysis goal
   */
  async createWorkflow(
    analysisGoal: AnalysisGoalType,
  ): Promise<AnalysisTask[]> {
    this.logger.info(`Creating workflow for analysis goal: ${analysisGoal}`);

    const tasks: AnalysisTask[] = [];
    const now = Date.now();

    // Create appropriate tasks based on the goal type
    if (analysisGoal === AnalysisGoalType.FULL_ANALYSIS) {
      // For full analysis, create a comprehensive workflow with all task types

      // Step 1: Topic Analysis
      const topicTask: AnalysisTask = {
        id: `task-topic-${uuidv4()}`,
        type: AnalysisGoalType.EXTRACT_TOPICS,
        status: AnalysisTaskStatus.PENDING,
        input: { fullTranscript: true },
        priority: 10,
        created: now,
        updated: now,
      };
      tasks.push(topicTask);

      // Step 2: Action Item Extraction
      const actionTask: AnalysisTask = {
        id: `task-action-${uuidv4()}`,
        type: AnalysisGoalType.EXTRACT_ACTION_ITEMS,
        status: AnalysisTaskStatus.PENDING,
        dependencies: [topicTask.id], // Depends on topic analysis
        input: { needTopicLinking: true },
        priority: 8,
        created: now,
        updated: now,
      };
      tasks.push(actionTask);

      // Step 3: Decision Tracking
      const decisionTask: AnalysisTask = {
        id: `task-decision-${uuidv4()}`,
        type: AnalysisGoalType.EXTRACT_DECISIONS,
        status: AnalysisTaskStatus.PENDING,
        dependencies: [topicTask.id], // Depends on topic analysis
        input: { includeRationale: true },
        priority: 8,
        created: now,
        updated: now,
      };
      tasks.push(decisionTask);

      // Step 4: Sentiment Analysis
      const sentimentTask: AnalysisTask = {
        id: `task-sentiment-${uuidv4()}`,
        type: AnalysisGoalType.ANALYZE_SENTIMENT,
        status: AnalysisTaskStatus.PENDING,
        dependencies: [topicTask.id], // Depends on topic analysis
        input: { byTopic: true, byParticipant: true },
        priority: 6,
        created: now,
        updated: now,
      };
      tasks.push(sentimentTask);

      // Step 5: Participation Analysis
      const participationTask: AnalysisTask = {
        id: `task-participation-${uuidv4()}`,
        type: AnalysisGoalType.ANALYZE_PARTICIPATION,
        status: AnalysisTaskStatus.PENDING,
        input: { includeInteractions: true },
        priority: 6,
        created: now,
        updated: now,
      };
      tasks.push(participationTask);

      // Step 6: Context Integration (if available)
      const contextTask: AnalysisTask = {
        id: `task-context-${uuidv4()}`,
        type: AnalysisGoalType.INTEGRATE_CONTEXT,
        status: AnalysisTaskStatus.PENDING,
        input: { connectToPrevious: true },
        priority: 4,
        created: now,
        updated: now,
      };
      tasks.push(contextTask);

      // Step 7: Summary Generation (depends on all other tasks)
      const summaryTask: AnalysisTask = {
        id: `task-summary-${uuidv4()}`,
        type: AnalysisGoalType.GENERATE_SUMMARY,
        status: AnalysisTaskStatus.PENDING,
        dependencies: tasks.map((t) => t.id), // Depends on all previous tasks
        input: { comprehensive: true },
        priority: 12,
        created: now,
        updated: now,
      };
      tasks.push(summaryTask);
    } else {
      // For specific goals, create a simpler workflow
      const mainTask: AnalysisTask = {
        id: `task-${analysisGoal}-${uuidv4()}`,
        type: analysisGoal,
        status: AnalysisTaskStatus.PENDING,
        input: { fullTranscript: true },
        priority: 10,
        created: now,
        updated: now,
      };
      tasks.push(mainTask);

      // For some goal types, add a summary task
      if (
        [
          AnalysisGoalType.EXTRACT_TOPICS,
          AnalysisGoalType.EXTRACT_ACTION_ITEMS,
          AnalysisGoalType.EXTRACT_DECISIONS,
        ].includes(analysisGoal)
      ) {
        const summaryTask: AnalysisTask = {
          id: `task-summary-${uuidv4()}`,
          type: AnalysisGoalType.GENERATE_SUMMARY,
          status: AnalysisTaskStatus.PENDING,
          dependencies: [mainTask.id],
          input: {
            focusedOn: analysisGoal,
            comprehensive: false,
          },
          priority: 8,
          created: now,
          updated: now,
        };
        tasks.push(summaryTask);
      }
    }

    // Save tasks to memory
    for (const task of tasks) {
      await this.writeMemory(`tasks.${task.id}`, task, 'analysis');
    }

    this.logger.info(
      `Created workflow with ${tasks.length} tasks for goal: ${analysisGoal}`,
    );

    return tasks;
  }

  /**
   * Monitor the progress of an analysis
   */
  async monitorProgress(): Promise<Record<string, AnalysisTaskStatus>> {
    this.logger.debug('Monitoring analysis progress');

    // Get all tasks from memory
    const tasksData = (await this.readMemory('tasks', 'analysis')) || {};

    // Extract status of each task
    const taskStatuses: Record<string, AnalysisTaskStatus> = {};

    for (const [taskId, taskData] of Object.entries(tasksData)) {
      const task = taskData as AnalysisTask;
      taskStatuses[taskId] = task.status;
    }

    return taskStatuses;
  }

  /**
   * Synthesize final results from multiple task outputs
   * Implementation of the SynthesisFunction interface for the Coordinator version
   */
  async synthesizeResults(taskIds: string[]): Promise<AgentOutput>;
  async synthesizeResults(results: AgentResultCollection[]): Promise<FinalResult>;
  async synthesizeResults(
    input: string[] | AgentResultCollection[]
  ): Promise<AgentOutput | FinalResult> {
    // If input is string[], call the implementation for task IDs
    if (typeof input[0] === 'string') {
      return this.synthesizeFromTaskIds(input as string[]);
    }
    
    // This shouldn't happen in the coordinator but is needed for the interface
    throw new Error('AnalysisCoordinatorAgent cannot synthesize AgentResultCollection[]');
  }

  /**
   * Implementation of synthesis from task IDs
   */
  private async synthesizeFromTaskIds(taskIds: string[]): Promise<AgentOutput> {
    this.logger.info(`Synthesizing results from ${taskIds.length} tasks`);

    // Collect outputs from all tasks
    const taskOutputs: Record<string, any> = {};
    const taskTypes: Record<string, AnalysisGoalType> = {};

    for (const taskId of taskIds) {
      const taskData = await this.readMemory(`tasks.${taskId}`, 'analysis');

      if (
        taskData &&
        taskData.output &&
        taskData.status === AnalysisTaskStatus.COMPLETED
      ) {
        taskOutputs[taskId] = taskData.output.content;
        taskTypes[taskId] = taskData.type;
      }
    }

    // Structure the synthesis prompt based on available outputs
    let synthesisPrompt = `Synthesize the following analysis outputs into a coherent final result:\n\n`;

    for (const [taskId, output] of Object.entries(taskOutputs)) {
      synthesisPrompt += `### ${taskTypes[taskId]} ANALYSIS (Task ${taskId}):\n`;
      synthesisPrompt +=
        typeof output === 'string' ? output : JSON.stringify(output, null, 2);
      synthesisPrompt += '\n\n';
    }

    synthesisPrompt += `Create a comprehensive synthesis that includes:
1. An executive summary
2. Key topics and their importance
3. All action items with assignees
4. Important decisions and their rationale
5. Notable sentiment patterns
6. Participation insights
7. Any relevant contextual connections

Format your response as a structured JSON object with these sections.`;

    // Call LLM to synthesize results
    const synthesisResponse = await this.callLLM(
      'Synthesize meeting analysis results',
      synthesisPrompt,
    );

    // Parse and validate the synthesis
    let synthesizedContent;
    try {
      synthesizedContent = JSON.parse(synthesisResponse);
    } catch (error) {
      this.logger.warn(`Failed to parse synthesis as JSON, using raw response`);
      synthesizedContent = synthesisResponse;
    }

    // Assess confidence in the synthesis
    const confidence = await this.assessConfidence(synthesizedContent);
    const reasoning = await this.explainReasoning(synthesizedContent);

    return {
      content: synthesizedContent,
      confidence,
      reasoning,
      metadata: {
        taskIds,
        contributingAgents: Object.keys(this.specialistRegistry),
        synthesizedAt: Date.now(),
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Process an assigned analysis task
   */
  async processTask(task: AnalysisTask): Promise<AgentOutput> {
    this.logger.info(`Coordinator processing task: ${task.id} (${task.type})`);

    if (task.type === AnalysisGoalType.FULL_ANALYSIS) {
      // For full analysis, create and manage the workflow
      const transcript = await this.readMemory('transcript', 'meeting');

      if (!transcript) {
        throw new Error('Meeting transcript not found in memory');
      }

      // Form team
      const teamMembers = await this.formTeam(
        AnalysisGoalType.FULL_ANALYSIS,
        transcript,
      );

      // Create workflow
      const workflowTasks = await this.createWorkflow(
        AnalysisGoalType.FULL_ANALYSIS,
      );

      // Assign initial tasks (those without dependencies)
      for (const workflowTask of workflowTasks) {
        if (
          !workflowTask.dependencies ||
          workflowTask.dependencies.length === 0
        ) {
          // Find an appropriate agent for this task
          const suitableAgents = Array.from(
            this.specialistRegistry.values(),
          ).filter(
            (agent) =>
              agent.capabilities.includes(workflowTask.type) &&
              agent.availability,
          );

          if (suitableAgents.length > 0) {
            await this.assignTask(workflowTask.id, suitableAgents[0].agentId);
          }
        }
      }

      // Return initial response
      return {
        content: {
          message: 'Full analysis workflow initiated',
          teamSize: teamMembers.length,
          taskCount: workflowTasks.length,
          estimatedTimeToComplete: '5-10 minutes',
        },
        confidence: ConfidenceLevel.HIGH,
        reasoning:
          'Successfully created and initiated the full analysis workflow',
        metadata: {
          workflowTasks: workflowTasks.map((t) => t.id),
          teamMembers,
        },
        timestamp: Date.now(),
      };
    } else if (task.type === AnalysisGoalType.GENERATE_SUMMARY) {
      // For summary generation, synthesize results from completed tasks
      const tasksData = (await this.readMemory('tasks', 'analysis')) || {};
      const completedTaskIds = Object.keys(tasksData).filter(
        (taskId) => tasksData[taskId].status === AnalysisTaskStatus.COMPLETED,
      );

      return await this.synthesizeResults(completedTaskIds) as AgentOutput;
    }

    // For other task types that the coordinator shouldn't directly handle
    throw new Error(
      `Coordinator agent cannot directly handle task type: ${task.type}`,
    );
  }

  /**
   * Handle agent registration messages
   */
  private async handleAgentRegistration(message: AgentMessage): Promise<void> {
    if (message.content?.messageType === 'AGENT_REGISTRATION') {
      const { agentId, expertise, capabilities, name } = message.content;

      this.logger.info(
        `Registering agent ${name} (${agentId}) with expertise: ${expertise.join(', ')}`,
      );

      // Add agent to registry
      this.specialistRegistry.set(agentId, {
        agentId,
        expertise,
        capabilities,
        availability: true,
        performance: 0.8, // Default initial performance score
      });

      // Send confirmation
      const response: AgentMessage = {
        id: `reg-confirm-${uuidv4()}`,
        type: MessageType.NOTIFICATION,
        sender: this.id,
        recipients: [agentId],
        content: {
          messageType: 'REGISTRATION_CONFIRMED',
          message: `Agent ${name} successfully registered with coordinator`,
        },
        replyTo: message.id,
        timestamp: Date.now(),
      };

      await this.sendMessage(response);
    }
  }

  /**
   * Handle task completion messages
   */
  private async handleTaskCompletion(message: AgentMessage): Promise<void> {
    if (message.content?.messageType === 'TASK_COMPLETED') {
      const { taskId, output } = message.content;

      this.logger.info(
        `Received task completion for task ${taskId} from agent ${message.sender}`,
      );

      // Update task status
      const taskData = await this.readMemory(`tasks.${taskId}`, 'analysis');

      if (taskData) {
        // Save task output
        const updatedTask = {
          ...taskData,
          status: AnalysisTaskStatus.COMPLETED,
          output,
          updated: Date.now(),
        };

        await this.writeMemory(`tasks.${taskId}`, updatedTask, 'analysis');

        // Mark agent as available again
        const agent = this.specialistRegistry.get(message.sender);
        if (agent) {
          agent.availability = true;

          // Update performance score based on confidence
          if (output.confidence === ConfidenceLevel.HIGH) {
            agent.performance = Math.min(agent.performance + 0.05, 1);
          } else if (output.confidence === ConfidenceLevel.LOW) {
            agent.performance = Math.max(agent.performance - 0.05, 0.5);
          }

          this.specialistRegistry.set(message.sender, agent);
        }

        // Check if this completion unblocks any dependent tasks
        const tasksData = (await this.readMemory('tasks', 'analysis')) || {};

        for (const [otherTaskId, otherTask] of Object.entries(tasksData)) {
          const task = otherTask as AnalysisTask;

          // If this task depends on the completed task and all dependencies are satisfied
          if (
            task.status === AnalysisTaskStatus.PENDING &&
            task.dependencies?.includes(taskId)
          ) {
            // Check if all dependencies are completed
            const allDependenciesMet = task.dependencies.every(
              (depId) =>
                tasksData[depId]?.status === AnalysisTaskStatus.COMPLETED,
            );

            if (allDependenciesMet) {
              // Find an appropriate agent for this task
              const suitableAgents = Array.from(
                this.specialistRegistry.values(),
              ).filter(
                (agent) =>
                  agent.capabilities.includes(task.type) && agent.availability,
              );

              if (suitableAgents.length > 0) {
                await this.assignTask(otherTaskId, suitableAgents[0].agentId);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Get default system prompt for coordinator
   */
  protected getDefaultSystemPrompt(): string {
    return `You are the Analysis Coordinator Agent, responsible for orchestrating the meeting analysis process.
Your role includes:
- Analyzing meeting characteristics to determine required expertise
- Forming and managing teams of specialist agents
- Creating analysis workflows and assigning tasks
- Monitoring analysis quality and progress
- Synthesizing final results from specialist contributions

You should ensure comprehensive analysis while optimizing for both quality and efficiency.
Always consider the strengths and expertise of available specialist agents when assigning tasks.`;
  }
}
