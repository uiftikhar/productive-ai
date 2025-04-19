import { UnifiedAgent } from '../base/unified-agent';
import { AgentRegistry } from './agent-registry';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Agent creation options
 */
export interface AgentCreationOptions {
  id?: string;
  logger?: Logger;
  metadata?: Record<string, any>;
  config?: Record<string, any>;
}

/**
 * Agent configuration for factory registration
 */
export interface AgentConfig {
  type: string;
  constructorFn: new (...args: any[]) => UnifiedAgent;
  defaultConfig?: Record<string, any>;
  capabilities?: string[];
}

/**
 * Central factory for creating agents
 * Provides type-safe agent instantiation and registration
 */
export class AgentFactory {
  private static instance: AgentFactory;
  private registry: AgentRegistry;
  private agentTypes: Map<string, AgentConfig> = new Map();
  private logger: Logger;
  
  /**
   * Get the singleton instance of the factory
   */
  public static getInstance(logger?: Logger): AgentFactory {
    if (!AgentFactory.instance) {
      AgentFactory.instance = new AgentFactory(logger);
    }
    return AgentFactory.instance;
  }
  
  private constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
    this.registry = AgentRegistry.getInstance(this.logger);
  }
  
  /**
   * Register an agent type with the factory
   * @param config Agent type configuration
   */
  registerAgentType(config: AgentConfig): void {
    if (this.agentTypes.has(config.type)) {
      this.logger.warn(`Agent type ${config.type} already registered, overwriting`);
    }
    
    this.agentTypes.set(config.type, config);
    this.logger.info(`Registered agent type: ${config.type}`);
  }
  
  /**
   * Create an agent instance of the specified type
   * @param type The agent type to create
   * @param name The agent name
   * @param description The agent description
   * @param options Additional creation options
   * @returns The created agent instance
   */
  createAgent(
    type: string,
    name: string,
    description: string,
    options: AgentCreationOptions = {}
  ): UnifiedAgent {
    // Check if agent type is registered
    const config = this.agentTypes.get(type);
    if (!config) {
      throw new Error(`Agent type '${type}' not registered`);
    }
    
    // Merge default config with provided config
    const mergedConfig = {
      ...(config.defaultConfig || {}),
      ...(options.config || {})
    };
    
    // Create agent instance
    const agent = new config.constructorFn(
      name,
      description,
      {
        id: options.id,
        logger: options.logger || this.logger,
        ...mergedConfig
      }
    );
    
    // Register with the registry
    this.registry.registerAgent(agent, {
      metadata: {
        ...options.metadata,
        agentType: type
      }
    });
    
    return agent;
  }
  
  /**
   * Get all registered agent types
   */
  getRegisteredAgentTypes(): string[] {
    return Array.from(this.agentTypes.keys());
  }
  
  /**
   * Check if an agent type is registered
   * @param type The agent type to check
   */
  isAgentTypeRegistered(type: string): boolean {
    return this.agentTypes.has(type);
  }
  
  /**
   * Get the registry instance
   */
  getRegistry(): AgentRegistry {
    return this.registry;
  }
} 