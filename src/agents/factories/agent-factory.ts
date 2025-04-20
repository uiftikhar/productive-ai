/**
 * Agent Factory
 *
 * A factory for creating and registering agent instances.
 * This centralized factory simplifies agent creation with consistent configuration
 * and automatic registration with the AgentRegistryService.
 */

import { ChatOpenAI } from '@langchain/openai';
import {
  BaseAgentInterface,
  WorkflowCompatibleAgent,
} from '../interfaces/base-agent.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { AgentRegistryService } from '../services/agent-registry.service';
import { KnowledgeRetrievalAgent } from '../specialized/knowledge-retrieval-agent';
import { DocumentRetrievalAgent } from '../specialized/retrieval-agent';
import { MeetingAnalysisAgent } from '../specialized/meeting-analysis-agent';
import { DecisionTrackingAgent } from '../specialized/decision-tracking-agent';
import { EmbeddingService } from '../../shared/services/embedding.service';
import { OpenAIConnector } from '../integrations/openai-connector';
import { PineconeConnector } from '../integrations/pinecone-connector';
import { AgentWorkflow } from '../../langgraph/core/workflows/agent-workflow';
import { BaseAgent } from '../base/base-agent';

/**
 * Standard options for agent creation
 */
export interface AgentFactoryOptions {
  logger?: Logger;
  llm?: ChatOpenAI;
  id?: string;
  autoRegister?: boolean;
  registry?: AgentRegistryService;
  openAIConnector?: OpenAIConnector;
  pineconeConnector?: PineconeConnector;
  embeddingService?: EmbeddingService;
  indexName?: string;
  namespace?: string;
  wrapWithWorkflow?: boolean;
  tracingEnabled?: boolean;
  [key: string]: any; // Allow any additional options
}

/**
 * Factory for creating agents
 */
export class AgentFactory {
  private registry: AgentRegistryService;
  private logger: Logger;
  private openAIConnector: OpenAIConnector;
  private pineconeConnector?: PineconeConnector;
  private embeddingService: EmbeddingService;

  constructor(
    options: {
      registry?: AgentRegistryService;
      logger?: Logger;
      openAIConnector?: OpenAIConnector;
      pineconeConnector?: PineconeConnector;
      embeddingService?: EmbeddingService;
    } = {},
  ) {
    this.registry = options.registry || AgentRegistryService.getInstance();
    this.logger = options.logger || new ConsoleLogger();

    this.openAIConnector =
      options.openAIConnector ||
      new OpenAIConnector({
        logger: this.logger,
      });

    this.pineconeConnector = options.pineconeConnector;

    this.embeddingService =
      options.embeddingService ||
      new EmbeddingService(this.openAIConnector, this.logger);
  }

  /**
   * Register an agent with the registry
   */
  registerAgent(agent: BaseAgentInterface): BaseAgentInterface {
    this.registry.registerAgent(agent);
    return agent;
  }

  /**
   * Create an agent workflow for any agent
   * @param agent The agent to wrap in a workflow
   * @param options Workflow options
   * @returns An AgentWorkflow instance
   */
  createAgentWorkflow<T extends BaseAgent>(
    agent: T,
    options: {
      tracingEnabled?: boolean;
      includeStateInLogs?: boolean;
    } = {},
  ): AgentWorkflow<T> {
    return new AgentWorkflow<T>(agent, options);
  }

  /**
   * Create a KnowledgeRetrievalAgent
   */
  createKnowledgeRetrievalAgent(
    options: AgentFactoryOptions = {},
  ): KnowledgeRetrievalAgent | AgentWorkflow<KnowledgeRetrievalAgent> {
    const agent = new KnowledgeRetrievalAgent({
      logger: options.logger || this.logger,
      llm: options.llm,
      openAIConnector: options.openAIConnector || this.openAIConnector,
      embeddingService: options.embeddingService || this.embeddingService,
      id: options.id,
      ...options,
    });

    if (options.autoRegister !== false) {
      this.registerAgent(agent);
    }

    // Optionally wrap the agent in a workflow
    if (options.wrapWithWorkflow) {
      return this.createAgentWorkflow(agent, {
        tracingEnabled: options.tracingEnabled,
      });
    }

    return agent;
  }

