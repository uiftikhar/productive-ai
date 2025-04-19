/**
 * Agent Factory
 *
 * A factory for creating and registering agent instances.
 * This centralized factory simplifies agent creation with consistent configuration
 * and automatic registration with the AgentRegistryService.
 */

import { ChatOpenAI } from '@langchain/openai';
import { BaseAgentInterface } from '../interfaces/base-agent.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { AgentRegistryService } from '../services/agent-registry.service';
import { KnowledgeRetrievalAgent } from '../specialized/knowledge-retrieval-agent';
import { DocumentRetrievalAgent } from '../specialized/retrieval-agent';
import { MeetingAnalysisAgent } from '../specialized/meeting-analysis-agent';
import { EmbeddingService } from '../../shared/embedding/embedding.service';
import { OpenAIConnector } from '../integrations/openai-connector';
import { PineconeConnector } from '../integrations/pinecone-connector';

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

    // Initialize OpenAI connector
    this.openAIConnector =
      options.openAIConnector ||
      new OpenAIConnector({
        logger: this.logger,
      });

    // Initialize Pinecone connector (optional)
    this.pineconeConnector = options.pineconeConnector;

    // Initialize Embedding service
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
   * Create a KnowledgeRetrievalAgent
   */
  createKnowledgeRetrievalAgent(
    options: AgentFactoryOptions = {},
  ): KnowledgeRetrievalAgent {
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

    return agent;
  }

  /**
   * Create a DocumentRetrievalAgent
   */
  createDocumentRetrievalAgent(
    options: AgentFactoryOptions = {},
  ): DocumentRetrievalAgent {
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

    return agent;
  }

  /**
   * Create a MeetingAnalysisAgent
   */
  createMeetingAnalysisAgent(
    options: AgentFactoryOptions = {},
  ): MeetingAnalysisAgent {
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

    return agent;
  }

  /**
   * Create and initialize all standard agents
   */
  async createStandardAgents(
    options: AgentFactoryOptions = {},
  ): Promise<BaseAgentInterface[]> {
    const agents: BaseAgentInterface[] = [];

    // Create each type of agent
    agents.push(this.createKnowledgeRetrievalAgent(options));
    agents.push(this.createDocumentRetrievalAgent(options));
    agents.push(this.createMeetingAnalysisAgent(options));

    // Initialize all agents
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
