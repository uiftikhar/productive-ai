/**
 * Capability Discovery Service
 *
 * Implements dynamic capability discovery, matching, and fallback mechanisms
 * to enable agents to discover and request new capabilities.
 */

import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { AgentRegistryService } from './agent-registry.service';
import {
  CapabilityLevel,
  CapabilityDescription,
  CapabilityRequest as StandardCapabilityRequest,
  CapabilityMatchResult,
  CapabilityDiscoveryOptions,
  ICapabilityDiscoveryService,
} from '../interfaces/capability-discovery.interface';

/**
 * Legacy request for a capability - will be replaced by StandardCapabilityRequest
 * @deprecated Use StandardCapabilityRequest from capability-discovery.interface.ts
 */
export interface CapabilityRequest {
  id: string;
  capability: string;
  requesterId: string;
  requestedAt: number;
  priority: 'low' | 'medium' | 'high';
  context?: Record<string, any>;
  reason?: string;
  status: 'pending' | 'fulfilled' | 'rejected';
  fulfillerId?: string;
  fulfilledAt?: number;
}

/**
 * Legacy capability match result - will be replaced by CapabilityMatchResult
 * @deprecated Use CapabilityMatchResult from capability-discovery.interface.ts
 */
export interface LegacyCapabilityMatchResult {
  capability: string;
  available: boolean;
  directMatch?: {
    agentId: string;
    confidence: number;
  };
  fallbacks?: Array<{
    capability: string;
    agentId: string;
    similarityScore: number;
  }>;
}

/**
 * Service for dynamic capability discovery and management
 * Implements standardized ICapabilityDiscoveryService interface
 */
export class CapabilityDiscoveryService implements ICapabilityDiscoveryService {
  private static instance: CapabilityDiscoveryService;
  private logger: Logger;
  private registry: AgentRegistryService;

  // In-memory store of capability requests
  private capabilityRequests: Map<string, StandardCapabilityRequest> =
    new Map();

  // Dynamic registry of capabilities with similarity mappings
  private capabilityRegistry: Map<
    string,
    {
      name: string;
      description: string;
      level: CapabilityLevel;
      parameters?: Record<string, any>;
      outputFormat?: string;
      requiresContext?: boolean;
      providers: string[];
      similarCapabilities: Array<{
        name: string;
        similarityScore: number;
      }>;
      requestedBy?: string[];
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
  ): CapabilityDiscoveryService {
    if (!CapabilityDiscoveryService.instance) {
      CapabilityDiscoveryService.instance = new CapabilityDiscoveryService(
        options,
      );
    }
    return CapabilityDiscoveryService.instance;
  }

