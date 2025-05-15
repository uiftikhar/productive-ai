/**
 * Enhanced Supervisor Agent for the Hierarchical Agentic Meeting Analysis System
 * 
 * This implementation extends the AnalysisCoordinatorAgent to provide a true
 * hierarchical structure with supervisor → manager → worker levels, following
 * the LangGraph hierarchical agent teams pattern.
 */
import { v4 as uuidv4 } from 'uuid';
import {
  ISupervisorAgent,
  AgentExpertise,
  AgentRole,
  AnalysisGoalType,
  AnalysisTask,
  AnalysisTaskStatus,
  SubTask,
  AgentOutput,
  AgentResultCollection,
  ConfidenceLevel,
  FinalResult,
  MessageType,
  AgentMessage,
} from '../../interfaces/agent.interface';
import { AnalysisCoordinatorAgent } from './analysis-coordinator-agent';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ChatOpenAI } from '@langchain/openai';
import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { 
  SupervisorRoutingTool, 
  createRoutingContext, 
  formatRoutingPrompt 
} from '../supervisor/supervisor-routing';
import { ResultSynthesisService } from './result-synthesis.service';
import { OpenAIConnector } from '../../../../connectors/openai-connector';
import { HumanMessage } from '@langchain/core/messages';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import { StateGraph, END } from '@langchain/langgraph';
import { ToolNode } from '@langchain/langgraph/prebuilt';

/**
 * Schema for the supervisor routing tool
 */
const routerSchema = z.object({
  reasoning: z.string().describe("Your step-by-step reasoning about which team should handle the current state of analysis"),
  nextAction: z.enum([
    "TOPIC_ANALYSIS", 
    "ACTION_ITEM_EXTRACTION", 
    "SUMMARY_GENERATION", 
    "SENTIMENT_ANALYSIS", 
    "PARTICIPANT_DYNAMICS", 
    "DECISION_TRACKING", 
    "CONTEXT_INTEGRATION", 
    "FINISH"
  ]).describe("The next action to take: either a team name or FINISH to complete analysis"),
  priorityLevel: z.number().min(1).max(10).describe("Priority level from 1-10, with 10 being highest priority"),
  additionalInstructions: z.string().optional().describe("Any additional instructions for the team")
});

/**
 * Interface for supervisor decisions
 */
interface SupervisorDecision {
  reasoning: string;
  nextAction: 'TOPIC_ANALYSIS' | 'ACTION_ITEM_EXTRACTION' | 'SUMMARY_GENERATION' | 
             'SENTIMENT_ANALYSIS' | 'PARTICIPANT_DYNAMICS' | 'DECISION_TRACKING' | 
             'CONTEXT_INTEGRATION' | 'FINISH';
  priorityLevel: number;
  additionalInstructions?: string;
}

/**
 * Configuration for the enhanced supervisor agent
 */
export interface EnhancedSupervisorAgentConfig {
  id?: string;
  name?: string;
  logger?: Logger;
  llm?: ChatOpenAI;
  systemPrompt?: string;
  maxTeamSize?: number;
  qualityThreshold?: number;
  maxManagersCount?: number; // Maximum number of manager agents
  resultSynthesisService?: ResultSynthesisService;
  // Add OpenAI integration properties
  capabilities?: AnalysisGoalType[];
  expertise?: AgentExpertise[];
  openAiConnector?: OpenAIConnector;
  useMockMode?: boolean;
  maxRetries?: number;
}

// Type definition for router input
type RouterInput = z.infer<typeof routerSchema>;

/**
 * Tool for supervisor routing
 */
export class SupervisorRouterTool extends StructuredTool {
  name = 'supervisor_route_decision';
  description = 'Determine which team or agent should act next based on the current analysis context';
  schema = routerSchema;
  
  constructor(private callback?: (decision: z.infer<typeof routerSchema>) => void) {
    super();
  }
  
  async _call(input: z.infer<typeof routerSchema>): Promise<string> {
    console.log(`*********Supervisor routing decision: ${input.nextAction} (priority: ${input.priorityLevel})`);
    // Track the decision if there's a callback
    if (this.callback) {
      this.callback(input);
    }
    
    // Return a confirmation that the decision was processed
    return `Routing decision processed: Next action is ${input.nextAction} with priority ${input.priorityLevel}`;
  }
}

/**
 * Enhanced supervisor agent implementation
 */
