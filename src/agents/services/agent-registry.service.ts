import { ConsoleLogger } from '../../shared/logger/console-logger';
import { Logger } from '../../shared/logger/logger.interface';
import { UnifiedAgentInterface } from '../interfaces/unified-agent.interface';
import { KnowledgeRetrievalAgent } from '../specialized/knowledge-retrieval-agent';

/**
 * Agent Registry Service
 * Maintains a registry of all available agents and their capabilities
 */
export class AgentRegistryService {
  private static instance: AgentRegistryService;
  private agents: Map<string, UnifiedAgentInterface> = new Map();
  private logger: Logger;

  private constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
  }

  /**
   * Get the singleton instance of the registry
   */
  public static getInstance(logger?: Logger): AgentRegistryService {
    if (!AgentRegistryService.instance) {
      AgentRegistryService.instance = new AgentRegistryService(logger);
    }
    return AgentRegistryService.instance;
  }

  /**
   * Register an agent with the registry
   */
  registerAgent(agent: UnifiedAgentInterface): void {
    if (this.agents.has(agent.id)) {
      this.logger.warn(
        `Agent with ID ${agent.id} already registered, replacing it`,
      );
    }

    this.agents.set(agent.id, agent);
    this.logger.info(`Registered agent: ${agent.name} (${agent.id})`);
  }

  /**
   * Register the Knowledge Retrieval Agent
   */
  registerKnowledgeRetrievalAgent(options?: any): KnowledgeRetrievalAgent {
    const agent = new KnowledgeRetrievalAgent({
      logger: this.logger,
      ...options,
    });
    this.registerAgent(agent);
    return agent;
  }

  /**
   * Get an agent by ID
   */
  getAgent(id: string): UnifiedAgentInterface | undefined {
    return this.agents.get(id);
  }

  /**
   * Find agents that can handle a specific capability
   */
  findAgentsWithCapability(capability: string): UnifiedAgentInterface[] {
    return Array.from(this.agents.values()).filter((agent) =>
      agent.canHandle(capability),
    );
  }

  /**
   * List all registered agents
   */
  listAgents(): UnifiedAgentInterface[] {
    return Array.from(this.agents.values());
  }

  /**
   * Initialize all registered agents
   */
  async initializeAgents(config?: Record<string, any>): Promise<void> {
    this.logger.info(`Initializing ${this.agents.size} agents...`);

    const initPromises = Array.from(this.agents.values()).map((agent) =>
      agent.initialize(config),
    );

    await Promise.all(initPromises);
    this.logger.info(`All agents initialized successfully`);
  }
}
