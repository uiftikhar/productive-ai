import { AgentRegistry, AgentRegistryEntry } from './agent-registry';
import { AgentRequest, AgentResponse, AgentCapability } from '../interfaces/unified-agent.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Agent selection strategy options
 */
export enum AgentSelectionStrategy {
  FIRST_MATCH = 'first_match',
  MOST_RECENTLY_USED = 'most_recently_used',
  LEAST_USED = 'least_used',
  HIGHEST_PRIORITY = 'highest_priority',
  RANDOM = 'random',
}

/**
 * Router options for agent selection
 */
export interface RouterOptions {
  strategy?: AgentSelectionStrategy;
  fallbackCapability?: string;
  logRouting?: boolean;
  requireExactMatch?: boolean;
  agentTypePreference?: string[];
  priorityMetadataKey?: string;
}

/**
 * Capability-based agent router
 * Routes requests to the appropriate agent based on requested capability
 */
export class CapabilityRouter {
  private registry: AgentRegistry;
  private logger: Logger;
  
  /**
   * Create a new capability router
   */
  constructor(registry?: AgentRegistry, logger?: Logger) {
    this.registry = registry || AgentRegistry.getInstance();
    this.logger = logger || new ConsoleLogger();
  }
  
  /**
   * Route a request to the appropriate agent
   * @param request The agent request to route
   * @param options Routing options
   * @returns The result from the selected agent
   */
  async routeRequest(
    request: AgentRequest,
    options: RouterOptions = {}
  ): Promise<AgentResponse> {
    // Default options
    const strategy = options.strategy || AgentSelectionStrategy.FIRST_MATCH;
    const logRouting = options.logRouting !== false;
    const requireExactMatch = options.requireExactMatch === true;
    
    // Extract capability from request
    const capability = request.capability;
    
    if (!capability) {
      throw new Error('No capability specified in request');
    }
    
    // Find agents that can handle the capability
    let candidates = this.registry.findAgentsByCapability(capability);
    
    // If no exact matches found and we don't require an exact match, try fallback
    if (candidates.length === 0 && !requireExactMatch && options.fallbackCapability) {
      this.logger.info(`No agents found for capability '${capability}', trying fallback '${options.fallbackCapability}'`);
      candidates = this.registry.findAgentsByCapability(options.fallbackCapability);
    }
    
    // If still no candidates, throw an error
    if (candidates.length === 0) {
      throw new Error(`No agents found that can handle capability: ${capability}`);
    }
    
    // Apply agent type preferences if specified
    if (options.agentTypePreference && options.agentTypePreference.length > 0) {
      // Sort by preference (keeping only matching agents)
      const preferred = candidates.filter((entry: AgentRegistryEntry) => 
        options.agentTypePreference!.includes(entry.agentType)
      );
      
      // If we have preferred agents, use them, otherwise keep all candidates
      if (preferred.length > 0) {
        candidates = preferred.sort((a: AgentRegistryEntry, b: AgentRegistryEntry) => {
          const aIndex = options.agentTypePreference!.indexOf(a.agentType);
          const bIndex = options.agentTypePreference!.indexOf(b.agentType);
          return aIndex - bIndex;
        });
      }
    }
    
    // Select the best agent based on the strategy
    let selectedAgent: AgentRegistryEntry;
    
    switch (strategy) {
      case AgentSelectionStrategy.MOST_RECENTLY_USED:
        // Sort by last used time (most recent first)
        selectedAgent = candidates.sort((a: AgentRegistryEntry, b: AgentRegistryEntry) => {
          if (!a.lastUsedAt) return 1;
          if (!b.lastUsedAt) return -1;
          return b.lastUsedAt.getTime() - a.lastUsedAt.getTime();
        })[0];
        break;
        
      case AgentSelectionStrategy.LEAST_USED:
        // Sort by usage count (least used first)
        selectedAgent = candidates.sort((a: AgentRegistryEntry, b: AgentRegistryEntry) => a.usageCount - b.usageCount)[0];
        break;
        
      case AgentSelectionStrategy.HIGHEST_PRIORITY:
        // Sort by priority metadata if available
        if (options.priorityMetadataKey) {
          selectedAgent = candidates.sort((a: AgentRegistryEntry, b: AgentRegistryEntry) => {
            const aValue = a.metadata[options.priorityMetadataKey!] || 0;
            const bValue = b.metadata[options.priorityMetadataKey!] || 0;
            return bValue - aValue; // Higher values first
          })[0];
        } else {
          // Default to first match if no priority key
          selectedAgent = candidates[0];
        }
        break;
        
      case AgentSelectionStrategy.RANDOM:
        // Select a random agent
        selectedAgent = candidates[Math.floor(Math.random() * candidates.length)];
        break;
        
      case AgentSelectionStrategy.FIRST_MATCH:
      default:
        // Use the first matching agent
        selectedAgent = candidates[0];
        break;
    }
    
    if (logRouting) {
      this.logger.info(`Routing capability '${capability}' to agent: ${selectedAgent.agentName} (${selectedAgent.agentId})`);
    }
    
    // Track usage
    this.registry.trackAgentUsage(selectedAgent.id);
    
    // Execute the request
    return selectedAgent.instance.execute(request);
  }
  
  /**
   * Check if a capability can be handled by any registered agent
   * @param capability The capability to check
   */
  canHandleCapability(capability: string): boolean {
    return this.registry.findAgentsByCapability(capability).length > 0;
  }
  
  /**
   * Get all capabilities supported by registered agents
   */
  getSupportedCapabilities(): string[] {
    const capabilities = new Set<string>();
    
    this.registry.getAllAgents().forEach((entry: AgentRegistryEntry) => {
      entry.capabilities.forEach((cap: AgentCapability) => {
        capabilities.add(cap.name);
      });
    });
    
    return Array.from(capabilities);
  }
} 