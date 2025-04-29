/**
 * Agent Discovery Service
 *
 * This service discovers the most appropriate agent for a given task,
 * handles fallbacks, and manages capability requirements.
 *
 * v2.0: Enhanced with dynamic capability discovery and fallback mechanisms
 */

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { AgentRegistryService } from './agent-registry.service';
import {
  AgentCapability,
  AgentRequest,
  AgentResponse,
  BaseAgentInterface,
} from '../interfaces/base-agent.interface';
import { v4 as uuidv4 } from 'uuid';

/**
 * Agent discovery options
 */
export interface AgentDiscoveryOptions {
  capability: string;
  context?: Record<string, any>;
  excludedAgentIds?: string[];
  requiredCapabilities?: string[];
  preferredAgentId?: string;
  fallbackStrategy?: 'strict' | 'similar' | 'degraded';
}

/**
 * Agent discovery metrics
 */
export interface AgentDiscoveryMetrics {
  successRate: number;
  averageExecutionTimeMs: number;
  errorRate: number;
  usageCount: number;
  lastUsedTimestamp: number;
  totalScore: number;
}

/**
 * Agent discovery result
 */
export interface AgentDiscoveryResult {
  agentId: string;
  capability: string;
  metrics: AgentDiscoveryMetrics;
  fallbackDetails?: {
    originalCapability: string;
    fallbackType: 'similar' | 'degraded' | 'approximate';
    similarityScore?: number;
  };
  alternatives?: Array<{
    agentId: string;
    metrics: AgentDiscoveryMetrics;
  }>;
}

/**
 * Service for discovering the most appropriate agent for a given capability
 */
export class AgentDiscoveryService {
  private static instance: AgentDiscoveryService;
  private logger: Logger;
  private registry: AgentRegistryService;

  // Performance and reliability metrics for agents
  private agentMetrics: Map<string, Record<string, AgentDiscoveryMetrics>> =
    new Map();

  // Capability similarity mapping for fallbacks
  private capabilitySimilarity: Map<
    string,
    Array<{ similar: string; score: number }>
  > = new Map();

  // Capability registry for discovery
  private capabilityRegistry: Map<
    string,
    {
      description: string;
      parameters?: Record<string, any>;
      providers: string[];
      fallbacks?: string[];
    }
  > = new Map();

  /**
   * Get singleton instance
   */
  public static getInstance(
    options: {
      logger?: Logger;
      registry?: AgentRegistryService;
    } = {},
  ): AgentDiscoveryService {
    if (!AgentDiscoveryService.instance) {
      AgentDiscoveryService.instance = new AgentDiscoveryService(options);
    }
    return AgentDiscoveryService.instance;
  }

