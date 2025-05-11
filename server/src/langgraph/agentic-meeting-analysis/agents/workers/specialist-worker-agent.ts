/**
 * Specialist Worker Agent for the Hierarchical Agentic Meeting Analysis System
 * 
 * This implementation provides a worker-level agent that operates under manager agents
 * and specializes in specific analysis tasks based on its expertise.
 */
import { v4 as uuidv4 } from 'uuid';
import {
  IMeetingAnalysisAgent,
  AgentExpertise,
  AgentRole,
  AnalysisGoalType,
  AnalysisTaskStatus,
  SubTask,
  AgentOutput,
  ConfidenceLevel,
  MessageType,
  AgentMessage,
} from '../../interfaces/agent.interface';
import { BaseMeetingAnalysisAgent, BaseMeetingAnalysisAgentConfig } from '../base-meeting-analysis-agent';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ChatOpenAI } from '@langchain/openai';
import { OpenAIConnector } from '../../../../connectors/openai-connector';

/**
 * Configuration options for SpecialistWorkerAgent
 */
export interface SpecialistWorkerAgentConfig {
  id?: string;
  name?: string;
  logger?: Logger;
  llm?: ChatOpenAI;
  systemPrompt?: string;
  expertise: AgentExpertise[];
  managerId: string;
  // Add these properties to match what's being used in the hierarchy factory
  capabilities?: AnalysisGoalType[];
  openAiConnector?: OpenAIConnector;
  useMockMode?: boolean;
  maxRetries?: number; 
}

/**
 * Specialized analysis prompt templates for different expertise areas
 */
const EXPERTISE_PROMPTS: Record<AgentExpertise, string> = {
  [AgentExpertise.TOPIC_ANALYSIS]: `
    Analyze the transcript to identify key topics, themes, and discussion points.
    Look for:
    1. Main subjects discussed
    2. Recurring themes or patterns
    3. Subtopics and their relationships
    4. Relative importance/emphasis of each topic
    
    Format your analysis with clear categorization and justification for each identified topic.
  `,
  [AgentExpertise.ACTION_ITEM_EXTRACTION]: `
    Extract all action items, tasks, and commitments from the transcript.
    For each action item, identify:
    1. The specific action to be taken
    2. Who is responsible (if specified)
    3. Any deadlines or timeframes mentioned
    4. Context or additional details about the action
    
    Format your extraction as a list of structured action items with all relevant details.
  `,
  [AgentExpertise.DECISION_TRACKING]: `
    Identify all decisions made during the meeting.
    For each decision, extract:
    1. The specific decision that was made
    2. Context leading to the decision
    3. Any alternatives that were considered
    4. Stakeholders involved in making the decision
    
    Present decisions in a clear, structured format with supporting context.
  `,
  [AgentExpertise.SENTIMENT_ANALYSIS]: `
    Analyze the emotional tone and sentiment throughout the meeting.
    Consider:
    1. Overall emotional tone
    2. Sentiment shifts during different topics
    3. Reactions to specific proposals or ideas
    4. Areas of agreement vs. contention
    
    Provide a nuanced analysis that captures the emotional dynamics of the conversation.
  `,
  [AgentExpertise.PARTICIPANT_DYNAMICS]: `
    Analyze the interaction patterns between meeting participants.
    Focus on:
    1. Speaking time distribution
    2. Who leads different parts of the discussion
    3. Collaboration vs. disagreement patterns
    4. Influence dynamics between participants
    
    Present your analysis with quantitative measures where possible and qualitative insights.
  `,
  [AgentExpertise.SUMMARY_GENERATION]: `
    Generate a comprehensive yet concise summary of the meeting.
    Include:
    1. Meeting purpose and objectives
    2. Key points discussed
    3. Major decisions and action items
    4. Next steps or follow-up plans
    
    Create a well-structured summary that captures all essential information in a readable format.
  `,
  [AgentExpertise.CONTEXT_INTEGRATION]: `
    Analyze how this meeting connects to broader organizational context.
    Consider:
    1. References to previous meetings or decisions
    2. Connections to ongoing projects or initiatives
    3. Organizational goals or strategies mentioned
    4. External factors influencing the discussion
    
    Provide insights that place this meeting in its proper organizational context.
  `,
  [AgentExpertise.COORDINATION]: `
    This expertise is for coordinator agents and not typically used by worker agents.
  `,
  [AgentExpertise.MANAGEMENT]: `
    This expertise is for manager agents and not typically used by worker agents.
  `,
};

