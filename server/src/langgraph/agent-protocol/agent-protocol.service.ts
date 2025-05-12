import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { PineconeConnector } from '../../connectors/pinecone-connector';
import { ServiceRegistry } from '../agentic-meeting-analysis/services/service-registry';
import { AgentProtocolTools } from './agent-protocol-tools';
import { MessageConfig } from '../../connectors/language-model-provider.interface';
import { 
  Run,
  Thread,
  Message,
  RunStatus,
  Tool,
  Assistant,
  CreateThreadRequest,
  CreateMessageRequest,
  CreateRunRequest,
  SubmitToolOutputsRequest,
  MessageRole,
  ContentType,
  TextContent,
  ToolCallContent,
  ToolResultContent
} from './agent-protocol.interface';

/**
 * Configuration for Agent Protocol Service
 */
export interface AgentProtocolServiceConfig {
  logger?: Logger;
  openAiConnector?: OpenAIConnector;
  pineconeConnector?: PineconeConnector;
  enablePersistence?: boolean;
  storageDirectory?: string;
  tools?: AgentProtocolTools;
}

/**
 * Agent Protocol Service
 * Implements the Agent Protocol for managing threads, runs, and assistants
 */
export class AgentProtocolService {
  private logger: Logger;
  private openAiConnector: OpenAIConnector;
  private pineconeConnector?: PineconeConnector;
  private tools: AgentProtocolTools;
  private threads: Map<string, Thread> = new Map();
  private messages: Map<string, Message[]> = new Map();
  private runs: Map<string, Run> = new Map();
  private assistants: Map<string, Assistant> = new Map();
  private enablePersistence: boolean;
  private storageDirectory: string;
  
  /**
   * Create a new Agent Protocol Service
   */
  constructor(config: AgentProtocolServiceConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.enablePersistence = config.enablePersistence || false;
    this.storageDirectory = config.storageDirectory || './data/agent-protocol';
    
    // Get OpenAI connector from config or service registry
    if (config.openAiConnector) {
      this.openAiConnector = config.openAiConnector;
    } else {
      const registry = ServiceRegistry.getInstance();
      const openAiConnector = registry.getOpenAIConnector();
      
      if (!openAiConnector) {
        throw new Error('OpenAI connector is required but not available in service registry');
      }
      
      this.openAiConnector = openAiConnector;
    }
    
    // Get Pinecone connector if available
    if (config.pineconeConnector) {
      this.pineconeConnector = config.pineconeConnector;
    } else {
      const registry = ServiceRegistry.getInstance();
      this.pineconeConnector = registry.getPineconeConnector();
    }
    
    // Initialize tools if not provided
    if (config.tools) {
      this.tools = config.tools;
    } else {
      this.tools = new AgentProtocolTools({
        logger: this.logger,
        openAiConnector: this.openAiConnector,
        pineconeConnector: this.pineconeConnector
      });
    }
    
    this.logger.info('Agent Protocol Service initialized');
  }
  
  /**
   * Register a meeting analysis assistant with tools
   */
  registerMeetingAnalysisAssistant(): Assistant {
    // Get available tools from the tools service
    const meetingAnalysisTools = this.tools.getAvailableTools();
    
    const assistant: Assistant = {
      id: `assistant-${uuidv4()}`,
      name: "Meeting Analysis Assistant",
      description: "Analyzes meeting transcripts to extract topics, action items, and generate summaries",
      model: process.env.OPENAI_MODEL || "gpt-4o",
      instructions: "You are a meeting analysis assistant. Your job is to analyze meeting transcripts and extract valuable insights including topics discussed, action items assigned, and generate comprehensive summaries.",
      tools: meetingAnalysisTools,
      metadata: {
        type: "meeting_analysis",
        version: "1.0.0"
      }
    };
    
    this.assistants.set(assistant.id, assistant);
    this.logger.info(`Registered meeting analysis assistant with ID: ${assistant.id}`);
    
    return assistant;
  }
  
