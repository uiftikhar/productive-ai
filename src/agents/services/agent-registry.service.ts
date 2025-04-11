import { ConsoleLogger } from '../../shared/logger/console-logger.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';
import { AgentInterface } from '../interfaces/agent.interface.ts';
import { KnowledgeRetrievalAgent } from '../specialized/knowledge-retrieval-agent.ts';
import { MasterOrchestratorAgent } from '../orchestration/master-orchestrator.ts';

/**
 * Agent Registry Service
 * Maintains a registry of all available agents and their capabilities
 */
export class AgentRegistryService {
  private static instance: AgentRegistryService;
  private agents: Map<string, AgentInterface> = new Map();
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
  registerAgent(agent: AgentInterface): void {
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
   * Register the Master Orchestrator Agent
   */
  registerMasterOrchestratorAgent(options?: any): MasterOrchestratorAgent {
    const agent = new MasterOrchestratorAgent({
      registry: this,
      logger: this.logger,
      ...options,
    });
    this.registerAgent(agent);
    return agent;
  }

  /**
   * Get an agent by ID
   */
  getAgent(id: string): AgentInterface | undefined {
    return this.agents.get(id);
  }

  /**
   * Find agents that can handle a specific capability
   */
  findAgentsWithCapability(capability: string): AgentInterface[] {
    return Array.from(this.agents.values()).filter((agent) =>
      agent.canHandle(capability),
    );
  }

  /**
   * List all registered agents
   */
  listAgents(): AgentInterface[] {
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