  /**
   * Private constructor for singleton pattern
   */
  private constructor(
    options: {
      logger?: Logger;
      registry?: AgentRegistryService;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();
    this.registry = options.registry || AgentRegistryService.getInstance();

    // Initialize capability registry
    this.initializeCapabilityRegistry();

    this.logger.info('CapabilityDiscoveryService initialized');
  }

  /**
   * Initialize registry from registered agents
   */
  private initializeCapabilityRegistry(): void {
    const agents = this.registry.getAllAgents();

    // Collect capabilities from all agents
    agents.forEach((agent) => {
      const capabilities = agent.getCapabilities();

      capabilities.forEach((cap) => {
        if (!this.capabilityRegistry.has(cap.name)) {
          // Create new registry entry
          this.capabilityRegistry.set(cap.name, {
            name: cap.name,
            description: cap.description,
            level: CapabilityLevel.STANDARD, // Default level
            parameters: cap.parameters,
            providers: [agent.id],
            similarCapabilities: [],
            requestedBy: [],
          });
        } else {
          // Update existing entry
          const entry = this.capabilityRegistry.get(cap.name)!;
          if (!entry.providers.includes(agent.id)) {
            entry.providers.push(agent.id);
          }
        }
      });
    });

    // Build similarity mappings
    this.buildSimilarityMappings();

    this.logger.info('Capability registry initialized', {
      capabilities: this.capabilityRegistry.size,
    });
  }

  /**
   * Build mappings of similar capabilities for fallback mechanisms
   */
  private buildSimilarityMappings(): void {
    const capabilities = Array.from(this.capabilityRegistry.keys());

    // For each capability, calculate similarity to others
    capabilities.forEach((capabilityName) => {
      const entry = this.capabilityRegistry.get(capabilityName)!;
      const similarCapabilities: Array<{
        name: string;
        similarityScore: number;
      }> = [];

      capabilities.forEach((otherCapName) => {
        if (otherCapName === capabilityName) return;

        const otherEntry = this.capabilityRegistry.get(otherCapName)!;

        // Calculate similarity based on multiple factors:

        // 1. Name similarity (substring match)
        const nameSimilarity =
          capabilityName.includes(otherCapName) ||
          otherCapName.includes(capabilityName)
            ? 0.4
            : 0;

        // 2. Provider overlap
        const providerOverlap =
          entry.providers.filter((p) => otherEntry.providers.includes(p))
            .length / Math.max(entry.providers.length, 1);

        // 3. Word similarity in description
        const descWords = new Set(entry.description.toLowerCase().split(/\s+/));
        const otherDescWords = new Set(
          otherEntry.description.toLowerCase().split(/\s+/),
        );
        const wordOverlap =
          Array.from(descWords).filter((word) => otherDescWords.has(word))
            .length / Math.max(descWords.size, 1);

        // Combined similarity score
        const similarityScore =
          nameSimilarity + providerOverlap * 0.3 + wordOverlap * 0.3;

        // Only add if sufficiently similar
        if (similarityScore > 0.2) {
          similarCapabilities.push({
            name: otherCapName,
            similarityScore,
          });
        }
      });

      // Sort by similarity score and update entry
      similarCapabilities.sort((a, b) => b.similarityScore - a.similarityScore);
      entry.similarCapabilities = similarCapabilities;
    });
  }

  /**
   * Request a capability
   */
  public requestCapability(
    params: Omit<StandardCapabilityRequest, 'id' | 'requestedAt' | 'status'>,
  ): {
    requestId: string;
    matchResult: CapabilityMatchResult;
  } {
    const {
      capability,
      requesterId,
      priority = 'medium',
      reason,
      context,
    } = params;

    this.logger.info(`Capability requested: ${capability}`, {
      requesterId,
      priority,
    });

    // Check if capability exists and is available
    const matchResult = this.findCapabilityMatch({
      capability,
      fallbackStrategy: 'similar',
      context,
    });

    // Create and store the request
    const requestId = uuidv4();
    const request: StandardCapabilityRequest = {
      id: requestId,
      capability,
      requesterId,
      requestedAt: Date.now(),
      priority,
      reason,
      context,
      status: matchResult.available ? 'fulfilled' : 'pending',
      fulfillerId: matchResult.directMatch?.agentId,
      fulfilledAt: matchResult.available ? Date.now() : undefined,
    };

    this.capabilityRequests.set(requestId, request);

    // If capability doesn't exist in registry yet, add it
    if (!this.capabilityRegistry.has(capability)) {
      this.capabilityRegistry.set(capability, {
        name: capability,
        description: reason || `Requested by ${requesterId}`,
        level: CapabilityLevel.BASIC,
        providers: [],
        similarCapabilities: [],
        requestedBy: [requesterId],
      });

      // Rebuild similarity mappings
      this.buildSimilarityMappings();
    } else {
      // Update requestedBy list
      const entry = this.capabilityRegistry.get(capability)!;
      if (!entry.requestedBy) {
        entry.requestedBy = [requesterId];
      } else if (!entry.requestedBy.includes(requesterId)) {
        entry.requestedBy.push(requesterId);
      }
    }

    return {
      requestId,
      matchResult,
    };
  }

  /**
   * Find a match for a capability, including fallbacks
   */
  public findCapabilityMatch(
    options: CapabilityDiscoveryOptions,
  ): CapabilityMatchResult {
    const {
      capability,
      fallbackStrategy = 'similar',
      context,
      minConfidence = 0.5,
    } = options;

    // Check for direct capability match
    const directMatch = this.findDirectCapabilityMatch(capability, context);

    if (directMatch) {
      const entry = this.capabilityRegistry.get(capability)!;
      return {
        capability,
        available: true,
        directMatch: {
          agentId: directMatch,
          confidence: 1.0,
          level: entry.level || CapabilityLevel.STANDARD,
        },
      };
    }

    // If no direct match and fallbacks not wanted, return unavailable
    if (fallbackStrategy === 'none') {
      return {
        capability,
        available: false,
      };
    }

    // Find fallback options
    const fallbacks = this.findFallbackCapabilities(capability);

    // Filter fallbacks by minimum confidence if specified
    const validFallbacks = fallbacks
      .filter((fb) => fb.similarityScore >= minConfidence)
      .map((fb) => {
        const fbEntry = this.capabilityRegistry.get(fb.name)!;
        const provider = this.findDirectCapabilityMatch(fb.name, context)!;
        return {
          capability: fb.name,
          agentId: provider,
          similarityScore: fb.similarityScore,
          level: fbEntry.level || CapabilityLevel.STANDARD,
        };
      });

    return {
      capability,
      available: validFallbacks.length > 0,
      fallbacks: validFallbacks,
    };
  }

  /**
   * Find an agent with the exact capability
   */
  private findDirectCapabilityMatch(
    capability: string,
    context?: Record<string, any>,
  ): string | null {
    const entry = this.capabilityRegistry.get(capability);

    if (!entry || entry.providers.length === 0) {
      return null;
    }

    // For now, return the first available provider
    // This could be enhanced with a more sophisticated selection algorithm
    return entry.providers[0];
  }

  /**
   * Find fallback capabilities for a given capability
   */
  private findFallbackCapabilities(capability: string): Array<{
    name: string;
    similarityScore: number;
  }> {
    const entry = this.capabilityRegistry.get(capability);

    if (!entry) {
      return [];
    }

    return entry.similarCapabilities.filter((sc) => {
      // Ensure the similar capability has an agent that can provide it
      const provider = this.findDirectCapabilityMatch(sc.name);
      return provider !== null;
    });
  }

  /**
   * Register a new capability provider
   */
  public registerCapabilityProvider(
    agentId: string,
    capability: string,
    description: string,
    level: CapabilityLevel = CapabilityLevel.STANDARD,
  ): void {
    // Check if capability exists in registry
    if (!this.capabilityRegistry.has(capability)) {
      // Create new entry
      this.capabilityRegistry.set(capability, {
        name: capability,
        description,
        level,
        providers: [agentId],
        similarCapabilities: [],
        requestedBy: [],
      });
    } else {
      // Update existing entry
      const entry = this.capabilityRegistry.get(capability)!;
      if (!entry.providers.includes(agentId)) {
        entry.providers.push(agentId);
      }
      // Update level if the new provider has a higher level
      if (levelToValue(level) > levelToValue(entry.level)) {
        entry.level = level;
      }
    }

    // Update similarity mappings
    this.buildSimilarityMappings();

    this.logger.info(
      `Agent ${agentId} registered as provider for ${capability}`,
    );

    // Fulfill any pending requests
    this.fulfillPendingRequests(capability, agentId);
  }

  /**
   * Fulfill pending requests for a capability
   */
  private fulfillPendingRequests(capability: string, providerId: string): void {
    // Get all pending requests for this capability
    const pendingRequests = Array.from(this.capabilityRequests.values()).filter(
      (r) => r.status === 'pending' && r.capability === capability,
    );

    if (pendingRequests.length === 0) {
      return;
    }

    this.logger.info(
      `Fulfilling ${pendingRequests.length} pending requests for ${capability}`,
    );

    // Update requests to fulfilled
    pendingRequests.forEach((request) => {
      request.status = 'fulfilled';
      request.fulfillerId = providerId;
      request.fulfilledAt = Date.now();

      this.capabilityRequests.set(request.id, request);
    });
  }

  /**
   * Get all pending capability requests
   */
  public getPendingRequests(): StandardCapabilityRequest[] {
    return Array.from(this.capabilityRequests.values())
      .filter((r) => r.status === 'pending')
      .sort((a, b) => {
        // Sort by priority first
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        const priorityDiff =
          priorityOrder[a.priority] - priorityOrder[b.priority];

        if (priorityDiff !== 0) {
          return priorityDiff;
        }

        // Then by age (oldest first)
        return a.requestedAt - b.requestedAt;
      });
  }

  /**
   * Get capability details
   */
  public getCapabilityDetails(
    capability: string,
  ): CapabilityDescription | null {
    const entry = this.capabilityRegistry.get(capability);

    if (!entry) {
      return null;
    }

    return {
      name: entry.name,
      description: entry.description,
      level: entry.level || CapabilityLevel.STANDARD,
      parameters: entry.parameters,
      outputFormat: entry.outputFormat,
      requiresContext: entry.requiresContext,
      requestedBy: entry.requestedBy,
    };
  }

  /**
   * List all available capabilities
   */
  public listCapabilities(): CapabilityDescription[] {
    return Array.from(this.capabilityRegistry.entries()).map(
      ([name, entry]) => ({
        name,
        description: entry.description,
        level: entry.level || CapabilityLevel.STANDARD,
        parameters: entry.parameters,
        outputFormat: entry.outputFormat,
        requiresContext: entry.requiresContext,
        requestedBy: entry.requestedBy,
      }),
    );
  }
}

/**
 * Convert capability level to numeric value for comparison
 */
function levelToValue(level: CapabilityLevel): number {
  switch (level) {
    case CapabilityLevel.BASIC:
      return 1;
    case CapabilityLevel.STANDARD:
      return 2;
    case CapabilityLevel.ADVANCED:
      return 3;
    case CapabilityLevel.EXPERT:
      return 4;
    default:
      return 0;
  }
}
