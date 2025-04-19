import { v4 as uuidv4 } from 'uuid';
import { UnifiedAgent } from '../base/unified-agent';
import { AgentCapability } from '../interfaces/unified-agent.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Registry entry containing agent instance and metadata
 */
export interface AgentRegistryEntry {
  id: string;
  agentId: string;
  agentName: string;
  agentType: string;
  capabilities: AgentCapability[];
  instance: UnifiedAgent;
  registeredAt: Date;
  lastUsedAt?: Date;
  usageCount: number;
  metadata: Record<string, any>;
}

/**
 * Agent Registration options
 */
export interface AgentRegistrationOptions {
  metadata?: Record<string, any>;
}

/**
 * Agent search/filter criteria
 */
export interface AgentFilterCriteria {
  capability?: string;
  agentName?: string;
  agentType?: string;
  metadataMatch?: Record<string, any>;
}

/**
 * Central registry for all agents in the system
 * Provides lookup, registration, and capability-based routing
 */
export class AgentRegistry {
  private static instance: AgentRegistry;
  private registry: Map<string, AgentRegistryEntry> = new Map();
  private logger: Logger;
  
  /**
   * Get the singleton instance of the registry
   */
  public static getInstance(logger?: Logger): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry(logger);
    }
    return AgentRegistry.instance;
  }
  
  private constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
  }
  
  /**
   * Register an agent in the registry
   * @param agent The agent to register
   * @param options Registration options
   * @returns The registry entry ID
   */
  registerAgent(agent: UnifiedAgent, options: AgentRegistrationOptions = {}): string {
    // Generate a registry entry ID
    const entryId = uuidv4();
    
    // Create a registry entry
    const entry: AgentRegistryEntry = {
      id: entryId,
      agentId: agent.id,
      agentName: agent.name,
      agentType: agent.constructor.name,
      capabilities: agent.getCapabilities(),
      instance: agent,
      registeredAt: new Date(),
      usageCount: 0,
      metadata: options.metadata || {},
    };
    
    // Add to registry
    this.registry.set(entryId, entry);
    
    this.logger.info(`Registered agent: ${agent.name} (${agent.id}) with ${entry.capabilities.length} capabilities`);
    
    return entryId;
  }
  
  /**
   * Unregister an agent from the registry
   * @param entryId The registry entry ID to unregister
   * @returns True if successfully unregistered
   */
  unregisterAgent(entryId: string): boolean {
    const entry = this.registry.get(entryId);
    if (!entry) {
      return false;
    }
    
    this.registry.delete(entryId);
    this.logger.info(`Unregistered agent: ${entry.agentName} (${entry.agentId})`);
    
    return true;
  }
  
  /**
   * Get all agents in the registry
   */
  getAllAgents(): AgentRegistryEntry[] {
    return Array.from(this.registry.values());
  }
  
  /**
   * Find an agent by ID
   * @param agentId The agent ID to find
   */
  findAgentById(agentId: string): AgentRegistryEntry | undefined {
    return Array.from(this.registry.values()).find(entry => entry.agentId === agentId);
  }
  
  /**
   * Find agents matching filter criteria
   * @param criteria Filter criteria
   */
  findAgents(criteria: AgentFilterCriteria): AgentRegistryEntry[] {
    let results = Array.from(this.registry.values());
    
    // Filter by capability
    if (criteria.capability) {
      results = results.filter(entry => 
        entry.capabilities.some(cap => cap.name === criteria.capability)
      );
    }
    
    // Filter by agent name
    if (criteria.agentName) {
      results = results.filter(entry => 
        entry.agentName.toLowerCase().includes(criteria.agentName!.toLowerCase())
      );
    }
    
    // Filter by agent type
    if (criteria.agentType) {
      results = results.filter(entry => 
        entry.agentType === criteria.agentType
      );
    }
    
    // Filter by metadata
    if (criteria.metadataMatch) {
      results = results.filter(entry => {
        for (const [key, value] of Object.entries(criteria.metadataMatch!)) {
          if (entry.metadata[key] !== value) {
            return false;
          }
        }
        return true;
      });
    }
    
    return results;
  }
  
  /**
   * Find agents that can handle a specific capability
   * @param capability The capability name
   */
  findAgentsByCapability(capability: string): AgentRegistryEntry[] {
    return this.findAgents({ capability });
  }
  
  /**
   * Track agent usage
   * @param entryId The registry entry ID that was used
   */
  trackAgentUsage(entryId: string): void {
    const entry = this.registry.get(entryId);
    if (entry) {
      entry.lastUsedAt = new Date();
      entry.usageCount += 1;
      this.registry.set(entryId, entry);
    }
  }
  
  /**
   * Returns the number of registered agents
   */
  get size(): number {
    return this.registry.size;
  }
} 