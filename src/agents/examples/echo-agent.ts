// src/agents/examples/echo-agent.ts

import { BaseAgent } from '../base/base-agent.ts';
import { AgentRequest, AgentResponse } from '../interfaces/agent.interface.ts';
import { OpenAIAdapter, MessageConfig } from '../adapters/openai-adapter.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';

/**
 * A simple echo agent that demonstrates the BaseAgent functionality.
 * It can either echo the input back directly or use OpenAI to enhance the response.
 */
export class EchoAgent extends BaseAgent {
  private enhanceResponses: boolean;

  constructor(options: {
    name?: string;
    description?: string;
    logger?: Logger;
    openaiAdapter?: OpenAIAdapter;
    enhanceResponses?: boolean;
  } = {}) {
    super(
      options.name || 'Echo Agent',
      options.description || 'Repeats input back to the user with optional enhancement',
      {
        logger: options.logger,
        openaiAdapter: options.openaiAdapter,
      }
    );

    this.enhanceResponses = options.enhanceResponses || false;

    // Register capabilities
    this.registerCapability({
      name: 'echo',
      description: 'Echo back what the user said',
      parameters: {
        enhance: 'Whether to enhance the response with AI (true/false)'
      }
    });

    this.registerCapability({
      name: 'shout',
      description: 'Echo back what the user said in ALL CAPS',
      parameters: {
        enhance: 'Whether to enhance the response with AI (true/false)'
      }
    });
  }

  /**
   * Override initialization to set up any additional resources
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);
    
    // Set enhancement mode from config if provided
    if (config && 'enhanceResponses' in config) {
      this.enhanceResponses = Boolean(config.enhanceResponses);
    }
  }

  /**
   * Execute the agent's logic based on the request
   */
  protected async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    
    // Extract the input text
    const inputText = typeof request.input === 'string'
      ? request.input
      : request.input.map(msg => msg.content).join('\n');
    
    // Check for enhancement parameter in the request
    const enhance = this.enhanceResponses || 
      (request.parameters?.enhance === true) ||
      (request.parameters?.enhance === 'true');
    
    let responseText = '';
    let tokenUsage = 0;
    
    // Process based on capability
    if (request.capability === 'shout') {
      responseText = inputText.toUpperCase();
    } else {
      // Default to echo capability
      responseText = inputText;
    }
    
    // Enhance the response with AI if requested
    if (enhance && this.openaiAdapter) {
      try {
        const messages: MessageConfig[] = [
          { role: 'system', content: 'You are an echo assistant. Your job is to enhance the user\'s message by adding some personality and humor, but keep it focused on the original message.' },
          { role: 'user', content: `Enhance this message while keeping its meaning: "${responseText}"` }
        ];
        
        responseText = await this.openaiAdapter.generateChatCompletion(messages);
        
        // Estimate token usage (very rough estimate)
        tokenUsage = Math.round((messages[0].content.length + messages[1].content.length + responseText.length) / 4);
      } catch (error) {
        this.logger.error('Error enhancing response with OpenAI', {
          error: error instanceof Error ? error.message : String(error)
        });
        // Fall back to regular echo if enhancement fails
      }
    }
    
    // Get context information if available
    let contextInfo = '';
    if (request.context && Object.keys(request.context.metadata || {}).length > 0) {
      contextInfo = `(with ${Object.keys(request.context.metadata || {}).length} context items)`;
    }
    
    return {
      output: responseText,
      artifacts: {
        originalInput: inputText,
        enhanced: enhance,
        contextInfo
      },
      metrics: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed: tokenUsage
      }
    };
  }
} 