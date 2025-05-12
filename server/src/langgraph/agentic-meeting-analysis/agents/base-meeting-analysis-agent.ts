/**
 * Base agent implementation for the Agentic Meeting Analysis System
 */
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  IMeetingAnalysisAgent,
  AgentExpertise,
  AnalysisGoalType,
  AnalysisTask,
  AgentOutput,
  ConfidenceLevel,
  AgentMessage,
  MessageType,
  AgentRole,
} from '../interfaces/agent.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { ChatOpenAI } from '@langchain/openai';
import {
  BaseMessage,
  SystemMessage,
  HumanMessage,
  AIMessage,
} from '@langchain/core/messages';
import { OpenAIConnector, OpenAIModelConfig } from '../../../connectors/openai-connector';
import { MessageConfig } from '../../../connectors/language-model-provider.interface';
import { MeetingRAGService } from '../services/meeting-rag.service';

/**
 * Token usage tracking interface
 */
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
  lastUpdated: number;
}

/**
 * Configuration options for BaseMeetingAnalysisAgent
 */
export interface BaseMeetingAnalysisAgentConfig {
  id?: string;
  name: string;
  expertise: AgentExpertise[];
  capabilities: AnalysisGoalType[];
  logger?: Logger;
  llm?: ChatOpenAI;
  systemPrompt?: string;
  openAiConnector?: OpenAIConnector;
  maxRetries?: number;
  useMockMode?: boolean;
}

/**
 * Base implementation of a meeting analysis agent
 */