  /**
   * Create a thread
   */
  async createThread(request: CreateThreadRequest = {}): Promise<Thread> {
    const thread: Thread = {
      id: `thread-${uuidv4()}`,
      created_at: new Date().toISOString(),
      metadata: request.metadata || {}
    };
    
    this.threads.set(thread.id, thread);
    this.messages.set(thread.id, []);
    
    // Add initial messages if provided
    if (request.messages && request.messages.length > 0) {
      for (const messageRequest of request.messages) {
        await this.createMessage(thread.id, messageRequest);
      }
    }
    
    this.logger.info(`Created thread with ID: ${thread.id}`);
    return thread;
  }
  
  /**
   * Get a thread
   */
  async getThread(threadId: string): Promise<Thread | null> {
    const thread = this.threads.get(threadId);
    return thread || null;
  }
  
  /**
   * Create a message in a thread
   */
  async createMessage(threadId: string, request: CreateMessageRequest): Promise<Message> {
    const thread = this.threads.get(threadId);
    if (!thread) {
      throw new Error(`Thread with ID ${threadId} not found`);
    }
    
    // Get the content
    const content = request.content;
    
    const message: Message = {
      id: `msg-${uuidv4()}`,
      role: request.role,
      content: content,
      created_at: new Date().toISOString()
    };
    
    // Get thread messages or initialize empty array
    const threadMessages = this.messages.get(threadId) || [];
    threadMessages.push(message);
    this.messages.set(threadId, threadMessages);
    
    this.logger.info(`Created message in thread ${threadId}`);
    return message;
  }
  
  /**
   * Get messages from a thread
   */
  async getMessages(threadId: string): Promise<Message[]> {
    const messages = this.messages.get(threadId) || [];
    return [...messages];
  }
  
  /**
   * Create and start a run
   */
  async createRun(request: CreateRunRequest): Promise<Run> {
    const thread = this.threads.get(request.thread_id);
    if (!thread) {
      throw new Error(`Thread with ID ${request.thread_id} not found`);
    }
    
    const assistant = this.assistants.get(request.assistant_id);
    if (!assistant) {
      throw new Error(`Assistant with ID ${request.assistant_id} not found`);
    }
    
    const run: Run = {
      id: `run-${uuidv4()}`,
      thread_id: request.thread_id,
      assistant_id: request.assistant_id,
      status: RunStatus.PENDING,
      created_at: new Date().toISOString(),
      metadata: request.metadata || {}
    };
    
    this.runs.set(run.id, run);
    this.logger.info(`Created run with ID: ${run.id}`);
    
    // Start the run asynchronously
    this.executeRun(run.id).catch(error => {
      this.logger.error(`Error executing run ${run.id}:`, { error });
      const errorDetails = {
        code: 'execution_error',
        message: error instanceof Error ? error.message : String(error)
      };
      this.updateRunStatus(run.id, RunStatus.FAILED, errorDetails);
    });
    
    return run;
  }
  
  /**
   * Get a run
   */
  async getRun(runId: string): Promise<Run | null> {
    return this.runs.get(runId) || null;
  }
  