export class EnhancedSupervisorAgent 
  extends AnalysisCoordinatorAgent
  implements ISupervisorAgent {
  // Define readonly properties to ensure type consistency
  public override readonly role: AgentRole = AgentRole.SUPERVISOR;
  public routerTool: SupervisorRouterTool;
  
  private maxManagersCount: number;
  private managerRegistry: Map<
    string,
    {
      managerId: string;
      expertise: AgentExpertise[];
      managedAgents: string[];
      performance: number;
      availability: boolean;
    }
  > = new Map();
  
  private teamStructure: Map<AgentExpertise, string[]> = new Map();
  private subTasks: Map<string, SubTask> = new Map();
  private agentResults: Map<string, AgentResultCollection> = new Map();
  private lastRoutingDecision: SupervisorDecision | null = null;
  private resultSynthesisService: ResultSynthesisService;
  private routeLLM: ChatOpenAI;
  private _llm: ChatOpenAI | null = null;
  
  /**
   * Create a new enhanced supervisor agent
   */
  constructor(config: EnhancedSupervisorAgentConfig) {
    // Pass only the properties expected by AnalysisCoordinatorAgentConfig
    super({
      id: config.id || `supervisor-${uuidv4().slice(0, 8)}`,
      name: config.name || 'Analysis Supervisor',
      logger: config.logger,
      llm: config.llm,
      systemPrompt: config.systemPrompt,
      maxTeamSize: config.maxTeamSize || 8,
      qualityThreshold: config.qualityThreshold || 0.7
    });
    
    // Initialize ExpertiseAreas array with proper typing
    this.expertise = config.expertise || [AgentExpertise.MANAGEMENT];
    
    // Initialize capabilities
    if (config.capabilities) {
      this.capabilities = new Set(config.capabilities);
    } else {
      this.capabilities = new Set([AnalysisGoalType.FULL_ANALYSIS]);
    }
    
    this.maxManagersCount = config.maxManagersCount || 5;
    
    // Initialize result synthesis service
    this.resultSynthesisService = config.resultSynthesisService || new ResultSynthesisService({
      logger: this.logger,
      llm: this.getLLM(),
      confidenceThreshold: config.qualityThreshold || 0.7,
      maxRetries: config.maxRetries || 3
    });
    
    // Set up the routing LLM with lower temperature for more consistent routing
    this.routeLLM = new ChatOpenAI({
      modelName: 'gpt-4',
      temperature: 0.3,
    });
    
    // Create the router tool with a callback to track decisions
    this.routerTool = new SupervisorRouterTool((decision) => {
      this.lastRoutingDecision = decision;
      this.logger.debug(`Supervisor routing decision: ${decision.nextAction} (priority: ${decision.priorityLevel})`);
    });
  }
  
  /**
   * Initialize the supervisor agent
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);
    
    this.logger.info(`Initialized Enhanced Supervisor Agent: ${this.id}`);
    
    // Register default expertise types
    [
      AgentExpertise.TOPIC_ANALYSIS,
      AgentExpertise.ACTION_ITEM_EXTRACTION,
      AgentExpertise.SUMMARY_GENERATION,
      AgentExpertise.SENTIMENT_ANALYSIS,
    ].forEach(expertise => {
      this.teamStructure.set(expertise, []);
    });
    
    // Log initialization status
    this.logger.debug(`Enhanced Supervisor initialized with ${this.teamStructure.size} expertise areas`);
  }
  
  /**
   * Get the LLM instance
   */
  protected getLLM(): ChatOpenAI {
    if (!this._llm) {
      this._llm = new ChatOpenAI({
        modelName: 'gpt-4',
        temperature: 0.5,
      });
    }
    return this._llm;
  }
  
  /**
   * Decide which agent or team should act next
   */
  async decideNextAgent(context: { messages: AgentMessage[] }): Promise<string> {
    try {
      const { messages } = context;
      
      // Log the decision context
      this.logger.debug(`Deciding next agent with ${messages.length} messages`);
      
      // Check for transcript in messages - if this is the first message containing a transcript,
      // we need to decompose it into tasks
      if (this.detectTranscriptInMessages(messages)) {
        // Create initial tasks from transcript if we haven't already
        const initialTasks = this.createInitialTasksFromTranscript(messages);
        
        if (initialTasks && initialTasks.length > 0) {
          this.logger.info(`Created ${initialTasks.length} initial tasks from transcript`);
          
          // Process the first task
          const firstTask = initialTasks[0];
          const expertise = firstTask.expertise;
          
          // Return the team ID for the first task
          return this.mapRoutingDecisionToAgent({
            reasoning: "Initial analysis starting with transcript processing",
            nextAction: expertise === AgentExpertise.TOPIC_ANALYSIS 
              ? "TOPIC_ANALYSIS" 
              : "SUMMARY_GENERATION",
            priorityLevel: 10,
            additionalInstructions: "Begin analysis with an overview of the transcript"
          });
        }
      }
      
      // Get context for routing decision
      const routingContext = this.prepareRoutingContext(messages);
      
      // Get pending tasks to determine if we're done
      const pendingTasks = this.getPendingTasks();
      
      // If no pending tasks, we're done
      if (pendingTasks.length === 0) {
        return END;
      }
      
      try {
        // Create a standalone router tool for this invocation
        const standaloneRouterTool = new SupervisorRouterTool((decision) => {
          this.lastRoutingDecision = decision;
        });
        
        // Prepare routing LLM with tool binding
        const routingLLM = this.getLLM().bindTools([standaloneRouterTool]);
        
        // Create a routing prompt
        const promptText = `You are the analysis supervisor. Based on progress and pending tasks, determine the next team that should work on the analysis.
        
Progress: ${routingContext.progress || 0}%
Current focus: ${routingContext.currentFocus || 'None'}

Pending tasks: ${pendingTasks.map(t => t.type).join(', ') || 'None'}

Choose the most appropriate team to process next.`;
        
        // Get decision from LLM
        const llmResponse = await routingLLM.invoke(promptText);
        
        // Process tool calls if present
        if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
          const toolCall = llmResponse.tool_calls[0];
          
          // Parse the tool call args - fix the type error by checking for string or object
          const args = typeof toolCall.args === 'string' 
            ? JSON.parse(toolCall.args) 
            : toolCall.args;
          const decision: SupervisorDecision = {
            nextAction: args.nextAction,
            reasoning: args.reasoning,
            priorityLevel: args.priorityLevel || 5
          };
          
          this.lastRoutingDecision = decision;
          this.logger.info(`Router decision: ${decision.nextAction} (priority: ${decision.priorityLevel})`);
          
          // Map the decision to an agent/team
          return this.mapRoutingDecisionToAgent(decision);
        }
        
        // If no tool calls, default to a basic decision based on pending tasks
        const highestPriorityTask = this.getHighestPriorityTask(pendingTasks);
        const fallbackDecision: SupervisorDecision = {
          reasoning: "Fallback decision based on priority",
          nextAction: highestPriorityTask.expertise === AgentExpertise.TOPIC_ANALYSIS 
            ? "TOPIC_ANALYSIS" 
            : "SUMMARY_GENERATION",
          priorityLevel: 7
        };
        
        this.lastRoutingDecision = fallbackDecision;
        return this.mapRoutingDecisionToAgent(fallbackDecision);
      } catch (error) {
        this.logger.error('Error in routing decision', { error });
        
        // Fallback to a simple decision if the LLM fails
        return "TopicTeam";
      }
    } catch (error) {
      this.logger.error('Error in decideNextAgent', { error });
      return "TopicTeam"; // Default fallback
    }
  }
  
  /**
   * Detect if there's a transcript in the messages
   */
  private detectTranscriptInMessages(messages: AgentMessage[]): boolean {
    for (const message of messages) {
      if (
        message.type === MessageType.NOTIFICATION &&
        message.content?.transcript &&
        typeof message.content.transcript === 'string'
      ) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Create initial tasks from a transcript
   */
  private createInitialTasksFromTranscript(messages: AgentMessage[]): any[] {
    // Extract the transcript
    let transcript = '';
    let meetingId = '';
    let sessionId = '';
    
    for (const message of messages) {
      if (message.type === MessageType.NOTIFICATION && message.content?.transcript) {
        transcript = message.content.transcript;
        meetingId = message.content.meetingId || `meeting-${Date.now()}`;
        sessionId = message.content.sessionId || `session-${Date.now()}`;
        break;
      }
    }
    
    if (!transcript) {
      this.logger.warn('No transcript found in messages');
      return [];
    }
    
    // Create a set of initial tasks based on expertise
    const tasks = [
      // Topic Analysis
      {
        id: `task-topic-${uuidv4().slice(0, 8)}`,
        type: AnalysisGoalType.EXTRACT_TOPICS,
        status: AnalysisTaskStatus.PENDING,
        priority: 10,
        createdAt: Date.now(),
        expertise: AgentExpertise.TOPIC_ANALYSIS,
        meetingId,
        sessionId,
        context: { transcript },
      },
      // Action Item Extraction
      {
        id: `task-action-${uuidv4().slice(0, 8)}`,
        type: AnalysisGoalType.EXTRACT_ACTION_ITEMS,
        status: AnalysisTaskStatus.PENDING,
        priority: 7,
        createdAt: Date.now(),
        expertise: AgentExpertise.ACTION_ITEM_EXTRACTION,
        meetingId,
        sessionId,
        context: { transcript },
      },
      // Summary Generation
      {
        id: `task-summary-${uuidv4().slice(0, 8)}`,
        type: AnalysisGoalType.GENERATE_SUMMARY,
        status: AnalysisTaskStatus.PENDING,
        priority: 8,
        createdAt: Date.now(),
        expertise: AgentExpertise.SUMMARY_GENERATION,
        meetingId,
        sessionId,
        context: { transcript },
      },
      // Sentiment Analysis
      {
        id: `task-sentiment-${uuidv4().slice(0, 8)}`,
        type: AnalysisGoalType.ANALYZE_SENTIMENT,
        status: AnalysisTaskStatus.PENDING,
        priority: 5,
        createdAt: Date.now(),
        expertise: AgentExpertise.SENTIMENT_ANALYSIS,
        meetingId,
        sessionId,
        context: { transcript },
      },
    ];
    
    return tasks;
  }
  
  /**
   * Map a routing decision to an agent or team
   */
  private mapRoutingDecisionToAgent(decision: SupervisorDecision): string {
    // Map the decision to a team or agent ID
    switch (decision.nextAction) {
      case 'TOPIC_ANALYSIS':
        return 'TopicTeam';
      case 'ACTION_ITEM_EXTRACTION':
        return 'ActionTeam';
      case 'SUMMARY_GENERATION':
        return 'SummaryTeam';
      case 'SENTIMENT_ANALYSIS':
        return 'SentimentTeam';
      case 'PARTICIPANT_DYNAMICS':
        return 'ParticipationTeam';
      case 'DECISION_TRACKING':
        return 'DecisionTeam';
      case 'CONTEXT_INTEGRATION':
        return 'ContextTeam';
      case 'FINISH':
        return END;
      default:
        this.logger.warn(`Unknown action: ${decision.nextAction}, defaulting to TopicTeam`);
        return 'TopicTeam';
    }
  }

  /**
   * Break down a complex task into manageable subtasks
   */
  async decomposeTask(task: AnalysisTask): Promise<SubTask[]> {
    this.logger.info(`Decomposing task ${task.id} of type ${task.type}`);

    const prompt = `
      As a supervisor agent, you need to break down a complex analysis task into smaller, more manageable subtasks.
      
      Original task: ${JSON.stringify(task, null, 2)}
      
      Please decompose this task into 3-5 subtasks, considering the following expertise areas:
      ${Object.values(AgentExpertise).join(', ')}
      
      For each subtask, specify:
      1. A brief description
      2. The primary expertise required
      3. The priority level (1-5, where 1 is highest)
      4. Any dependencies on other subtasks
      
      Return your response as a JSON array of objects, where each object represents a subtask with the properties:
      { "description": string, "expertise": string, "priority": number, "dependencies": string[] }
    `;

    const response = await this.callLLM('Decompose task', prompt);
    
    try {
      const decompositionResult = JSON.parse(response);
      
      // Validate and transform the result into SubTask objects
      const subTasks: SubTask[] = [];
      
      for (const item of decompositionResult) {
        // Ensure the expertise is valid
        let expertise = item.expertise;
        if (!Object.values(AgentExpertise).includes(expertise)) {
          expertise = AgentExpertise.TOPIC_ANALYSIS; // Default fallback
        }
        
        // Get or assign a manager for this expertise
        const managerId = await this.assignManagerForExpertise(expertise as AgentExpertise);
        
        const subTaskId = `subtask-${uuidv4()}`;
        
        const subTask: SubTask = {
          id: subTaskId,
          parentTaskId: task.id,
          type: this.mapExpertiseToGoalType(expertise as AgentExpertise),
          status: AnalysisTaskStatus.PENDING,
          managedBy: managerId,
          input: {
            ...task.input,
            description: item.description,
            parentTaskContext: {
              taskType: task.type,
              priority: task.priority
            }
          },
          context: {
            description: item.description,
            dependencies: item.dependencies || []
          },
          priority: item.priority || 3, // Default to medium priority
          created: Date.now(),
          updated: Date.now()
        };
        
        subTasks.push(subTask);
        
        // Store the subtask for later reference
        this.subTasks.set(subTaskId, subTask);
      }
      
      // Update dependencies to use actual subTask IDs
      for (const subTask of subTasks) {
        if (subTask.context?.dependencies?.length > 0) {
          const dependencyDescriptions = subTask.context.dependencies;
          const dependencyIds = subTasks
            .filter(st => dependencyDescriptions.includes(st.context?.description))
            .map(st => st.id);
          
          subTask.context.dependencies = dependencyIds;
        }
      }
      
      return subTasks;
    } catch (error) {
      this.logger.error(`Error parsing task decomposition: ${error}`);
      
      // Fallback: create a single subtask as a simplified version of the original task
      const managerId = await this.assignManagerForExpertise(AgentExpertise.TOPIC_ANALYSIS);
      const subTaskId = `subtask-${uuidv4()}`;
      
      const fallbackSubTask: SubTask = {
        id: subTaskId,
        parentTaskId: task.id,
        type: task.type,
        status: AnalysisTaskStatus.PENDING,
        managedBy: managerId,
        input: task.input,
        priority: task.priority,
        created: Date.now(),
        updated: Date.now()
      };
      
      this.subTasks.set(subTaskId, fallbackSubTask);
      
      return [fallbackSubTask];
    }
  }

  /**
   * Map expertise to an appropriate goal type
   */
  private mapExpertiseToGoalType(expertise: AgentExpertise): AnalysisGoalType {
    switch (expertise) {
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
  }

  /**
   * Assign or find an appropriate manager for the given expertise
   */
  async assignManagerForExpertise(expertise: AgentExpertise): Promise<string> {
    // Check if we already have a manager for this expertise
    for (const [managerId, managerInfo] of this.managerRegistry.entries()) {
      if (
        managerInfo.expertise.includes(expertise) && 
        managerInfo.availability &&
        managerInfo.managedAgents.length < 5 // Avoid overloading a manager
      ) {
        return managerId;
      }
    }
    
    // Find all managers who can handle this expertise
    const availableManagers = Array.from(this.managerRegistry.values())
      .filter(manager => 
        manager.expertise.includes(expertise) && 
        manager.availability
      )
      .sort((a, b) => 
        b.performance - a.performance
      );
    
    if (availableManagers.length > 0) {
      return availableManagers[0].managerId;
    }
    
    // If no manager is available, select a general manager
    const generalManagers = Array.from(this.managerRegistry.values())
      .filter(manager => manager.availability)
      .sort((a, b) => a.managedAgents.length - b.managedAgents.length);
    
    if (generalManagers.length > 0) {
      return generalManagers[0].managerId;
    }
    
    this.logger.warn(`No available manager for expertise ${expertise}, creating a placeholder manager ID`);
    return `manager-placeholder-${Date.now()}`;
  }

  /**
   * Handle escalation messages from managers
   */
  async handleEscalation(message: AgentMessage): Promise<void> {
    this.logger.info(`Handling escalation from ${message.sender}: ${JSON.stringify(message.content)}`);
    
    const { taskId, reason, context } = message.content;
    
    // Get the task that was escalated
    const task = this.subTasks.get(taskId);
    
    if (!task) {
      this.logger.warn(`Escalated unknown task: ${taskId}`);
      return;
    }
    
    // Use LLM to determine how to handle the escalation
    const prompt = `
      As the supervisor agent, you need to handle an escalated issue:
      
      Task: ${JSON.stringify(task, null, 2)}
      Reason for escalation: ${reason}
      Additional context: ${JSON.stringify(context, null, 2)}
      
      Choose the most appropriate action:
      1. Reassign to a different manager
      2. Provide additional guidance to the current manager
      3. Decompose the task further
      4. Mark the task as failed and proceed without it
      5. Take direct action to solve the issue
      
      Return your response as a JSON object with:
      {
        "action": number (1-5),
        "reasoning": string,
        "details": object (action-specific details)
      }
    `;
    
    const response = await this.callLLM('Handle escalation', prompt);
    
    try {
      const decision = JSON.parse(response);
      
      switch (decision.action) {
        case 1: // Reassign
          const newManagerId = await this.assignManagerForExpertise(
            task.input.requiredExpertise || AgentExpertise.TOPIC_ANALYSIS
          );
          
          if (newManagerId !== task.managedBy) {
            task.managedBy = newManagerId;
            task.updated = Date.now();
            
            await this.sendMessage({
              id: `msg-${uuidv4()}`,
              type: MessageType.DELEGATE,
              sender: this.id,
              recipients: [newManagerId],
              content: {
                action: 'take_over_task',
                task: task,
                previousManager: message.sender,
                escalationContext: {
                  reason,
                  context
                }
              },
              timestamp: Date.now()
            });
          }
          break;
          
        case 2: // Provide guidance
          await this.sendMessage({
            id: `msg-${uuidv4()}`,
            type: MessageType.RESPONSE,
            sender: this.id,
            recipients: [message.sender],
            content: {
              action: 'additional_guidance',
              taskId: task.id,
              guidance: decision.details.guidance || decision.reasoning,
              priority: task.priority
            },
            timestamp: Date.now()
          });
          break;
          
        case 3: // Decompose further
          const subTasks = await this.decomposeTask({
            ...task,
            id: `task-${uuidv4()}`,
            type: task.type as AnalysisGoalType
          });
          
          // Notify the original manager about the decomposition
          await this.sendMessage({
            id: `msg-${uuidv4()}`,
            type: MessageType.RESPONSE,
            sender: this.id,
            recipients: [message.sender],
            content: {
              action: 'task_decomposed',
              originalTaskId: task.id,
              decomposedTasks: subTasks.map(st => st.id)
            },
            timestamp: Date.now()
          });
          
          // Assign the new subtasks to appropriate managers
          for (const subTask of subTasks) {
            await this.sendMessage({
              id: `msg-${uuidv4()}`,
              type: MessageType.DELEGATE,
              sender: this.id,
              recipients: [subTask.managedBy],
              content: {
                action: 'new_task',
                task: subTask
              },
              timestamp: Date.now()
            });
          }
          break;
          
        case 4: // Mark as failed
          task.status = AnalysisTaskStatus.FAILED;
          task.updated = Date.now();
          
          await this.sendMessage({
            id: `msg-${uuidv4()}`,
            type: MessageType.NOTIFICATION,
            sender: this.id,
            recipients: [message.sender],
            content: {
              action: 'task_cancelled',
              taskId: task.id,
              reason: 'Task marked as failed due to escalation'
            },
            timestamp: Date.now()
          });
          break;
          
        case 5: // Direct action
          // Implement direct action by the supervisor
          await this.takeDirectAction(task, decision.details);
          break;
      }
    } catch (error) {
      this.logger.error(`Error handling escalation: ${error}`);
      
      // Default action: provide simple guidance
      await this.sendMessage({
        id: `msg-${uuidv4()}`,
        type: MessageType.RESPONSE,
        sender: this.id,
        recipients: [message.sender],
        content: {
          action: 'additional_guidance',
          taskId: task.id,
          guidance: 'Please try to simplify the task and focus on the core requirements.',
          priority: task.priority
        },
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle direct action when supervisor needs to solve a problem
   */
  private async takeDirectAction(task: SubTask, details: any): Promise<void> {
    // Create a simplified version of the task for direct processing
    const simplifiedTask: AnalysisTask = {
      id: `direct-${task.id}`,
      type: task.type,
      status: AnalysisTaskStatus.IN_PROGRESS,
      assignedTo: this.id,
      input: task.input,
      priority: task.priority,
      created: Date.now(),
      updated: Date.now()
    };
    
    try {
      // Process the task directly
      const result = await super.processTask(simplifiedTask);
      
      // Update the original task with the result
      task.output = result;
      task.status = AnalysisTaskStatus.COMPLETED;
      task.updated = Date.now();
      
      // Notify the manager about the direct action
      await this.sendMessage({
        id: `msg-${uuidv4()}`,
        type: MessageType.NOTIFICATION,
        sender: this.id,
        recipients: [task.managedBy],
        content: {
          action: 'task_completed_by_supervisor',
          taskId: task.id,
          result: result
        },
        timestamp: Date.now()
      });
    } catch (error) {
      this.logger.error(`Error in direct action: ${error}`);
      
      // Mark task as failed
      task.status = AnalysisTaskStatus.FAILED;
      task.updated = Date.now();
    }
  }

  /**
   * Register a new manager agent
   */
  private async handleManagerRegistration(message: AgentMessage): Promise<void> {
    if (
      message.type === MessageType.NOTIFICATION &&
      message.content?.event === 'manager_registration'
    ) {
      const { managerId, expertise, capabilities } = message.content;
      
      this.logger.info(`Registering manager agent: ${managerId}`);
      
      this.managerRegistry.set(managerId, {
        managerId,
        expertise: expertise || [],
        managedAgents: [],
        performance: 0.8, // Initial performance score
        availability: true
      });
      
      // Confirm registration
      await this.sendMessage({
        id: `msg-${uuidv4()}`,
        type: MessageType.NOTIFICATION,
        sender: this.id,
        recipients: [managerId],
        content: {
          event: 'manager_registered',
          status: 'success'
        },
        timestamp: Date.now()
      });
    }
  }

  /**
   * Implement the backwards compatibility method required by ISupervisorAgent
   */
  async synthesizeTaskResults(taskIds: string[]): Promise<AgentOutput> {
    return this.synthesizeResults(taskIds);
  }

  /**
   * Implement the SynthesisFunction interface for ISupervisorAgent
   */
  async synthesizeResults(taskIds: string[]): Promise<AgentOutput>;
  async synthesizeResults(results: AgentResultCollection[]): Promise<FinalResult>;
  async synthesizeResults(
    input: string[] | AgentResultCollection[]
  ): Promise<AgentOutput | FinalResult> {
    // If input is a string array, call parent implementation
    if (typeof input[0] === 'string') {
      return super.synthesizeResults(input as string[]);
    }
    
    // Otherwise call our specialized implementation
    return this.synthesizeAgentResultCollections(input as AgentResultCollection[]);
  }

  /**
   * Implementation that takes collections and returns final result
   * Renamed for clarity to avoid method signature conflicts
   */
  private async synthesizeAgentResultCollections(
    results: AgentResultCollection[]
  ): Promise<FinalResult> {
    this.logger.info(`Synthesizing results from ${results.length} collections`);
    
    // Determine the meeting ID from results metadata or use a default
    let meetingId = 'unknown-meeting';
    
    // Try to find a meetingId in the results metadata
    for (const collection of results) {
      for (const result of collection.results) {
        if (result.metadata?.meetingId) {
          meetingId = result.metadata.meetingId;
          break;
        }
      }
      if (meetingId !== 'unknown-meeting') break;
    }
    
    // If not found, try to find it in task context
    if (meetingId === 'unknown-meeting') {
      // Look through our managed subtasks
      for (const collection of results) {
        const taskId = collection.taskId;
        const subTask = this.subTasks.get(taskId);
        if (subTask?.input?.meetingId) {
          meetingId = subTask.input.meetingId;
          break;
        }
      }
    }
    
    this.logger.info(`Using meetingId: ${meetingId} for result synthesis`);
    
    // Register intermediate results with the synthesis service
    for (const collection of results) {
      for (const result of collection.results) {
        const taskType = this.getTaskTypeFromResult(result);
        const quality = result.confidence === ConfidenceLevel.HIGH ? 0.9 :
                       result.confidence === ConfidenceLevel.MEDIUM ? 0.7 :
                       result.confidence === ConfidenceLevel.LOW ? 0.5 : 0.3;
        
        this.resultSynthesisService.registerTaskResult(
          meetingId,
          result.metadata?.taskId || `unknown-${uuidv4()}`,
          taskType,
          result.content,
          quality
        );
      }
    }
    
    // Get all task IDs from the results
    const taskIds = new Set<string>();
    for (const collection of results) {
      for (const result of collection.results) {
        if (result.metadata?.taskId) {
          taskIds.add(result.metadata.taskId);
        }
      }
    }
    
    // Progressive synthesis using the registered results
    const synthesisResult = await this.resultSynthesisService.progressiveSynthesis(
      meetingId,
      Array.from(taskIds),
      // Require at least results from 2 different components if we have multiple results
      taskIds.size > 1 ? 2 : 1
    );
    
    if (synthesisResult) {
      return synthesisResult;
    }
    
    // Fallback to direct synthesis if progressive approach fails
    return this.resultSynthesisService.synthesizeResults(
      {
        taskId: `synthesis-${uuidv4()}`,
        results: results.flatMap(collection => collection.results),
        metadata: {
          workerIds: results.flatMap(collection => 
            collection.results.map(result => 
              result.metadata?.taskId || `unknown-${uuidv4()}`
            )
          ),
          startTime: Date.now(),
          endTime: Date.now()
        }
      },
      meetingId
    );
  }

  /**
   * Extract task type from a result
   */
  private getTaskTypeFromResult(result: AgentOutput): string {
    // Try to determine result type from metadata
    if (result.metadata?.taskType) {
      return result.metadata.taskType;
    }
    
    // Try to infer from content structure
    const content = result.content;
    
    if (content.topics || content.themes) {
      return 'topic_analysis';
    } else if (content.actionItems || content.actions) {
      return 'action_items';
    } else if (content.decisions) {
      return 'decisions';
    } else if (content.sentiment || content.emotions) {
      return 'sentiment';
    } else if (content.participation || content.speakers) {
      return 'participation';
    } else if (content.summary) {
      return 'summary';
    }
    
    // Default
    return 'general_analysis';
  }

  /**
   * Create an enhanced hierarchical workflow
   */
  async createHierarchicalWorkflow(
    analysisGoal: AnalysisGoalType,
  ): Promise<{
    tasks: AnalysisTask[];
    managersNeeded: AgentExpertise[];
  }> {
    // Create the primary task
    const mainTask: AnalysisTask = {
      id: `task-${uuidv4()}`,
      type: analysisGoal,
      status: AnalysisTaskStatus.PENDING,
      input: {
        goal: analysisGoal,
        requiresHierarchical: true
      },
      priority: 1,
      created: Date.now(),
      updated: Date.now()
    };
    
    // Decompose the task
    const subTasks = await this.decomposeTask(mainTask);
    
    // Determine which managers are needed
    const managersNeeded: AgentExpertise[] = [];
    const uniqueExpertise = new Set<AgentExpertise>();
    
    for (const subTask of subTasks) {
      // Get required expertise for this task
      const expertise = this.getRequiredExpertiseForGoal(subTask.type);
      
      for (const exp of expertise) {
        uniqueExpertise.add(exp);
      }
    }
    
    uniqueExpertise.forEach(exp => managersNeeded.push(exp));
    
    // Convert subtasks back to regular tasks for backward compatibility
    const tasks: AnalysisTask[] = [
      mainTask,
      ...subTasks.map(subTask => ({
        id: subTask.id,
        type: subTask.type,
        status: subTask.status,
        assignedTo: undefined,
        input: {
          ...subTask.input,
          managedBy: subTask.managedBy
        },
        dependencies: [],
        priority: subTask.priority,
        created: subTask.created,
        updated: subTask.updated
      }))
    ];
    
    return {
      tasks,
      managersNeeded
    };
  }

  /**
   * Get required expertise for a goal type
   */
  private getRequiredExpertiseForGoal(goalType: AnalysisGoalType): AgentExpertise[] {
    switch (goalType) {
      case AnalysisGoalType.EXTRACT_TOPICS:
        return [AgentExpertise.TOPIC_ANALYSIS];
      case AnalysisGoalType.EXTRACT_ACTION_ITEMS:
        return [AgentExpertise.ACTION_ITEM_EXTRACTION];
      case AnalysisGoalType.EXTRACT_DECISIONS:
        return [AgentExpertise.DECISION_TRACKING];
      case AnalysisGoalType.ANALYZE_SENTIMENT:
        return [AgentExpertise.SENTIMENT_ANALYSIS];
      case AnalysisGoalType.ANALYZE_PARTICIPATION:
        return [AgentExpertise.PARTICIPANT_DYNAMICS];
      case AnalysisGoalType.GENERATE_SUMMARY:
        return [AgentExpertise.SUMMARY_GENERATION];
      case AnalysisGoalType.INTEGRATE_CONTEXT:
        return [AgentExpertise.CONTEXT_INTEGRATION];
      case AnalysisGoalType.FULL_ANALYSIS:
        return [
          AgentExpertise.TOPIC_ANALYSIS,
          AgentExpertise.ACTION_ITEM_EXTRACTION,
          AgentExpertise.SUMMARY_GENERATION
        ];
      default:
        return [AgentExpertise.TOPIC_ANALYSIS];
    }
  }

  /**
   * Enhanced system prompt for the supervisor
   */
  protected getDefaultSystemPrompt(): string {
    return `
      You are an Analysis Supervisor Agent, responsible for coordinating a hierarchical team 
      of agents to analyze meeting transcripts. Your responsibilities include:

      1. Breaking down complex analysis tasks into smaller subtasks
      2. Assigning tasks to appropriate manager agents
      3. Monitoring the progress of analysis tasks
      4. Resolving issues escalated by manager agents
      5. Synthesizing results from multiple analysis agents into coherent outputs

      As a supervisor, you should:
      - Think strategically about task allocation and team structure
      - Focus on high-level coordination rather than detailed analysis
      - Make decisions based on agent capabilities and current workloads
      - Ensure all required analysis goals are met with high quality
      - Resolve conflicts and ambiguities between different analyses
      
      Your team follows a hierarchy:
      - You (Supervisor) at the top level, coordinating the entire operation
      - Manager agents for each expertise area (topic analysis, action items, etc.)
      - Worker agents specializing in specific analysis tasks
      
      Maintain objectivity and focus on producing accurate, comprehensive meeting analyses.
    `;
  }

  private getPendingTasks(): any[] {
    return Array.from(this.subTasks.values())
      .filter(task => 
        task.status === 'pending' || 
        task.status === 'in_progress'
      );
  }

  private getHighestPriorityTask(tasks: any[]): any {
    if (tasks.length === 0) return null;
    
    // Sort by priority (lower number = higher priority)
    return [...tasks].sort((a, b) => 
      (a.priority || 10) - (b.priority || 10)
    )[0];
  }

  /**
   * Prepare context for routing decision
   * This creates a structured object with the information needed to decide routing
   */
  private prepareRoutingContext(messages: AgentMessage[]): any {
    // Filter task-related messages to understand progress
    const taskMessages = messages.filter(msg => 
      msg.type === MessageType.NOTIFICATION || 
      msg.type === MessageType.RESPONSE
    );
    
    // Extract task statuses
    const completedTasks = this.getPendingTasks().filter(task => task.status === 'completed');
    const pendingTasks = this.getPendingTasks();
    
    // Calculate overall progress approximation
    const progress = pendingTasks.length > 0 
      ? Math.floor((completedTasks.length / (completedTasks.length + pendingTasks.length)) * 100)
      : 0;
    
    // Determine current focus (if any)
    const currentFocus = pendingTasks.length > 0 ? pendingTasks[0].type : null;
    
    // Create context object
    return {
      completedTasks,
      pendingTasks,
      progress,
      currentFocus,
      messageCount: messages.length,
      lastMessage: messages.length > 0 ? messages[messages.length - 1] : null
    };
  }

  /**
   * Format routing context into a prompt string for the LLM
   */
  private formatRoutingPrompt(routingContext: any): string {
    // Format context into a prompt for the router tool
    const taskInfo = Array.isArray(routingContext.pendingTasks) 
      ? routingContext.pendingTasks.map((task: any) => 
          `- ${task.type || 'Unknown task'} (Priority: ${task.priority || 'unknown'})`
        ).join('\n')
      : 'No pending tasks';
    
    // Create prompt string for the LLM
    const promptText = `You are analyzing the current state of a meeting analysis process. 
    
Current analysis progress: ${routingContext.progress || 0}%
Current focus: ${routingContext.currentFocus || 'None'}

Pending tasks:
${taskInfo}

Based on the current state, determine which analysis team should work next.
Consider priorities, dependencies, and logical workflow progression.`;

    return promptText;
  }
} 