export class BaseMeetingAnalysisAgent
  extends EventEmitter
  implements IMeetingAnalysisAgent
{
  // Core agent properties
  public id: string;
  public name: string;
  public expertise: AgentExpertise[];
  public capabilities: Set<AnalysisGoalType>;
  public role: AgentRole = AgentRole.WORKER; // Default role is worker

  // Services and utilities
  protected logger: Logger;
  protected llm: ChatOpenAI;
  protected openAiConnector: OpenAIConnector;
  protected systemPrompt: string;
  protected messageHistory: AgentMessage[] = [];
  protected memoryCache: Map<string, any> = new Map();
  protected memorySubscriptions: Map<string, ((value: any) => void)[]> =
    new Map();
  protected tokenUsage: TokenUsage;
  protected maxRetries: number;
  protected useMockMode: boolean;

  // Add MeetingRAGService support
  protected meetingRagService?: MeetingRAGService;

  /**
   * Create a new meeting analysis agent
   */
  constructor(config: BaseMeetingAnalysisAgentConfig) {
    super();

    this.id = config.id || `agent-${uuidv4()}`;
    this.name = config.name;
    this.expertise = config.expertise;
    this.capabilities = new Set(config.capabilities);

    this.logger = config.logger || new ConsoleLogger();
    this.maxRetries = config.maxRetries || 3;
    
    // Determine if we should use mock mode
    this.useMockMode = config.useMockMode ?? 
      ((process.env.USE_MOCK_IMPLEMENTATIONS === 'true') ||
      (process.env.NODE_ENV === 'test'));

    // Initialize token usage tracking
    this.tokenUsage = {
      prompt: 0,
      completion: 0,
      total: 0,
      lastUpdated: Date.now()
    };

    // Initialize OpenAI connector or use provided one
    if (this.useMockMode) {
      this.logger.info(`Agent ${this.name} is running in mock mode - LLM calls will be simulated`);
      // We'll still initialize the OpenAI connector but won't use it in mock mode
    }
    
    this.openAiConnector = config.openAiConnector || new OpenAIConnector({
      logger: this.logger,
      modelConfig: {
        model: process.env.OPENAI_MODEL_NAME || 'gpt-4o',
        temperature: 0.2,
        maxTokens: 4000
      }
    });

    // For backward compatibility, still initialize the LLM property
    this.llm = config.llm || new ChatOpenAI({
      modelName: process.env.OPENAI_MODEL_NAME || 'gpt-4o',
      temperature: 0.2,
    });

    this.systemPrompt = config.systemPrompt || this.getDefaultSystemPrompt();

    this.logger.info(`Initialized ${this.name} agent with ID: ${this.id}`);
  }

  /**
   * Initialize the agent
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    try {
      this.logger.info(`Initializing ${this.name} agent...`);

      // Additional initialization can be implemented in subclasses

      this.logger.info(`Successfully initialized ${this.name} agent`);
    } catch (error) {
      this.logger.error(
        `Error initializing ${this.name} agent: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Process a task assigned to this agent
   */
  async processTask(task: AnalysisTask): Promise<AgentOutput> {
    try {
      this.logger.info(
        `Agent ${this.name} processing task: ${task.id} (${task.type})`,
      );

      // Validation
      if (!this.capabilities.has(task.type)) {
        throw new Error(
          `Agent ${this.name} does not have capability to handle task type: ${task.type}`,
        );
      }

      // This is a base implementation that should be overridden by specialized agents
      const response = await this.callLLM(
        `Process the following ${task.type} task for meeting analysis:`,
        JSON.stringify(task.input, null, 2),
      );

      // Generate output with confidence assessment
      const content = this.parseAgentResponse(response);
      const confidence = await this.assessConfidence(content);
      const reasoning = await this.explainReasoning(content);

      const output: AgentOutput = {
        content,
        confidence,
        reasoning,
        metadata: {
          taskId: task.id,
          taskType: task.type,
          agentId: this.id,
          agentName: this.name,
          expertise: this.expertise,
        },
        timestamp: Date.now(),
      };

      this.logger.info(
        `Agent ${this.name} completed task ${task.id} with confidence: ${confidence}`,
      );

      return output;
    } catch (error) {
      this.logger.error(
        `Error processing task ${task.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Send a message to other agents
   */
  async sendMessage(message: AgentMessage): Promise<void> {
    try {
      this.logger.debug(`Agent ${this.name} sending message: ${message.id}`);

      // Store in message history
      this.messageHistory.push(message);

      // Emit an event for the message bus to pick up
      this.emit('message', message);

      this.logger.debug(`Message ${message.id} sent successfully`);
    } catch (error) {
      this.logger.error(
        `Error sending message: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Receive a message from other agents
   */
  async receiveMessage(message: AgentMessage): Promise<void> {
    try {
      this.logger.debug(
        `Agent ${this.name} received message: ${message.id} from ${message.sender}`,
      );

      // Store in message history
      this.messageHistory.push(message);

      // Process the message based on type
      switch (message.type) {
        case MessageType.REQUEST:
          // Handle request - should be implemented by subclasses
          this.emit('request', message);
          break;

        case MessageType.RESPONSE:
          // Handle response - should be implemented by subclasses
          this.emit('response', message);
          break;

        case MessageType.NOTIFICATION:
          // Handle notification - should be implemented by subclasses
          this.emit('notification', message);
          break;

        case MessageType.UPDATE:
          // Handle update - should be implemented by subclasses
          this.emit('update', message);
          break;

        case MessageType.QUERY:
          // Handle query - should be implemented by subclasses
          this.emit('query', message);
          break;

        default:
          this.logger.warn(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      this.logger.error(
        `Error receiving message: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Read from shared memory
   */
  async readMemory(key: string, namespace: string = 'default'): Promise<any> {
    const fullKey = `${namespace}:${key}`;

    // First check local cache
    if (this.memoryCache.has(fullKey)) {
      return this.memoryCache.get(fullKey);
    }

    // This should be implemented to use a shared memory service
    this.logger.warn(
      'Memory service not implemented - using local memory cache only',
    );
    return null;
  }

  /**
   * Write to shared memory
   */
  async writeMemory(
    key: string,
    value: any,
    namespace: string = 'default',
  ): Promise<void> {
    const fullKey = `${namespace}:${key}`;

    // Update local cache
    this.memoryCache.set(fullKey, value);

    // Notify subscribers
    if (this.memorySubscriptions.has(fullKey)) {
      const callbacks = this.memorySubscriptions.get(fullKey) || [];
      for (const callback of callbacks) {
        try {
          callback(value);
        } catch (error) {
          this.logger.error(
            `Error in memory subscription callback: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    // This should be implemented to use a shared memory service
    this.logger.warn(
      'Memory service not implemented - using local memory cache only',
    );
  }

  /**
   * Subscribe to memory changes
   */
  subscribeToMemory(
    key: string,
    callback: (value: any) => void,
    namespace: string = 'default',
  ): void {
    const fullKey = `${namespace}:${key}`;

    if (!this.memorySubscriptions.has(fullKey)) {
      this.memorySubscriptions.set(fullKey, []);
    }

    const callbacks = this.memorySubscriptions.get(fullKey) || [];
    callbacks.push(callback);
    this.memorySubscriptions.set(fullKey, callbacks);
  }

  /**
   * Request assistance from another agent
   */
  async requestAssistance(
    taskId: string,
    requestedExpertise: AgentExpertise,
  ): Promise<void> {
    const message: AgentMessage = {
      id: `assist-req-${uuidv4()}`,
      type: MessageType.REQUEST,
      sender: this.id,
      recipients: 'broadcast', // This will be filtered by expertise by the communication service
      content: {
        taskId,
        requestedExpertise,
        message: `Agent ${this.name} requests assistance with expertise in ${requestedExpertise} for task ${taskId}`,
      },
      timestamp: Date.now(),
    };

    await this.sendMessage(message);
  }

  /**
   * Provide assistance to another agent
   */
  async provideAssistance(
    taskId: string,
    contribution: AgentOutput,
  ): Promise<void> {
    const message: AgentMessage = {
      id: `assist-resp-${uuidv4()}`,
      type: MessageType.RESPONSE,
      sender: this.id,
      recipients: ['coordinator'], // The coordinator should route this appropriately
      content: {
        taskId,
        expertise: this.expertise,
        contribution,
      },
      timestamp: Date.now(),
    };

    await this.sendMessage(message);
  }

  /**
   * Assess confidence in an output
   */
  async assessConfidence(output: any): Promise<ConfidenceLevel> {
    try {
      // Simple implementation - should be overridden by subclasses for more sophisticated assessment

      const response = await this.callLLM(
        `Assess your confidence in the following output. Respond with ONLY one of these confidence levels: "${ConfidenceLevel.HIGH}", "${ConfidenceLevel.MEDIUM}", "${ConfidenceLevel.LOW}", or "${ConfidenceLevel.UNCERTAIN}".`,
        JSON.stringify(output, null, 2),
      );

      const confidenceText = response.trim().toUpperCase();

      if (confidenceText.includes(ConfidenceLevel.HIGH.toUpperCase())) {
        return ConfidenceLevel.HIGH;
      } else if (
        confidenceText.includes(ConfidenceLevel.MEDIUM.toUpperCase())
      ) {
        return ConfidenceLevel.MEDIUM;
      } else if (confidenceText.includes(ConfidenceLevel.LOW.toUpperCase())) {
        return ConfidenceLevel.LOW;
      } else {
        return ConfidenceLevel.UNCERTAIN;
      }
    } catch (error) {
      this.logger.error(
        `Error assessing confidence: ${error instanceof Error ? error.message : String(error)}`,
      );
      return ConfidenceLevel.UNCERTAIN;
    }
  }

  /**
   * Explain reasoning for an output
   */
  async explainReasoning(output: any): Promise<string> {
    try {
      const response = await this.callLLM(
        `Explain your reasoning for the following output in a concise paragraph:`,
        JSON.stringify(output, null, 2),
      );

      return response.trim();
    } catch (error) {
      this.logger.error(
        `Error explaining reasoning: ${error instanceof Error ? error.message : String(error)}`,
      );
      return 'Unable to explain reasoning due to an error.';
    }
  }

  /**
   * Create a standard format agent message
   */
  protected createMessage(
    type: MessageType,
    recipients: string[] | 'broadcast',
    content: any,
    replyTo?: string,
  ): AgentMessage {
    return {
      id: `msg-${uuidv4()}`,
      type,
      sender: this.id,
      recipients,
      content,
      replyTo,
      timestamp: Date.now(),
    };
  }

  /**
   * Call the LLM with retry logic and proper error handling
   */
  protected async callLLM(
    instruction: string,
    content: string,
  ): Promise<string> {
    if (this.useMockMode) {
      return this.mockLLMResponse(instruction, content);
    }
    
    const messages: MessageConfig[] = [
      { role: 'system', content: `${this.systemPrompt}\n\n${instruction}` },
      { role: 'user', content }
    ];
    
    let attempts = 0;
    let lastError: Error | null = null;
    
    while (attempts < this.maxRetries) {
      try {
        this.logger.debug(`LLM call attempt ${attempts + 1}/${this.maxRetries} for agent ${this.name}`);
        
        const startTime = Date.now();
        
        // Use the OpenAIConnector for real API calls
        const response = await this.openAiConnector.generateChatCompletion(
          messages,
          {
            // Ensure we use JSON output when appropriate
            responseFormat: this.shouldUseJsonResponse(instruction) 
              ? { type: 'json_object' } 
              : undefined
          }
        );
        
        const endTime = Date.now();
        
        // Log completion statistics
        this.logger.info(`LLM call completed for ${this.name} in ${endTime - startTime}ms`, {
          agent: this.id,
          expertiseArea: this.expertise[0],
          responseLength: response.length,
          instructionLength: instruction.length,
          contentLength: content.length,
          elapsed: endTime - startTime
        });
        
        return response;
      } catch (error) {
        attempts++;
        lastError = error instanceof Error ? error : new Error(String(error));
        
        // Check if this is a rate limit error
        const isRateLimitError = this.isRateLimitError(lastError);
        
        this.logger.warn(`LLM call failed (attempt ${attempts}/${this.maxRetries})`, { 
          error: lastError.message,
          agent: this.name,
          isRateLimitError
        });
        
        if (attempts < this.maxRetries) {
          // Exponential backoff with jitter
          const baseBackoff = 1000 * Math.pow(2, attempts - 1);
          const jitter = Math.random() * 1000;
          const backoffMs = isRateLimitError 
            ? Math.max(baseBackoff * 2, 5000) + jitter // Longer backoff for rate limits
            : baseBackoff + jitter;
            
          this.logger.info(`Retrying in ${Math.round(backoffMs)}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        }
      }
    }
    
    // If we've exhausted all retries, log a detailed error and throw
    this.logger.error(`LLM call permanently failed after ${this.maxRetries} attempts`, {
      agent: this.id,
      name: this.name,
      expertise: this.expertise,
      error: lastError?.message || 'Unknown error',
      instruction: instruction.substring(0, 100) + '...'
    });
    
    throw lastError || new Error('Failed to call LLM after multiple attempts');
  }
  
  /**
   * Determine if we should use JSON response format
   */
  private shouldUseJsonResponse(instruction: string): boolean {
    const jsonIndicators = [
      'JSON',
      'json format',
      'structured format',
      'return JSON',
      'respond with JSON',
      'in JSON'
    ];
    
    return jsonIndicators.some(indicator => 
      instruction.toLowerCase().includes(indicator.toLowerCase())
    );
  }
  
  /**
   * Check if an error is a rate limit error
   */
  private isRateLimitError(error: Error): boolean {
    if (!error) return false;
    
    const errorMsg = error.message.toLowerCase();
    return errorMsg.includes('rate limit') || 
           errorMsg.includes('ratelimit') || 
           errorMsg.includes('too many requests') ||
           errorMsg.includes('quota') ||
           errorMsg.includes('capacity') ||
           errorMsg.includes('429');
  }
  
  /**
   * Generate a mock LLM response for testing purposes
   */
  protected mockLLMResponse(instruction: string, content: string): string {
    this.logger.info(`[MOCK] Generating mock response for ${this.name}`);
    
    // Use a switch to generate different mock responses based on agent expertise
    const primaryExpertise = this.expertise[0];
    
    switch(primaryExpertise) {
      case AgentExpertise.TOPIC_ANALYSIS:
        return JSON.stringify({
          topics: [
            { name: "Product Roadmap", relevance: 0.9, keywords: ["mobile", "API", "Q3"] },
            { name: "Resource Allocation", relevance: 0.8, keywords: ["timeline", "priorities"] },
            { name: "Customer Communication", relevance: 0.7, keywords: ["announcement", "focus"] }
          ]
        });
        
      case AgentExpertise.ACTION_ITEM_EXTRACTION:
        return JSON.stringify({
          actionItems: [
            { description: "Prepare mobile implementation plan", assignees: ["Jane"], dueDate: "next week" },
            { description: "Coordinate with UX team", assignees: ["Tom"], dueDate: "this week" },
            { description: "Draft customer announcement", assignees: ["Tom"], dueDate: "next week" },
            { description: "Schedule pricing discussion", assignees: ["Sarah"], dueDate: "end of month" }
          ]
        });
        
      case AgentExpertise.SUMMARY_GENERATION:
        return `The meeting focused on Q3 product roadmap planning. The team decided to prioritize mobile improvements over API upgrades based on user feedback and competitive analysis. Jane will prepare an implementation plan with UX team support coordinated by Tom. Sarah will schedule a separate meeting to discuss pricing model changes.`;
        
      // Add more cases for other agent types
        
      default:
        return `Mock response for ${this.name} with expertise in ${primaryExpertise}. This is a simulated response for testing purposes.`;
    }
  }
  
  /**
   * Get agent token usage statistics
   */
  getTokenUsage(): TokenUsage {
    return { ...this.tokenUsage };
  }
  
  /**
   * Reset token usage statistics
   */
  resetTokenUsage(): void {
    this.tokenUsage = {
      prompt: 0,
      completion: 0,
      total: 0,
      lastUpdated: Date.now()
    };
  }

  /**
   * Parse response from LLM
   */
  protected parseAgentResponse(response: string): any {
    try {
      // Try to parse as JSON if it looks like JSON
      if (response.trim().startsWith('{') && response.trim().endsWith('}')) {
        return JSON.parse(response);
      }

      // Otherwise return as string
      return response;
    } catch (error) {
      // If parsing fails, return the raw string
      return response;
    }
  }

  /**
   * Get default system prompt
   */
  protected getDefaultSystemPrompt(): string {
    return `You are ${this.name}, an AI agent specialized in ${this.expertise.join(', ')} for meeting analysis.
Your job is to analyze meeting transcripts and provide valuable insights.
You should be thorough, objective, and focus on extracting the most important information.
Always provide your confidence level in your analysis.

Your capabilities include:
${Array.from(this.capabilities)
  .map((capability) => `- ${capability.replace('_', ' ')}`)
  .join('\n')}

Respond in clear, structured formats as requested.`;
  }

  /**
   * Set the MeetingRAGService for this agent
   * This allows the agent to leverage vector search capabilities
   */
  public setMeetingRagService(ragService: MeetingRAGService): void {
    this.meetingRagService = ragService;
    this.logger.info(`RAG service set for agent ${this.id}`);
  }

  /**
   * Check if this agent has RAG capabilities
   */
  public hasRagCapabilities(): boolean {
    return !!this.meetingRagService;
  }

  /**
   * Get relevant context from the transcript using RAG
   * 
   * @param query The query for retrieving relevant content
   * @param meetingId The meeting ID
   * @param maxResults Maximum number of results to retrieve
   * @returns An array of relevant content chunks
   */
  protected async retrieveRelevantContext(
    query: string,
    meetingId: string,
    maxResults: number = 5
  ): Promise<any[]> {
    if (!this.meetingRagService) {
      this.logger.warn('RAG service not available for context retrieval', {
        agentId: this.id,
        query: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
      });
      return [];
    }

    try {
      const startTime = Date.now();
      const results = await this.meetingRagService.retrieveRelevantChunks(
        query,
        meetingId
      );

      // Apply maxResults filter after receiving results
      const limitedResults = results.slice(0, maxResults);

      const duration = Date.now() - startTime;
      this.logger.info('Retrieved relevant context using RAG', {
        agentId: this.id,
        query: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
        resultCount: limitedResults.length,
        topScore: limitedResults.length > 0 ? limitedResults[0].score.toFixed(2) : 'N/A',
        durationMs: duration
      });

      return limitedResults;
    } catch (error) {
      this.logger.error('Error retrieving relevant context', {
        agentId: this.id,
        query: query.substring(0, 50) + (query.length > 50 ? '...' : ''),
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Create an enhanced prompt with relevant context from RAG
   * 
   * @param task The current task
   * @param transcript The meeting transcript
   * @param query The query for context retrieval
   * @returns An enhanced prompt with RAG-retrieved context
   */
  protected async createRagEnhancedPrompt(
    task: any, // Fix: Use 'any' type for now since we don't know exact AnalysisTask structure
    transcript: string,
    query: string
  ): Promise<string> {
    // Base prompt without RAG enhancement
    let prompt = `Analyze the following meeting transcript:\n\n`;
    
    // Add RAG-retrieved context if available
    if (this.meetingRagService) {
      // Fix: Use task.id for meetingId if available, or fall back to a default
      const meetingId = task.meetingId || task.id || 'unknown-meeting';
      
      const relevantChunks = await this.retrieveRelevantContext(
        query,
        meetingId,
        5  // Get top 5 relevant chunks
      );
      
      if (relevantChunks.length > 0) {
        prompt += "Based on the most relevant parts of the transcript:\n\n";
        
        for (let i = 0; i < relevantChunks.length; i++) {
          const chunk = relevantChunks[i];
          prompt += `EXCERPT ${i+1} (Relevance: ${chunk.score.toFixed(2)}):\n${chunk.content}\n\n`;
        }
        
        prompt += "Using the information from these relevant excerpts, ";
      }
    }
    
    // Complete the prompt with instructions
    // Fix: Use task.goal or task.description if available, otherwise use generic text
    const taskDescription = task.goal || task.description || "analyze the meeting content";
    prompt += `${taskDescription}\n\n`;
    
    // Add the original transcript if it's short or if we couldn't get RAG content
    if (transcript.length < 4000 || !this.meetingRagService) {
      prompt += `FULL TRANSCRIPT:\n${transcript}\n\n`;
    } else {
      prompt += `Focus on the provided excerpts for your analysis. If you need more context, mention that in your response.\n\n`;
    }
    
    return prompt;
  }
}
