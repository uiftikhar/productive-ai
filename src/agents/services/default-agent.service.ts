import { ConsoleLogger } from '../../shared/logger/console-logger';
import { Logger } from '../../shared/logger/logger.interface';
import { BaseAgentInterface } from '../interfaces/base-agent.interface';
import { AgentRegistryService } from './agent-registry.service';
import { ClassifierResult } from '../interfaces/classifier.interface';

/**
 * Fallback metrics to track fallback occurrences and reasons
 */
export interface FallbackMetrics {
  /**
   * Total number of fallbacks that occurred
   */
  totalFallbacks: number;

  /**
   * Number of fallbacks due to low confidence
   */
  lowConfidenceFallbacks: number;

  /**
   * Number of fallbacks due to classifier errors
   */
  errorFallbacks: number;

  /**
   * Number of fallbacks due to missing agent
   */
  missingAgentFallbacks: number;

  /**
   * Average confidence score when fallback occurred
   */
  averageConfidenceAtFallback: number;

  /**
   * Array of recent fallback reasons (limited to last 100)
   */
  recentFallbackReasons: string[];

  /**
   * Distribution of fallbacks by intent (for analysis)
   */
  fallbacksByIntent: Record<string, number>;

  /**
   * Last update timestamp
   */
  lastUpdated: number;
}

/**
 * Configuration options for the DefaultAgentService
 */
export interface DefaultAgentServiceOptions {
  /**
   * Logger instance for service logs
   */
  logger?: Logger;

  /**
   * Default agent ID to use when no suitable agent is found
   */
  defaultAgentId?: string;

  /**
   * Minimum confidence threshold for accepting a classification
   * Any confidence below this will trigger the fallback
   * @default 0.6
   */
  confidenceThreshold?: number;

  /**
   * Maximum size of the recent fallback reasons array
   * @default 100
   */
  maxRecentReasons?: number;

  /**
   * AgentRegistryService instance for agent lookups
   */
  agentRegistry?: AgentRegistryService;
}

/**
 * DefaultAgentService
 *
 * Handles the selection of default agents when the classifier fails to
 * identify a suitable agent with sufficient confidence. Also tracks
 * fallback metrics for monitoring and optimization.
 */
export class DefaultAgentService {
  private static instance: DefaultAgentService;
  private logger: Logger;
  private defaultAgentId: string | null = null;
  private confidenceThreshold: number;
  private maxRecentReasons: number;
  private agentRegistry: AgentRegistryService;
  private metrics: FallbackMetrics;

  /**
   * Create a new DefaultAgentService
   */
  private constructor(options: DefaultAgentServiceOptions = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.defaultAgentId = options.defaultAgentId || null;
    this.confidenceThreshold = options.confidenceThreshold || 0.6;
    this.maxRecentReasons = options.maxRecentReasons || 100;
    this.agentRegistry =
      options.agentRegistry || AgentRegistryService.getInstance();

    // Initialize metrics
    this.metrics = {
      totalFallbacks: 0,
      lowConfidenceFallbacks: 0,
      errorFallbacks: 0,
      missingAgentFallbacks: 0,
      averageConfidenceAtFallback: 0,
      recentFallbackReasons: [],
      fallbacksByIntent: {},
      lastUpdated: Date.now(),
    };

    this.logger.info('DefaultAgentService initialized', {
      defaultAgentId: this.defaultAgentId,
      confidenceThreshold: this.confidenceThreshold,
    });
  }

  /**
   * Get the singleton instance of the service
   */
  public static getInstance(
    options?: DefaultAgentServiceOptions,
  ): DefaultAgentService {
    if (!DefaultAgentService.instance) {
      DefaultAgentService.instance = new DefaultAgentService(options);
    }
    return DefaultAgentService.instance;
  }

  /**
   * Set the default agent ID
   */
  setDefaultAgent(agentId: string): void {
    // Verify the agent exists in the registry
    const agent = this.agentRegistry.getAgent(agentId);
    if (!agent) {
      throw new Error(
        `Cannot set default agent: Agent with ID ${agentId} not found in registry`,
      );
    }

    this.defaultAgentId = agentId;
    this.logger.info(`Default agent set to: ${agentId}`);
  }