  /**
   * Create a DocumentRetrievalAgent
   */
  createDocumentRetrievalAgent(
    options: AgentFactoryOptions = {},
  ): DocumentRetrievalAgent | AgentWorkflow<DocumentRetrievalAgent> {
    const agent = new DocumentRetrievalAgent({
      logger: options.logger || this.logger,
      llm: options.llm,
      openAIConnector: options.openAIConnector || this.openAIConnector,
      pineconeConnector: options.pineconeConnector || this.pineconeConnector,
      indexName: options.indexName || 'documents',
      namespace: options.namespace || 'default',
      id: options.id,
      ...options,
    });

    if (options.autoRegister !== false) {
      this.registerAgent(agent);
    }

    // Optionally wrap the agent in a workflow
    if (options.wrapWithWorkflow) {
      return this.createAgentWorkflow(agent, {
        tracingEnabled: options.tracingEnabled,
      });
    }

    return agent;
  }

  /**
   * Create a MeetingAnalysisAgent
   */
  createMeetingAnalysisAgent(
    options: AgentFactoryOptions = {},
  ): MeetingAnalysisAgent | AgentWorkflow<MeetingAnalysisAgent> {
    const agent = new MeetingAnalysisAgent(
      options.name || 'Meeting Analysis Agent',
      options.description ||
        'Analyzes meeting transcripts to extract key information',
      {
        logger: options.logger || this.logger,
        llm: options.llm,
        openAIConnector: options.openAIConnector || this.openAIConnector,
        embeddingService: options.embeddingService || this.embeddingService,
        id: options.id,
        ...options,
      },
    );

    if (options.autoRegister !== false) {
      this.registerAgent(agent);
    }

    // Optionally wrap the agent in a workflow
    if (options.wrapWithWorkflow) {
      return this.createAgentWorkflow(agent, {
        tracingEnabled: options.tracingEnabled,
      });
    }

    return agent;
  }

  /**
   * Create a DecisionTrackingAgent
   */
  createDecisionTrackingAgent(
    options: AgentFactoryOptions = {},
  ): DecisionTrackingAgent | AgentWorkflow<DecisionTrackingAgent> {
    const agent = new DecisionTrackingAgent({
      id: options.id,
      name: options.name,
      description: options.description,
      logger: options.logger || this.logger,
      openAIConnector: options.openAIConnector || this.openAIConnector,
      ...options,
    });

    if (options.autoRegister !== false) {
      this.registerAgent(agent);
    }

    // Optionally wrap the agent in a workflow
    if (options.wrapWithWorkflow) {
      return this.createAgentWorkflow(agent, {
        tracingEnabled: options.tracingEnabled,
      });
    }

    return agent;
  }

  /**
   * Create and initialize all standard agents
   */
  async createStandardAgents(
    options: AgentFactoryOptions = {},
  ): Promise<BaseAgentInterface[]> {
    const agents: BaseAgentInterface[] = [];

    // Ensure we don't create workflows for agents added to the registry
    const agentOptions = { ...options, wrapWithWorkflow: false };

    // This ensures we always get the concrete agent type, not a workflow
    agents.push(
      this.createKnowledgeRetrievalAgent(
        agentOptions,
      ) as KnowledgeRetrievalAgent,
    );
    agents.push(
      this.createDocumentRetrievalAgent(agentOptions) as DocumentRetrievalAgent,
    );
    agents.push(
      this.createMeetingAnalysisAgent(agentOptions) as MeetingAnalysisAgent,
    );

    await Promise.all(agents.map((agent) => agent.initialize()));

    return agents;
  }
}

/**
 * Get the default agent factory instance
 */
export function getDefaultAgentFactory(
  options: {
    logger?: Logger;
    registry?: AgentRegistryService;
  } = {},
): AgentFactory {
  return new AgentFactory({
    logger: options.logger,
    registry: options.registry,
  });
}
