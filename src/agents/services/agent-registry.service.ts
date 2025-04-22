import { ConsoleLogger } from '../../shared/logger/console-logger';
import { Logger } from '../../shared/logger/logger.interface';
import { AgentCapability, BaseAgentInterface } from '../interfaces/base-agent.interface';
import { KnowledgeRetrievalAgent } from '../specialized/knowledge-retrieval-agent';
import { OpenAIConnector } from '../integrations/openai-connector';

/**
 * Agent Registry Service
 * Maintains a registry of all available agents and their capabilities
 */
export class AgentRegistryService {
  private static instance: AgentRegistryService;
  private agents: Map<string, BaseAgentInterface> = new Map();
  private logger: Logger;
  private defaultAgentId?: string;

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
   * @param isDefault Set to true to make this the default agent
   */
  registerAgent(agent: BaseAgentInterface, isDefault = false): void {
    if (this.agents.has(agent.id)) {
      this.logger.warn(
        `Agent with ID ${agent.id} already registered, replacing it`,
      );
    }

    this.agents.set(agent.id, agent);
    
    if (isDefault) {
      this.defaultAgentId = agent.id;
      this.logger.info(`Default agent set: ${agent.name} (${agent.id})`);
    }
    
    this.logger.info(`Registered agent: ${agent.name} (${agent.id})`);
  }

  /**
   * Register the Knowledge Retrieval Agent
   * @param isDefault Set to true to make this the default agent
   */
  registerKnowledgeRetrievalAgent(options?: any, isDefault = false): KnowledgeRetrievalAgent {
    // Make sure to provide the necessary dependencies
    if (!options.openAIConnector) {
      options.openAIConnector = new OpenAIConnector();
    }

    const agent = new KnowledgeRetrievalAgent({
      logger: this.logger,
      ...options,
    });

    // Verify agent implements the interface before registering
    this.registerAgent(agent as unknown as BaseAgentInterface, isDefault);
    return agent;
  }

  /**
   * Get all registered agents
   */
  getAllAgents(): BaseAgentInterface[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get an agent by ID
   */
  getAgent(id: string): BaseAgentInterface | undefined {
    return this.agents.get(id);
  }

  /**
   * Get the default agent if one is set
   */
  getDefaultAgent(): BaseAgentInterface | undefined {
    if (!this.defaultAgentId) return undefined;
    return this.agents.get(this.defaultAgentId);
  }
  
  /**
   * Find agents that can handle a specific capability
   */
  findAgentsWithCapability(capability: string): BaseAgentInterface[] {
    return Array.from(this.agents.values()).filter((agent) =>
      agent.canHandle(capability),
    );
  }

  /**
   * List all registered agents
   */
  listAgents(): BaseAgentInterface[] {
    return Array.from(this.agents.values());
  }
  
  /**
   * List all registered agents with basic details
   */
  listAgentsWithDetails(): Array<{ 
    id: string; 
    name: string; 
    description: string; 
    isDefault: boolean;
    capabilities?: AgentCapability[];
  }> {
    return Array.from(this.agents.entries()).map(([id, agent]) => ({
      id,
      name: agent.name,
      description: agent.description,
      isDefault: id === this.defaultAgentId,
      capabilities: agent.getCapabilities?.() || []
    }));
  }

  /**
   * Initialize all registered agents
   */
  async initializeAgents(config?: Record<string, any>): Promise<void> {
    this.logger.info(`Initializing ${this.agents.size} agents...`);

    const initPromises = Array.from(this.agents.values()).map((agent) =>
      agent.initialize(config).catch(error => {
        this.logger.error(`Failed to initialize agent: ${agent.name} (${agent.id})`, {
          error: error instanceof Error ? error.message : String(error)
        });
      }),
    );

    await Promise.all(initPromises);
    this.logger.info(`All agents initialized successfully`);
  }
  
  /**
   * Remove an agent from the registry
   */
  unregisterAgent(agentId: string): boolean {
    const existed = this.agents.has(agentId);
    this.agents.delete(agentId);
    
    if (this.defaultAgentId === agentId) {
      this.defaultAgentId = undefined;
      this.logger.warn(`Default agent was unregistered: ${agentId}`);
    }
    
    if (existed) {
      this.logger.info(`Agent unregistered: ${agentId}`);
    }
    
    return existed;
  }
}