  /**
   * Submit tool outputs for a run requiring action
   */
  async submitToolOutputs(runId: string, request: SubmitToolOutputsRequest): Promise<Run> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run with ID ${runId} not found`);
    }
    
    if (run.status !== RunStatus.REQUIRES_ACTION) {
      throw new Error(`Run with ID ${runId} is not in requires_action state`);
    }
    
    if (!run.required_action) {
      throw new Error(`Run with ID ${runId} has no required action`);
    }
    
    // Add tool output messages to the thread
    for (const toolOutput of request.tool_outputs) {
      // Find the matching tool call to get the tool name
      const toolCall = run.required_action.tool_calls.find(
        tc => tc.name && tc.name === toolOutput.tool_call_id
      );
      
      const toolName = toolCall?.name || 'unknown';
      
      await this.createMessage(run.thread_id, {
        role: MessageRole.TOOL,
        content: [{
          type: ContentType.TOOL_RESULT,
          tool_result: {
            tool_name: toolName,
            result: toolOutput.output
          }
        }]
      });
    }
    
    // Continue the run
    this.updateRunStatus(runId, RunStatus.RUNNING);
    
    // Re-execute the run
    this.executeRun(runId).catch(error => {
      this.logger.error(`Error continuing run ${runId}:`, { error });
      const errorDetails = {
        code: 'execution_error',
        message: error instanceof Error ? error.message : String(error)
      };
      this.updateRunStatus(runId, RunStatus.FAILED, errorDetails);
    });
    
    return this.runs.get(runId)!;
  }
  
  /**
   * Cancel a run
   */
  async cancelRun(runId: string): Promise<Run> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run with ID ${runId} not found`);
    }
    
    if (run.status === RunStatus.COMPLETED || run.status === RunStatus.FAILED || run.status === RunStatus.CANCELED) {
      throw new Error(`Run with ID ${runId} is already in a terminal state: ${run.status}`);
    }
    
    this.updateRunStatus(runId, RunStatus.CANCELED);
    return this.runs.get(runId)!;
  }
  
  /**
   * Update run status
   */
  private updateRunStatus(runId: string, status: RunStatus, error?: { code: string; message: string }): void {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run with ID ${runId} not found`);
    }
    
    run.status = status;
    
    if (status === RunStatus.RUNNING && !run.started_at) {
      run.started_at = new Date().toISOString();
    }
    
    if (status === RunStatus.COMPLETED || status === RunStatus.FAILED || status === RunStatus.CANCELED) {
      run.completed_at = new Date().toISOString();
    }
    
    if (error && (status === RunStatus.FAILED)) {
      run.last_error = error;
    }
    
    this.runs.set(runId, run);
    this.logger.info(`Updated run ${runId} status to ${status}`);
  }
  
  /**
   * Execute a run
   * This is the core method that processes the run and calls the appropriate handler
   */
  private async executeRun(runId: string): Promise<void> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Run with ID ${runId} not found`);
    }
    
    this.updateRunStatus(runId, RunStatus.RUNNING);
    
    try {
      const assistant = this.assistants.get(run.assistant_id);
      if (!assistant) {
        throw new Error(`Assistant with ID ${run.assistant_id} not found`);
      }
      
      const messages = await this.getMessages(run.thread_id);
      
      // Handle the run based on the assistant type
      if (assistant.metadata?.type === 'meeting_analysis') {
        await this.processMeetingAnalysisRun(run, messages, assistant);
      } else {
        // Generic assistant handling
        await this.processGenericAssistantRun(run, messages, assistant);
      }
      
      this.updateRunStatus(runId, RunStatus.COMPLETED);
    } catch (error) {
      this.logger.error(`Error executing run ${runId}:`, { error });
      const errorDetails = {
        code: 'execution_error',
        message: error instanceof Error ? error.message : String(error)
      };
      this.updateRunStatus(runId, RunStatus.FAILED, errorDetails);
    }
  }
  
  /**
   * Process a meeting analysis run
   * Implements meeting analysis logic using the tools service
   */
  private async processMeetingAnalysisRun(run: Run, messages: Message[], assistant: Assistant): Promise<void> {
    this.logger.info(`Processing meeting analysis run: ${run.id}`);
    
    if (!this.tools) {
      throw new Error('Agent Protocol Tools not available for meeting analysis');
    }
    
    try {
      // Extract the transcript from the messages
      let transcript = '';
      let userMessages = messages.filter(m => m.role === MessageRole.USER);
      
      // If there are no user messages, we can't process the run
      if (userMessages.length === 0) {
        await this.createMessage(run.thread_id, {
          role: MessageRole.ASSISTANT,
          content: [{
            type: ContentType.TEXT,
            text: "Please provide a meeting transcript to analyze."
          }]
        });
        return;
      }
      
      // Get the last user message
      const lastUserMessage = userMessages[userMessages.length - 1];
      
      // Extract text content from the message
      for (const contentItem of lastUserMessage.content) {
        if (contentItem.type === ContentType.TEXT) {
          transcript += (contentItem as TextContent).text + "\n";
        }
      }
      
      if (!transcript.trim()) {
        await this.createMessage(run.thread_id, {
          role: MessageRole.ASSISTANT,
          content: [{
            type: ContentType.TEXT,
            text: "I couldn't find a meeting transcript in your message. Please provide one to analyze."
          }]
        });
        return;
      }
      
      // First, extract topics from the transcript
      const topicsResult = await this.tools.executeTool('extract_topics', {
        transcript: transcript
      });
      
      // Then identify action items
      const actionItemsResult = await this.tools.executeTool('identify_action_items', {
        transcript: transcript,
        topics: topicsResult.topics
      });
      
      // Generate a summary with the topics and action items
      const summaryResult = await this.tools.executeTool('generate_summary', {
        transcript: transcript,
        topics: topicsResult.topics,
        action_items: actionItemsResult.actionItems
      });
      
      // Add response to thread
      await this.createMessage(run.thread_id, {
        role: MessageRole.ASSISTANT,
        content: [
          {
            type: ContentType.TEXT,
            text: `# Meeting Analysis\n\n## Summary\n${summaryResult.short || 'No summary available'}\n\n## Topics\n${this.formatTopics(topicsResult.topics || [])}\n\n## Action Items\n${this.formatActionItems(actionItemsResult.actionItems || [])}`
          }
        ]
      });
      
    } catch (error) {
      this.logger.error(`Error in meeting analysis: ${error instanceof Error ? error.message : String(error)}`);
      await this.createMessage(run.thread_id, {
        role: MessageRole.ASSISTANT,
        content: [{
          type: ContentType.TEXT,
          text: `There was an error analyzing the meeting: ${error instanceof Error ? error.message : String(error)}`
        }]
      });
      
      throw error; // Re-throw for the caller to handle
    }
  }
  
  /**
   * Format topics for display
   */
  private formatTopics(topics: any[]): string {
    if (!topics || topics.length === 0) {
      return "No topics identified.";
    }
    
    return topics.map((topic, index) => 
      `${index + 1}. **${topic.name}**: ${topic.description || ''}`
    ).join('\n');
  }
  
  /**
   * Format action items for display
   */
  private formatActionItems(actionItems: any[]): string {
    if (!actionItems || actionItems.length === 0) {
      return "No action items identified.";
    }
    
    return actionItems.map((item, index) => {
      const assignees = item.assignees && item.assignees.length > 0 
        ? `(Assigned to: ${item.assignees.join(', ')})` 
        : '';
      
      const dueDate = item.dueDate ? `[Due: ${item.dueDate}]` : '';
      
      return `${index + 1}. ${item.description} ${assignees} ${dueDate}`;
    }).join('\n');
  }
  
  /**
   * Process a generic assistant run
   */
  private async processGenericAssistantRun(run: Run, messages: Message[], assistant: Assistant): Promise<void> {
    // Format messages for OpenAI
    const formattedMessages: MessageConfig[] = messages.map(message => {
      // Convert content array to string for simple implementation
      const content = message.content
        .filter(c => c.type === ContentType.TEXT)
        .map(c => (c as TextContent).text)
        .join("\n");
      
      return {
        role: this.mapRoleToOpenAIRole(message.role),
        content
      };
    });
    
    // Call OpenAI
    const response = await this.openAiConnector.generateChatCompletion(
      formattedMessages,
      {
        model: assistant.model,
        temperature: 0.7,
        maxTokens: 2000
      }
    );
    
    // Add response to thread
    await this.createMessage(run.thread_id, {
      role: MessageRole.ASSISTANT,
      content: [{
        type: ContentType.TEXT,
        text: response
      }]
    });
  }
  
  /**
   * Map protocol roles to OpenAI roles
   */
  private mapRoleToOpenAIRole(role: MessageRole): 'system' | 'user' | 'assistant' {
    switch (role) {
      case MessageRole.USER:
        return 'user';
      case MessageRole.ASSISTANT:
        return 'assistant';
      case MessageRole.SYSTEM:
        return 'system';
      case MessageRole.TOOL:
        return 'assistant'; // Map tool messages to assistant
      default:
        return 'user'; // Default to user
    }
  }
} 