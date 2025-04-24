import { ConsoleLogger } from '../../shared/logger/console-logger';
import { Logger } from '../../shared/logger/logger.interface';
import { AgentRegistryService } from './agent-registry.service';
import { BaseAgentInterface } from '../interfaces/base-agent.interface';

/**
 * Agent discovery metrics
 */
export interface AgentDiscoveryMetrics {
  capabilityScore: number;
  performanceScore: number;
  reliabilityScore: number;
  totalScore: number;
  lastUsed?: number;
  averageResponseTime?: number;
  successRate?: number;
}

/**
 * Agent discovery options
 */
export interface AgentDiscoveryOptions {
  capability: string;
  minCapabilityScore?: number;
  preferredAgentIds?: string[];
  excludedAgentIds?: string[];
  requiresStreaming?: boolean;
  performanceWeight?: number; // 0-1 weight for performance in scoring
  reliabilityWeight?: number; // 0-1 weight for reliability in scoring
}

/**
 * Agent discovery result
 */
export interface AgentDiscoveryResult {
  agentId: string;
  capability: string;
  metrics: AgentDiscoveryMetrics;
  alternatives?: Array<{ agentId: string; metrics: AgentDiscoveryMetrics }>;
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
   * Private constructor (singleton pattern)
   */
  private constructor(
    options: {
      logger?: Logger;
      registry?: AgentRegistryService;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.registry = options.registry || AgentRegistryService.getInstance();
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

    // Find all agents that have the capability
    const capableAgents = this.registry.findAgentsWithCapability(
      options.capability,
    );

    if (capableAgents.length === 0) {
      this.logger.warn('No agents found with capability', {
        capability: options.capability,
      });
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
      return null;
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
   * Score an agent based on capability matching and performance metrics
   */
  private scoreAgent(
    agent: BaseAgentInterface,
    options: AgentDiscoveryOptions,
  ): AgentDiscoveryMetrics {
    // Default weights if not provided
    const performanceWeight = options.performanceWeight ?? 0.3;
    const reliabilityWeight = options.reliabilityWeight ?? 0.3;
    const capabilityWeight = 1 - performanceWeight - reliabilityWeight;

    const storedMetrics = this.getAgentMetrics(agent.id, options.capability);

    let capabilityScore = 1.0; // Default perfect score

    // Preferred agents get a boost
    if (options.preferredAgentIds?.includes(agent.id)) {
      capabilityScore += 0.5;
    }

    const performanceScore = storedMetrics.performanceScore;

    const reliabilityScore = storedMetrics.reliabilityScore;

    const totalScore =
      capabilityScore * capabilityWeight +
      performanceScore * performanceWeight +
      reliabilityScore * reliabilityWeight;

    return {
      capabilityScore,
      performanceScore,
      reliabilityScore,
      totalScore,
      lastUsed: storedMetrics.lastUsed,
      averageResponseTime: storedMetrics.averageResponseTime,
      successRate: storedMetrics.successRate,
    };
  }

  /**
   * Get stored metrics for an agent and capability
   */
  private getAgentMetrics(
    agentId: string,
    capability: string,
  ): AgentDiscoveryMetrics {
    if (!this.agentMetrics.has(agentId)) {
      this.agentMetrics.set(agentId, {});
    }

    const agentMetricsMap = this.agentMetrics.get(agentId)!;

    if (!agentMetricsMap[capability]) {
      agentMetricsMap[capability] = {
        capabilityScore: 1.0,
        performanceScore: 0.8,
        reliabilityScore: 0.9,
        totalScore: 0.9,
        lastUsed: Date.now(),
        averageResponseTime: 500, // ms
        successRate: 0.95,
      };
    }

    return agentMetricsMap[capability];
  }

  /**
   * Update metrics for an agent after execution
   */
  public updateAgentMetrics(
    agentId: string,
    capability: string,
    metrics: {
      executionTime?: number;
      success?: boolean;
      error?: string;
    },
  ): void {
    const currentMetrics = this.getAgentMetrics(agentId, capability);
    const agentMetricsMap = this.agentMetrics.get(agentId)!;

    currentMetrics.lastUsed = Date.now();

    if (metrics.executionTime !== undefined) {
      // Simple moving average (could be improved with exponential moving average)
      if (currentMetrics.averageResponseTime === undefined) {
        currentMetrics.averageResponseTime = metrics.executionTime;
      } else {
        currentMetrics.averageResponseTime =
          0.7 * currentMetrics.averageResponseTime +
          0.3 * metrics.executionTime;
      }

      // Lower is better, scale between 0.5 and 1.0
      const maxResponseTime = 5000; // 5 seconds is considered slow
      currentMetrics.performanceScore = Math.max(
        0.5,
        1.0 - currentMetrics.averageResponseTime / maxResponseTime,
      );
    }

    if (metrics.success !== undefined) {
      if (currentMetrics.successRate === undefined) {
        currentMetrics.successRate = metrics.success ? 1.0 : 0.0;
      } else {
        currentMetrics.successRate =
          0.9 * currentMetrics.successRate +
          0.1 * (metrics.success ? 1.0 : 0.0);
      }

      currentMetrics.reliabilityScore = currentMetrics.successRate;
    }

    // Recalculate total score
    currentMetrics.totalScore =
      currentMetrics.capabilityScore * 0.4 +
      currentMetrics.performanceScore * 0.3 +
      currentMetrics.reliabilityScore * 0.3;

    // Save updated metrics
    agentMetricsMap[capability] = currentMetrics;
  }

  /**
   * Get metrics for all registered agents
   */
  public getAllAgentMetrics(): Record<
    string,
    Record<string, AgentDiscoveryMetrics>
  > {
    const result: Record<string, Record<string, AgentDiscoveryMetrics>> = {};

    this.agentMetrics.forEach((metrics, agentId) => {
      result[agentId] = { ...metrics };
    });

    return result;
  }

  /**
   * Reset metrics for testing
   */
  public resetMetrics(): void {
    this.agentMetrics.clear();
  }

  /**
   * Clean up resources used by the service.
   * This should be called when the service is no longer needed.
   */
  public cleanup(): void {
    // Clear metrics
    this.agentMetrics.clear();
    
    this.logger.info('AgentDiscoveryService resources cleaned up');
  }

  /**
   * Reset the singleton instance (for testing purposes)
   */
  public static resetInstance(): void {
    if (AgentDiscoveryService.instance) {
      AgentDiscoveryService.instance.cleanup();
      AgentDiscoveryService.instance = undefined as any;
    }
  }
}
