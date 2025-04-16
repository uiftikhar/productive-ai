/**
 * Specialized Agent Orchestrator
 *
 * Manages communication and coordination between specialized agents
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface.ts';
import { ConsoleLogger } from '../../../shared/logger/console-logger.ts';
import {
  AgentRequest,
  AgentResponse,
} from '../../interfaces/agent.interface.ts';
import {
  AgentCommunicationMessage,
  AgentCommunicationChannel,
  SpecializedAgentOrchestrator,
} from '../interfaces/agent-communication.interface.ts';
import { BaseAgent } from '../../base/base-agent.ts';

/**
 * In-memory communication channel implementation
 */
class InMemoryCommunicationChannel implements AgentCommunicationChannel {
  private handlers: Array<
    (
      message: AgentCommunicationMessage,
    ) => Promise<AgentCommunicationMessage | void>
  > = [];
  private pendingRequests: Map<
    string,
    {
      resolve: (value: AgentCommunicationMessage) => void;
      reject: (reason: any) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();

  constructor(
    private logger: Logger,
    private fromAgentId: string,
    private orchestrator: SpecializedAgentOrchestratorImpl,
  ) {}

  async send(message: AgentCommunicationMessage): Promise<void> {
    this.logger.debug(
      `Agent ${this.fromAgentId} sending message to ${message.to}`,
      {
        messageType: message.type,
        contentType:
          message.content?.requestType ||
          message.content?.responseType ||
          message.content?.eventType,
      },
    );

    // Handle response to pending request
    if (message.type === 'response' && message.correlationId) {
      const pendingRequest = this.pendingRequests.get(message.correlationId);
      if (pendingRequest) {
        this.pendingRequests.delete(message.correlationId);
        clearTimeout(pendingRequest.timeout);
        pendingRequest.resolve(message);
        return;
      }
    }

    // Forward message to target agent
    await this.orchestrator.deliverMessage(message);
  }

  registerHandler(
    handler: (
      message: AgentCommunicationMessage,
    ) => Promise<AgentCommunicationMessage | void>,
  ): void {
    this.handlers.push(handler);
  }

  async handleIncomingMessage(
    message: AgentCommunicationMessage,
  ): Promise<void> {
    this.logger.debug(
      `Agent ${this.fromAgentId} received message from ${message.from}`,
      {
        messageType: message.type,
      },
    );

    // Process message through registered handlers
    for (const handler of this.handlers) {
      try {
        const response = await handler(message);
        if (response) {
          await this.send(response);
        }
      } catch (error) {
        this.logger.error(
          `Error in message handler for agent ${this.fromAgentId}`,
          {
            error: error instanceof Error ? error.message : String(error),
            messageId: message.id,
          },
        );
      }
    }
  }

  async request(
    agentId: string,
    content: any,
    metadata?: Record<string, any>,
  ): Promise<AgentCommunicationMessage> {
    const correlationId = uuidv4();
    const message: AgentCommunicationMessage = {
      id: uuidv4(),
      from: this.fromAgentId,
      to: agentId,
      timestamp: Date.now(),
      type: 'request',
      content,
      correlationId,
      metadata,
    };

    return new Promise<AgentCommunicationMessage>((resolve, reject) => {
      // Set timeout for request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error(`Request to agent ${agentId} timed out after 30s`));
      }, 30000);

      // Store pending request
      this.pendingRequests.set(correlationId, { resolve, reject, timeout });

      // Send the request
      this.send(message).catch((error) => {
        this.pendingRequests.delete(correlationId);
        clearTimeout(timeout);
        reject(error);
      });
    });
  }
}

/**
 * Implementation of the specialized agent orchestrator
 */
export class SpecializedAgentOrchestratorImpl
  implements SpecializedAgentOrchestrator
{
  private agents: Map<
    string,
    {
      capabilities: string[];
      instance?: BaseAgent;
    }
  > = new Map();

  private communicationChannels: Map<string, InMemoryCommunicationChannel> =
    new Map();

  constructor(private logger: Logger = new ConsoleLogger()) {
    this.logger.info('Specialized Agent Orchestrator initialized');
  }

  /**
   * Set the logger instance
   */
  setLogger(logger: Logger): void {
    this.logger = logger;
    this.logger.info('Specialized Agent Orchestrator logger updated');
  }

  /**
   * Register an agent with the orchestrator
   */
  registerAgent(
    agentId: string,
    capabilities: string[],
    instance?: BaseAgent,
  ): void {
    this.agents.set(agentId, { capabilities, instance });
    this.logger.info(
      `Registered agent ${agentId} with ${capabilities.length} capabilities`,
    );
  }

  /**
   * Find an agent that can handle the specified capability
   */
  findAgentWithCapability(capability: string): string | null {
    for (const [agentId, agent] of this.agents.entries()) {
      if (agent.capabilities.includes(capability)) {
        return agentId;
      }
    }
    return null;
  }

  /**
   * Route a request to the appropriate agent
   */
  async routeRequest(request: AgentRequest): Promise<AgentResponse> {
    const capability = request.capability;

    if (!capability) {
      throw new Error('Request must specify a capability');
    }

    const agentId = this.findAgentWithCapability(capability);

    if (!agentId) {
      throw new Error(`No agent found with capability: ${capability}`);
    }

    const agent = this.agents.get(agentId)?.instance;

    if (!agent) {
      throw new Error(
        `Agent ${agentId} is registered but instance not available`,
      );
    }

    this.logger.info(
      `Routing request for capability '${capability}' to agent ${agent.name}`,
    );

    return agent.execute(request);
  }

  /**
   * Get or create a communication channel for an agent
   */
  getCommunicationChannel(fromAgentId: string): AgentCommunicationChannel {
    if (!this.agents.has(fromAgentId)) {
      throw new Error(
        `Agent ${fromAgentId} is not registered with the orchestrator`,
      );
    }

    if (!this.communicationChannels.has(fromAgentId)) {
      const channel = new InMemoryCommunicationChannel(
        this.logger,
        fromAgentId,
        this,
      );
      this.communicationChannels.set(fromAgentId, channel);
    }

    return this.communicationChannels.get(fromAgentId)!;
  }

  /**
   * Deliver a message to its target agent
   * @internal - Used by communication channels
   */
  async deliverMessage(message: AgentCommunicationMessage): Promise<void> {
    const targetChannel = this.communicationChannels.get(message.to);

    if (!targetChannel) {
      throw new Error(
        `Target agent ${message.to} does not have a communication channel`,
      );
    }

    await targetChannel.handleIncomingMessage(message);
  }
}

// Export singleton instance
export const specializedAgentOrchestrator =
  new SpecializedAgentOrchestratorImpl();