/**
 * Specialist Worker Agent implementation
 * 
 * This agent is responsible for:
 * - Performing specialized analysis based on expertise
 * - Handling specific subtasks assigned by managers
 * - Producing high-quality outputs for single focus areas
 * - Requesting assistance when facing challenges
 * - Reporting analysis results back to managers
 */
export class SpecialistWorkerAgent
  extends BaseMeetingAnalysisAgent
  implements IMeetingAnalysisAgent {

  public readonly role = AgentRole.WORKER;
  private managerId: string;
  private primaryExpertise: AgentExpertise;
  private activeTask: SubTask | null = null;
  private analysisResults: Map<string, AgentOutput> = new Map();

  /**
   * Create a new Specialist Worker Agent
   */
  constructor(config: SpecialistWorkerAgentConfig) {
    // Ensure at least one expertise is provided
    if (!config.expertise || config.expertise.length === 0) {
      throw new Error('Worker agent must have at least one expertise area');
    }

    // Map expertise to appropriate goal types
    const goalTypes = config.capabilities || config.expertise.map(exp => {
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
    
    // Create the base agent configuration
    const baseConfig: BaseMeetingAnalysisAgentConfig = {
      id: config.id,
      name: config.name || `${config.expertise[0]} Specialist`,
      expertise: config.expertise,
      capabilities: goalTypes,
      logger: config.logger,
      llm: config.llm,
      systemPrompt: config.systemPrompt,
      openAiConnector: config.openAiConnector,
      useMockMode: config.useMockMode,
      maxRetries: config.maxRetries
    };
    
    // Initialize base agent
    super(baseConfig);

    this.managerId = config.managerId;
    this.primaryExpertise = config.expertise[0];
    
    this.logger.info(
      `Initialized ${this.name} specializing in: ${config.expertise.join(', ')}`,
    );
  }

  /**
   * Initialize the worker agent
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);

    // Register with manager
    await this.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.NOTIFICATION,
      sender: this.id,
      recipients: [this.managerId],
      content: {
        event: 'worker_registration',
        workerId: this.id,
        expertise: this.expertise,
        capabilities: Array.from(this.capabilities)
      },
      timestamp: Date.now()
    });

    // Set up message handlers
    this.on('request', this.handleRequest.bind(this));
    
    this.logger.info(`${this.name} initialized and registered with manager`);
  }

  /**
   * Handle requests from manager
   */
  private async handleRequest(message: AgentMessage): Promise<void> {
    // Process requests based on content
    const { requestType } = message.content;
    
    switch (requestType) {
      case 'task_execution':
        // Manager is assigning a task
        await this.handleTaskAssignment(message);
        break;
        
      case 'worker_info':
        // Request for worker information
        await this.sendWorkerInfo(message.sender);
        break;
        
      default:
        this.logger.warn(`Unknown request type: ${requestType}`);
        break;
    }
  }

  /**
   * Handle task assignment from manager
   */
  private async handleTaskAssignment(message: AgentMessage): Promise<void> {
    const { taskId, workerTaskId, task } = message.content;
    
    if (!task) {
      this.logger.warn('Received task assignment without task data');
      return;
    }
    
    this.logger.info(`Received task assignment: ${workerTaskId || taskId}`);
    
    // Store task for processing
    this.activeTask = task;
    
    // Execute the task
    try {
      const result = await this.executeTask(task);
      
      // Store result
      this.analysisResults.set(task.id, result);
      
      // Send result back to manager
      await this.sendMessage({
        id: `msg-${uuidv4()}`,
        type: MessageType.RESPONSE,
        sender: this.id,
        recipients: [this.managerId],
        content: {
          requestType: 'task_execution',
          taskId,
          workerTaskId: workerTaskId || task.id,
          result: {
            ...result,
            metadata: {
              ...result.metadata,
              workerId: this.id,
              workerExpertise: this.primaryExpertise
            }
          }
        },
        timestamp: Date.now()
      });
      
      // Clear active task
      this.activeTask = null;
    } catch (error) {
      this.logger.error(`Error executing task: ${error}`);
      
      // Request assistance
      await this.requestAssistance(
        taskId, 
        `Error executing task: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Execute a specific task based on expertise
   */
  private async executeTask(task: SubTask): Promise<AgentOutput> {
    this.logger.info(`Executing task ${task.id} of type ${task.type}`);
    
    // Get transcript or content to analyze
    const content = this.extractAnalysisContent(task);
    
    if (!content) {
      throw new Error('No content provided for analysis');
    }
    
    // Determine expertise to use for this task
    const expertiseToUse = this.determineTaskExpertise(task);
    
    // Get specialized prompt for this expertise
    const specializedPrompt = EXPERTISE_PROMPTS[expertiseToUse];
    
    // Create analysis prompt
    const analysisPrompt = `
      You are a specialist in ${expertiseToUse.replace('_', ' ')}.
      
      ${specializedPrompt}
      
      Additional instructions: ${task.input.workerInstructions || 'Perform a thorough analysis.'}
      Focus area: ${task.input.workerFocus || 'General analysis within your expertise.'}
      
      CONTENT TO ANALYZE:
      ${content}
      
      Provide your analysis in a structured JSON format with:
      {
        "analysis": (your main analysis content, appropriately structured for your expertise),
        "confidence": "high" | "medium" | "low" | "uncertain",
        "reasoning": (brief explanation of your approach and key findings)
      }
    `;
    
    // Perform analysis
    const response = await this.callLLM('Execute specialized analysis', analysisPrompt);
    
    try {
      const analysis = JSON.parse(response);
      
      return {
        content: analysis.analysis,
        confidence: analysis.confidence as ConfidenceLevel,
        reasoning: analysis.reasoning,
        metadata: {
          taskId: task.id,
          taskType: task.type,
          expertiseUsed: expertiseToUse,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error(`Error parsing analysis result: ${error}`);
      
      // Create a simple non-JSON result
      return {
        content: {
          rawAnalysis: response,
          note: 'Failed to parse as JSON, returning raw analysis'
        },
        confidence: ConfidenceLevel.LOW,
        reasoning: 'Analysis completed but structured formatting failed',
        metadata: {
          error: String(error),
          taskId: task.id,
          expertiseUsed: expertiseToUse
        },
        timestamp: Date.now()
      };
    }
  }

  /**
   * Extract content to analyze from task input
   */
  private extractAnalysisContent(task: SubTask): string | null {
    // Try different possible content sources in task input
    if (task.input.transcript) {
      return task.input.transcript;
    } else if (task.input.content) {
      return task.input.content;
    } else if (task.input.text) {
      return task.input.text;
    } else if (task.input.data && typeof task.input.data === 'string') {
      return task.input.data;
    } else if (task.input.segments && Array.isArray(task.input.segments)) {
      // Join segments if provided as array
      return task.input.segments.join('\n\n');
    }
    
    // If no content found in standard fields, return the entire input as JSON
    return JSON.stringify(task.input, null, 2);
  }

  /**
   * Determine which expertise to use for this task
   */
  private determineTaskExpertise(task: SubTask): AgentExpertise {
    // If task specifies a required expertise, check if we have it
    if (
      task.input.requiredExpertise && 
      this.expertise.includes(task.input.requiredExpertise as AgentExpertise)
    ) {
      return task.input.requiredExpertise as AgentExpertise;
    }
    
    // Map task type to corresponding expertise if we have it
    const mappedExpertise = this.mapTaskTypeToExpertise(task.type);
    if (this.expertise.includes(mappedExpertise)) {
      return mappedExpertise;
    }
    
    // Fallback to primary expertise
    return this.primaryExpertise;
  }

  /**
   * Map task type to most relevant expertise
   */
  private mapTaskTypeToExpertise(taskType: AnalysisGoalType): AgentExpertise {
    switch (taskType) {
      case AnalysisGoalType.EXTRACT_TOPICS:
        return AgentExpertise.TOPIC_ANALYSIS;
      case AnalysisGoalType.EXTRACT_ACTION_ITEMS:
        return AgentExpertise.ACTION_ITEM_EXTRACTION;
      case AnalysisGoalType.EXTRACT_DECISIONS:
        return AgentExpertise.DECISION_TRACKING;
      case AnalysisGoalType.ANALYZE_SENTIMENT:
        return AgentExpertise.SENTIMENT_ANALYSIS;
      case AnalysisGoalType.ANALYZE_PARTICIPATION:
        return AgentExpertise.PARTICIPANT_DYNAMICS;
      case AnalysisGoalType.GENERATE_SUMMARY:
        return AgentExpertise.SUMMARY_GENERATION;
      case AnalysisGoalType.INTEGRATE_CONTEXT:
        return AgentExpertise.CONTEXT_INTEGRATION;
      default:
        return this.primaryExpertise;
    }
  }

  /**
   * Send worker information to requester
   */
  private async sendWorkerInfo(requesterId: string): Promise<void> {
    await this.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.RESPONSE,
      sender: this.id,
      recipients: [requesterId],
      content: {
        requestType: 'worker_info',
        workerId: this.id,
        expertise: this.expertise,
        primaryExpertise: this.primaryExpertise,
        capabilities: Array.from(this.capabilities),
        busy: this.activeTask !== null,
        status: this.activeTask ? 'working' : 'available'
      },
      timestamp: Date.now()
    });
  }

  /**
   * Request assistance from manager
   */
  async requestAssistance(taskId: string, issue: string): Promise<void> {
    this.logger.info(`Requesting assistance for task ${taskId}: ${issue}`);
    
    await this.sendMessage({
      id: `msg-${uuidv4()}`,
      type: MessageType.REQUEST,
      sender: this.id,
      recipients: [this.managerId],
      content: {
        requestType: 'assistance_request',
        taskId,
        issue,
        context: {
          activeTask: this.activeTask,
          workerId: this.id,
          expertise: this.primaryExpertise
        }
      },
      timestamp: Date.now()
    });
  }

  /**
   * Analyze a transcript segment (part of IMeetingAnalysisAgent interface)
   */
  async analyzeTranscriptSegment(
    segment: string,
    context?: any
  ): Promise<AgentOutput> {
    // Create a temporary task for this analysis
    const tempTask: SubTask = {
      id: `temp-task-${uuidv4()}`,
      parentTaskId: context?.parentTaskId || `parent-${uuidv4()}`,
      type: this.mapExpertiseToGoalType(this.primaryExpertise),
      status: AnalysisTaskStatus.IN_PROGRESS,
      managedBy: this.managerId,
      input: {
        transcript: segment,
        context
      },
      priority: 3,
      created: Date.now(),
      updated: Date.now()
    };
    
    // Execute the temporary task
    return this.executeTask(tempTask);
  }

  /**
   * Map expertise to goal type
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
   * Merge multiple analyses into one (part of IMeetingAnalysisAgent interface)
   */
  async mergeAnalyses(analyses: AgentOutput[]): Promise<AgentOutput> {
    // Simple implementation to merge analyses
    if (analyses.length === 0) {
      return {
        content: {},
        confidence: ConfidenceLevel.UNCERTAIN,
        timestamp: Date.now()
      };
    }
    
    if (analyses.length === 1) {
      return analyses[0];
    }
    
    // Get expertise name, handling undefined case
    const expertiseName = this.primaryExpertise 
      ? this.primaryExpertise.replace(/_/g, ' ') 
      : 'meeting analysis';
    
    // Create a merge prompt
    const mergePrompt = `
      You are a specialist in ${expertiseName}.
      
      You need to merge multiple analysis results into a single coherent output.
      
      Analysis results:
      ${analyses.map((a, i) => `
        ANALYSIS ${i+1}:
        ${JSON.stringify(a.content, null, 2)}
      `).join('\n')}
      
      Merge these analyses by:
      1. Combining non-overlapping information
      2. Resolving conflicts when present
      3. Organizing information logically
      4. Maintaining the structured format appropriate for ${expertiseName}
      
      Return your merged analysis in a structured JSON format.
    `;
    
    const response = await this.callLLM('Merge analyses', mergePrompt);
    
    try {
      const merged = JSON.parse(response);
      
      return {
        content: merged,
        confidence: this.calculateMergedConfidence(analyses),
        reasoning: 'Merged from multiple analysis results',
        metadata: {
          sourceCount: analyses.length,
          mergedBy: this.id,
          timestamp: Date.now()
        },
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error(`Error parsing merged analysis: ${error}`);
      
      // Fallback to combining content from all analyses
      return {
        content: {
          rawContent: analyses.map(a => a.content),
          mergeError: String(error)
        },
        confidence: ConfidenceLevel.LOW,
        reasoning: 'Failed to properly merge analyses due to parsing error',
        metadata: {
          sourceCount: analyses.length,
          mergeError: String(error)
        },
        timestamp: Date.now()
      };
    }
  }

  /**
   * Calculate confidence level for merged analyses
   */
  private calculateMergedConfidence(analyses: AgentOutput[]): ConfidenceLevel {
    // Count confidence levels
    const confidenceCounts = {
      [ConfidenceLevel.HIGH]: 0,
      [ConfidenceLevel.MEDIUM]: 0,
      [ConfidenceLevel.LOW]: 0,
      [ConfidenceLevel.UNCERTAIN]: 0
    };
    
    for (const analysis of analyses) {
      confidenceCounts[analysis.confidence]++;
    }
    
    // Determine the final confidence level based on the distribution
    if (confidenceCounts[ConfidenceLevel.HIGH] > analyses.length / 2) {
      return ConfidenceLevel.HIGH;
    } else if (confidenceCounts[ConfidenceLevel.UNCERTAIN] > analyses.length / 4) {
      return ConfidenceLevel.UNCERTAIN;
    } else if (confidenceCounts[ConfidenceLevel.LOW] > analyses.length / 2) {
      return ConfidenceLevel.LOW;
    } else {
      return ConfidenceLevel.MEDIUM;
    }
  }

  /**
   * Prioritize information in output (part of IMeetingAnalysisAgent interface)
   */
  async prioritizeInformation(output: any): Promise<any> {
    // Get expertise name, handling undefined case
    const expertiseName = this.primaryExpertise 
      ? this.primaryExpertise.replace(/_/g, ' ') 
      : 'meeting analysis';
    
    // Create a prioritization prompt
    const prioritizePrompt = `
      You are a specialist in ${expertiseName}.
      
      Prioritize and reorganize the following analysis output to highlight the most important information first:
      
      ${JSON.stringify(output, null, 2)}
      
      Focus on:
      1. Identifying the most critical or impactful elements
      2. Organizing information from most to least important
      3. Maintaining the original content but restructuring for priority
      4. Preserving the structured format appropriate for ${expertiseName}
      
      Return the prioritized output in a structured JSON format.
    `;
    
    const response = await this.callLLM('Prioritize information', prioritizePrompt);
    
    try {
      return JSON.parse(response);
    } catch (error) {
      this.logger.error(`Error parsing prioritized output: ${error}`);
      return output; // Return original output if prioritization fails
    }
  }

  /**
   * Enhanced system prompt for the worker
   */
  protected getDefaultSystemPrompt(): string {
    // Get expertise name, handling undefined case
    const expertiseName = this.primaryExpertise 
      ? this.primaryExpertise.replace(/_/g, ' ') 
      : 'meeting analysis';
    
    return `
      You are a Specialist Worker Agent in ${expertiseName}.
      
      Your primary responsibilities are:
      1. Analyzing meeting transcripts with focus on your area of expertise
      2. Producing high-quality, structured output for your manager
      3. Maintaining objectivity and accuracy in your analysis
      4. Requesting help when you encounter challenges
      
      You are part of a hierarchical team structure:
      - Supervisor agent at the top level
      - Manager agents coordinating different expertise areas
      - You, as a worker agent specializing in ${expertiseName}
      
      Focus on producing detailed, accurate analysis within your specific domain of expertise.
      Always structure your output appropriately for easy integration with other analyses.
    `;
  }
} 