  /**
   * Get the current default agent
   */
  getDefaultAgent(): BaseAgentInterface | null {
    if (!this.defaultAgentId) {
      this.logger.warn('No default agent configured');
      return null;
    }

    return this.agentRegistry.getAgent(this.defaultAgentId) || null;
  }

  /**
   * Set the confidence threshold for fallback
   */
  setConfidenceThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Confidence threshold must be between 0 and 1');
    }

    this.confidenceThreshold = threshold;
    this.logger.info(`Confidence threshold set to: ${threshold}`);
  }

  /**
   * Process classification result and apply fallback logic if needed
   */
  processFallbackLogic(
    classifierResult: ClassifierResult,
    userQuery: string,
  ): ClassifierResult {
    // If a valid agent was selected with sufficient confidence, no fallback needed
    if (
      classifierResult.selectedAgentId &&
      classifierResult.confidence >= this.confidenceThreshold
    ) {
      return classifierResult;
    }

    let fallbackReason = '';
    let fallbackType = '';

    // Determine fallback reason
    if (!classifierResult.selectedAgentId) {
      fallbackReason = 'No agent selected by classifier';
      fallbackType = 'missingAgent';
      this.metrics.missingAgentFallbacks++;
    } else if (classifierResult.confidence < this.confidenceThreshold) {
      fallbackReason = `Low confidence (${classifierResult.confidence.toFixed(2)} < ${this.confidenceThreshold})`;
      fallbackType = 'lowConfidence';
      this.metrics.lowConfidenceFallbacks++;
    } else {
      fallbackReason = 'Unknown fallback reason';
      fallbackType = 'error';
      this.metrics.errorFallbacks++;
    }

    // Get the default agent
    const defaultAgent = this.getDefaultAgent();
    if (!defaultAgent) {
      this.logger.error('Fallback triggered but no default agent configured', {
        reason: fallbackReason,
        query: userQuery,
      });

      // Return the original result since we can't fallback
      return classifierResult;
    }

    // Update metrics
    this.metrics.totalFallbacks++;
    this.updateFallbackMetrics(classifierResult, fallbackReason);

    // Log the fallback
    this.logger.info('Fallback to default agent triggered', {
      reason: fallbackReason,
      originalAgent: classifierResult.selectedAgentId,
      confidence: classifierResult.confidence,
      defaultAgent: defaultAgent.id,
    });

    // Return a modified result with the default agent
    return {
      ...classifierResult,
      selectedAgentId: defaultAgent.id,
      confidence: 1.0, // We're certain about using the default agent
      reasoning: `${fallbackReason}. Falling back to default agent ${defaultAgent.name}.`,
      // Preserve other fields from the original classification
    };
  }

  /**
   * Update the fallback metrics
   */
  private updateFallbackMetrics(
    result: ClassifierResult,
    reason: string,
  ): void {
    // Update running average of confidence at fallback
    const prevTotal =
      this.metrics.averageConfidenceAtFallback *
      (this.metrics.totalFallbacks - 1);
    this.metrics.averageConfidenceAtFallback =
      (prevTotal + (result.confidence || 0)) / this.metrics.totalFallbacks;

    // Add to recent reasons (limited size)
    this.metrics.recentFallbackReasons.push(reason);
    if (this.metrics.recentFallbackReasons.length > this.maxRecentReasons) {
      this.metrics.recentFallbackReasons.shift(); // Remove oldest
    }

    // Track by intent if available
    if (result.intent) {
      this.metrics.fallbacksByIntent[result.intent] =
        (this.metrics.fallbacksByIntent[result.intent] || 0) + 1;
    }

    this.metrics.lastUpdated = Date.now();
  }

  /**
   * Get the current fallback metrics
   */
  getFallbackMetrics(): FallbackMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset the metrics (for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      totalFallbacks: 0,
      lowConfidenceFallbacks: 0,
      errorFallbacks: 0,
      missingAgentFallbacks: 0,
      averageConfidenceAtFallback: 0,
      recentFallbackReasons: [],
      fallbacksByIntent: {},
      lastUpdated: Date.now(),
    };

    this.logger.debug('Fallback metrics reset');
  }
}