  /**
   * Private constructor (use getInstance)
   */
  private constructor(
    options: {
      logger?: Logger;
      registry?: AgentRegistryService;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.registry = options.registry || AgentRegistryService.getInstance();

    // Initialize capability registry from registered agents
    this.initializeCapabilityRegistry();
  }

  /**
   * Initialize capability registry from registered agents
   */
  private initializeCapabilityRegistry(): void {
    const agents = this.registry.getAllAgents();

    agents.forEach((agent) => {
      const capabilities = agent.getCapabilities();

      capabilities.forEach((capability) => {
        if (!this.capabilityRegistry.has(capability.name)) {
          this.capabilityRegistry.set(capability.name, {
            description: capability.description,
            parameters: capability.parameters,
            providers: [agent.id],
            fallbacks: [],
          });
        } else {
          const capabilityInfo = this.capabilityRegistry.get(capability.name)!;
          if (!capabilityInfo.providers.includes(agent.id)) {
            capabilityInfo.providers.push(agent.id);
          }
        }
      });
    });

    // Build similarity map for capabilities
    this.buildCapabilitySimilarityMap();

    this.logger.info('Capability registry initialized', {
      capabilityCount: this.capabilityRegistry.size,
    });
  }

  /**
   * Build a map of capability similarities for fallback mechanisms
   */
  private buildCapabilitySimilarityMap(): void {
    const capabilities = Array.from(this.capabilityRegistry.keys());

    // For each capability, find similar ones based on name and provider overlap
    capabilities.forEach((capability) => {
      const similarCapabilities: Array<{ similar: string; score: number }> = [];
      const capabilityInfo = this.capabilityRegistry.get(capability)!;

      capabilities.forEach((otherCapability) => {
        if (capability === otherCapability) return;

        const otherInfo = this.capabilityRegistry.get(otherCapability)!;

        // Calculate name similarity (simple substring check)
        const nameSimilarity =
          capability.includes(otherCapability) ||
          otherCapability.includes(capability)
            ? 0.5
            : 0;

        // Calculate provider overlap
        const providerOverlap =
          capabilityInfo.providers.filter((p) =>
            otherInfo.providers.includes(p),
          ).length /
          Math.max(capabilityInfo.providers.length, otherInfo.providers.length);

        // Calculate total similarity score
        const similarityScore = nameSimilarity + providerOverlap * 0.5;

        if (similarityScore > 0.3) {
          similarCapabilities.push({
            similar: otherCapability,
            score: similarityScore,
          });

          // Add as fallback if similarity is high
          if (
            similarityScore > 0.7 &&
            !capabilityInfo.fallbacks!.includes(otherCapability)
          ) {
            capabilityInfo.fallbacks!.push(otherCapability);
          }
        }
      });

      // Sort by score and store
      similarCapabilities.sort((a, b) => b.score - a.score);
      this.capabilitySimilarity.set(capability, similarCapabilities);
    });
  }

  /**
   * Discover the most appropriate agent for a capability
   */
  public discoverAgent(
    options: AgentDiscoveryOptions,
  ): AgentDiscoveryResult | null {
    this.logger.info('Discovering agent for capability', {
      capability: options.capability,
    });

    // Check if capability exists in registry
    if (!this.capabilityRegistry.has(options.capability)) {
      this.logger.warn('Unknown capability requested', {
        capability: options.capability,
      });

      // If similar capabilities are allowed, find a similar one
      if (
        options.fallbackStrategy === 'similar' ||
        options.fallbackStrategy === 'degraded'
      ) {
        return this.findSimilarCapability(options);
      }

      return null;
    }

    // Find all agents that have the capability
    const capableAgents = this.registry.findAgentsWithCapability(
      options.capability,
    );

    if (capableAgents.length === 0) {
      this.logger.warn('No agents found with capability', {
        capability: options.capability,
      });

      // Try fallback if enabled
      if (
        options.fallbackStrategy === 'similar' ||
        options.fallbackStrategy === 'degraded'
      ) {
        return this.findSimilarCapability(options);
      }

      return null;
    }

    // Filter out excluded agents
    const filteredAgents = options.excludedAgentIds
      ? capableAgents.filter(
          (agent) => !options.excludedAgentIds?.includes(agent.id),
        )
      : capableAgents;

    if (filteredAgents.length === 0) {
      this.logger.warn('All agents with capability were excluded', {
        capability: options.capability,
      });

      // Try fallback if enabled
      if (
        options.fallbackStrategy === 'similar' ||
        options.fallbackStrategy === 'degraded'
      ) {
        return this.findSimilarCapability({
          ...options,
          excludedAgentIds: [], // Clear exclusions for fallback
        });
      }

      return null;
    }

    // If there's a preferred agent that has the capability, use it
    if (options.preferredAgentId) {
      const preferredAgent = filteredAgents.find(
        (agent) => agent.id === options.preferredAgentId,
      );

      if (preferredAgent) {
        const metrics = this.getAgentMetrics(
          preferredAgent.id,
          options.capability,
        );

        return {
          agentId: preferredAgent.id,
          capability: options.capability,
          metrics,
        };
      }
    }

    // Score each agent
    const scoredAgents = filteredAgents.map((agent) => {
      const metrics = this.scoreAgent(agent, options);
      return { agent, metrics };
    });

    // Sort by total score (descending)
    scoredAgents.sort((a, b) => b.metrics.totalScore - a.metrics.totalScore);

    const bestAgent = scoredAgents[0];

    // Gather alternatives
    const alternatives = scoredAgents
      .slice(1, 4) // Get up to 3 alternatives
      .map(({ agent, metrics }) => ({
        agentId: agent.id,
        metrics,
      }));

    return {
      agentId: bestAgent.agent.id,
      capability: options.capability,
      metrics: bestAgent.metrics,
      alternatives: alternatives.length > 0 ? alternatives : undefined,
    };
  }

  /**
   * Find similar capability as fallback
   */
  private findSimilarCapability(
    options: AgentDiscoveryOptions,
  ): AgentDiscoveryResult | null {
    const originalCapability = options.capability;

    // Check for similar capabilities
    const similarCapabilities =
      this.capabilitySimilarity.get(originalCapability);

    if (!similarCapabilities || similarCapabilities.length === 0) {
      this.logger.warn('No similar capabilities found for fallback', {
        capability: originalCapability,
      });
      return null;
    }

    // Try each similar capability in order of similarity
    for (const { similar, score } of similarCapabilities) {
      const result = this.discoverAgent({
        ...options,
        capability: similar,
        fallbackStrategy: 'strict', // Prevent nested fallbacks
      });

      if (result) {
        return {
          ...result,
          fallbackDetails: {
            originalCapability,
            fallbackType: 'similar',
            similarityScore: score,
          },
        };
      }
    }

    // If degraded mode allowed, try finding any agent that has the most required capabilities
    if (
      options.fallbackStrategy === 'degraded' &&
      options.requiredCapabilities
    ) {
      return this.findDegradedCapabilityMatch(options);
    }

    return null;
  }

  /**
   * Find an agent that can handle most of the required capabilities
   * Used as last-resort fallback in degraded mode
   */
  private findDegradedCapabilityMatch(
    options: AgentDiscoveryOptions,
  ): AgentDiscoveryResult | null {
    if (
      !options.requiredCapabilities ||
      options.requiredCapabilities.length === 0
    ) {
      return null;
    }

    // Get all agents
    const allAgents = this.registry.getAllAgents();

    // Filter out excluded agents
    const candidateAgents = options.excludedAgentIds
      ? allAgents.filter(
          (agent) => !options.excludedAgentIds?.includes(agent.id),
        )
      : allAgents;

    // Score each agent by how many required capabilities they support
    const scoredAgents = candidateAgents.map((agent) => {
      const agentCapabilities = new Set(
        agent.getCapabilities().map((c) => c.name),
      );
      const matchedCapabilities = options.requiredCapabilities!.filter((cap) =>
        agentCapabilities.has(cap),
      );

      const coverageScore =
        matchedCapabilities.length / options.requiredCapabilities!.length;

      return {
        agent,
        matchedCapabilities,
        coverageScore,
      };
    });

    // Sort by coverage score
    scoredAgents.sort((a, b) => b.coverageScore - a.coverageScore);

    // Return best match if it covers at least some capabilities
    const bestMatch = scoredAgents[0];
    if (bestMatch && bestMatch.coverageScore > 0) {
      const metrics = this.getAgentMetrics(
        bestMatch.agent.id,
        options.capability,
      );

      return {
        agentId: bestMatch.agent.id,
        capability:
          bestMatch.matchedCapabilities.length > 0
            ? bestMatch.matchedCapabilities[0]
            : options.capability,
        metrics,
        fallbackDetails: {
          originalCapability: options.capability,
          fallbackType: 'degraded',
          similarityScore: bestMatch.coverageScore,
        },
      };
    }

    return null;
  }

  /**
   * Score an agent based on its metrics and context
   */
  private scoreAgent(
    agent: BaseAgentInterface,
    options: AgentDiscoveryOptions,
  ): AgentDiscoveryMetrics {
    const agentId = agent.id;
    const capability = options.capability;

    // Get existing metrics or create default
    const metrics = this.getAgentMetrics(agentId, capability);

    // Additional scoring factors
    let contextScore = 0;
    let capabilityMatchScore = 0;

    // If context is provided, check for affinity with this agent
    if (options.context) {
      // Check if agent has been used successfully with this conversationId before
      const conversationId = options.context.conversationId;
      if (
        conversationId &&
        this.agentMetrics.has(agentId) &&
        Object.entries(this.agentMetrics.get(agentId) || {}).some(
          ([cap, m]) =>
            m.usageCount > 0 &&
            options.context?.conversationHistory?.includes(agentId),
        )
      ) {
        contextScore += 0.2;
      }

      // Check if agent has required capabilities
      if (
        options.requiredCapabilities &&
        options.requiredCapabilities.length > 0
      ) {
        const agentCapabilities = new Set(
          agent.getCapabilities().map((c) => c.name),
        );
        const matchCount = options.requiredCapabilities.filter((c) =>
          agentCapabilities.has(c),
        ).length;
        capabilityMatchScore =
          (matchCount / options.requiredCapabilities.length) * 0.3;
      }
    }

    // Calculate total score
    // Weight: 30% success rate, 20% error rate, 20% speed, 10% usage, 20% context
    const totalScore =
      metrics.successRate * 0.3 +
      (1 - metrics.errorRate) * 0.2 +
      (1 - Math.min(metrics.averageExecutionTimeMs / 10000, 1)) * 0.2 +
      Math.min(metrics.usageCount / 100, 1) * 0.1 +
      contextScore +
      capabilityMatchScore;

    return {
      ...metrics,
      totalScore,
    };
  }

  /**
   * Get metrics for an agent + capability combination
   */
  private getAgentMetrics(
    agentId: string,
    capability: string,
  ): AgentDiscoveryMetrics {
    if (!this.agentMetrics.has(agentId)) {
      this.agentMetrics.set(agentId, {});
    }

    const agentCapabilityMetrics = this.agentMetrics.get(agentId) || {};

    if (!agentCapabilityMetrics[capability]) {
      // Default metrics for new agent/capability
      agentCapabilityMetrics[capability] = {
        successRate: 0.5, // Default 50% success
        averageExecutionTimeMs: 5000, // Default 5s execution
        errorRate: 0.1, // Default 10% errors
        usageCount: 0,
        lastUsedTimestamp: 0,
        totalScore: 0.5, // Default midpoint score
      };
    }

    return agentCapabilityMetrics[capability];
  }

  /**
   * Update metrics after agent execution
   */
  public updateMetrics(
    agentId: string,
    capability: string,
    result: {
      success: boolean;
      executionTimeMs: number;
      hasError?: boolean;
    },
  ): void {
    const metrics = this.getAgentMetrics(agentId, capability);

    // Calculate new values
    const newCount = metrics.usageCount + 1;
    const newSuccessRate =
      (metrics.successRate * metrics.usageCount + (result.success ? 1 : 0)) /
      newCount;
    const newErrorRate =
      (metrics.errorRate * metrics.usageCount + (result.hasError ? 1 : 0)) /
      newCount;
    const newAvgTime =
      (metrics.averageExecutionTimeMs * metrics.usageCount +
        result.executionTimeMs) /
      newCount;

    // Update metrics
    if (!this.agentMetrics.has(agentId)) {
      this.agentMetrics.set(agentId, {});
    }

    const agentCapabilityMetrics = this.agentMetrics.get(agentId) || {};
    agentCapabilityMetrics[capability] = {
      successRate: newSuccessRate,
      averageExecutionTimeMs: newAvgTime,
      errorRate: newErrorRate,
      usageCount: newCount,
      lastUsedTimestamp: Date.now(),
      totalScore: metrics.totalScore, // Will be recalculated on next discovery
    };

    this.logger.debug('Updated agent metrics', {
      agentId,
      capability,
      metrics: agentCapabilityMetrics[capability],
    });
  }

  /**
   * Register a capability to the registry
   */
  public registerCapability(
    capability: string,
    description: string,
    parameters?: Record<string, any>,
    fallbacks?: string[],
  ): void {
    if (!this.capabilityRegistry.has(capability)) {
      this.capabilityRegistry.set(capability, {
        description,
        parameters,
        providers: [],
        fallbacks: fallbacks || [],
      });

      this.logger.info(`Registered new capability: ${capability}`);
    } else {
      // Update existing capability
      const existing = this.capabilityRegistry.get(capability)!;
      existing.description = description;
      if (parameters) existing.parameters = parameters;
      if (fallbacks) existing.fallbacks = fallbacks;

      this.logger.info(`Updated existing capability: ${capability}`);
    }

    // Rebuild similarity map
    this.buildCapabilitySimilarityMap();
  }

  /**
   * Get all registered capabilities
   */
  public getCapabilities(): Array<{
    name: string;
    description: string;
    parameters?: Record<string, any>;
    providerCount: number;
  }> {
    return Array.from(this.capabilityRegistry.entries()).map(
      ([name, info]) => ({
        name,
        description: info.description,
        parameters: info.parameters,
        providerCount: info.providers.length,
      }),
    );
  }

  /**
   * Request a capability - even if it's not available yet
   * Returns discovery info if available, or registers a capability request
   */
  public requestCapability(
    options: AgentDiscoveryOptions & {
      requesterId: string;
      priority?: 'low' | 'medium' | 'high';
      reason?: string;
    },
  ): { available: boolean; discoveryResult?: AgentDiscoveryResult } {
    // Try to discover an agent with the capability
    const discoveryResult = this.discoverAgent(options);

    if (discoveryResult) {
      return {
        available: true,
        discoveryResult,
      };
    }

    // Register the capability request for future provisioning
    const requestId = uuidv4();

    this.logger.info(`Capability request registered: ${options.capability}`, {
      requestId,
      requesterId: options.requesterId,
      priority: options.priority || 'medium',
      reason: options.reason,
    });

    // Add to capability registry if not exists
    if (!this.capabilityRegistry.has(options.capability)) {
      this.registerCapability(
        options.capability,
        options.reason || `Requested by ${options.requesterId}`,
        undefined,
        options.fallbackStrategy === 'similar' ? [] : undefined,
      );
    }

    return { available: false };
  }

  /**
   * Reset metrics (for testing)
   */
  public resetMetrics(): void {
    this.agentMetrics.clear();
    this.logger.info('Agent discovery metrics reset');
  }

  /**
   * Find agents most suitable for a task based on its description
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  public async findAgentsForTask(taskDescription: string): Promise<BaseAgentInterface[]> {
    this.logger.info('Finding agents for task description', {
      description: taskDescription.substring(0, 100) + (taskDescription.length > 100 ? '...' : '')
    });
    
    // Get all available agents
    const allAgents = this.registry.getAllAgents();
    
    // For now, use a basic approach to find agents - later versions will use semantic matching
    const relevantAgents: Array<{agent: BaseAgentInterface, score: number}> = [];
    
    // Extract key terms from task description
    const terms = taskDescription.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(term => term.length > 3);
    
    for (const agent of allAgents) {
      let score = 0;
      const capabilities = agent.getCapabilities();
      
      // Check for capability match
      for (const capability of capabilities) {
        // Check capability name against task terms
        for (const term of terms) {
          if (capability.name.includes(term) || capability.description.toLowerCase().includes(term)) {
            score += 0.5;
          }
        }
        
        // Check agent name and description for relevance
        const agentName = agent.name.toLowerCase();
        const agentDescription = agent.description.toLowerCase();
        
        for (const term of terms) {
          if (agentName.includes(term)) {
            score += 0.3;
          }
          if (agentDescription.includes(term)) {
            score += 0.2;
          }
        }
      }
      
      // Add agent with score if it has any relevance
      if (score > 0) {
        relevantAgents.push({ agent, score });
      }
    }
    
    // Sort by score descending
    relevantAgents.sort((a, b) => b.score - a.score);
    
    // Return the agents, prioritizing those with higher scores
    return relevantAgents.map(item => item.agent);
  }
}
