/**
 * Capability Registry Service
 *
 * Service that manages a registry of capabilities and their providers
 */

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import {
  CapabilityDescription,
  CapabilityLevel,
  CapabilityRegistry,
  CapabilityTaxonomy,
  CapabilityCompatibility,
} from '../interfaces/capability-discovery.interface';
import { stringSimilarity } from 'string-similarity-js';
import { wordOverlap } from '../../utils/string.utils';

/**
 * Service that manages a registry of capabilities and their providers
 */
export class CapabilityRegistryService implements CapabilityRegistry {
  private static instance: CapabilityRegistryService;
  private logger: Logger;
  private readonly capabilityProviders: Map<string, Set<string>> = new Map();
  private readonly capabilities: Map<string, CapabilityDescription> = new Map();
  private readonly similarityMap: Map<
    string,
    Array<{ name: string; score: number }>
  > = new Map();
  private readonly compatibilityMap: Map<string, CapabilityCompatibility[]> =
    new Map();

  /**
   * Private constructor (singleton pattern)
   */
  private constructor(options: { logger?: Logger } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.logger.info('CapabilityRegistryService initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(
    options: { logger?: Logger } = {},
  ): CapabilityRegistryService {
    if (!CapabilityRegistryService.instance) {
      CapabilityRegistryService.instance = new CapabilityRegistryService(
        options,
      );
    }
    return CapabilityRegistryService.instance;
  }

  /**
   * Get the providers (agent IDs) for a specific capability
   */
  getCapabilityProviders(capability: string): string[] {
    const providers = this.capabilityProviders.get(capability);
    return providers ? Array.from(providers) : [];
  }

  /**
   * Get capabilities similar to the specified capability
   */
  getSimilarCapabilities(
    capability: string,
  ): Array<{ name: string; score: number }> {
    return this.similarityMap.get(capability) || [];
  }

  /**
   * Check if a capability exists in the registry
   */
  hasCapability(capability: string): boolean {
    return this.capabilityProviders.has(capability);
  }

  /**
   * Register a capability with a provider
   */
  registerCapability(
    capability: CapabilityDescription,
    providerId: string,
  ): void {
    const { name } = capability;

    // Store capability description
    if (!this.capabilities.has(name)) {
      this.capabilities.set(name, capability);
    } else {
      // Update existing capability with merged information
      const existing = this.capabilities.get(name)!;
      this.capabilities.set(name, {
        ...existing,
        ...capability,
        // Merge arrays and objects instead of replacing
        taxonomy: [
          ...new Set([
            ...(existing.taxonomy || []),
            ...(capability.taxonomy || []),
          ]),
        ],
        compatibilities: [
          ...(existing.compatibilities || []),
          ...(capability.compatibilities || []),
        ],
        contextualRelevance: {
          ...(existing.contextualRelevance || {}),
          ...(capability.contextualRelevance || {}),
        },
      });
    }

    // Store provider
    if (!this.capabilityProviders.has(name)) {
      this.capabilityProviders.set(name, new Set([providerId]));
    } else {
      this.capabilityProviders.get(name)!.add(providerId);
    }

    // Register compatibility relationships if provided
    if (capability.compatibilities && capability.compatibilities.length > 0) {
      capability.compatibilities.forEach((compatibility) => {
        this.registerCompatibilityRelationship(name, compatibility);
      });
    }

    this.logger.info(
      `Registered capability ${name} for provider ${providerId}`,
    );

    // Rebuild similarity map
    this.rebuildSimilarityMap();
  }

  /**
   * List all capabilities in the registry
   */
  listCapabilities(): CapabilityDescription[] {
    return Array.from(this.capabilities.values());
  }

  /**
   * Get capabilities that are compatible with the specified capability
   */
  getCompatibleCapabilities(capability: string): Array<{
    name: string;
    compatibilityType: string;
    score: number;
  }> {
    const compatibilities = this.compatibilityMap.get(capability) || [];

    return compatibilities.map((c) => ({
      name: c.targetCapability,
      compatibilityType: c.type,
      score: c.strength,
    }));
  }

  /**
   * Get capabilities that complement a set of existing capabilities
   */
  getComplementaryCapabilities(capabilities: string[]): string[] {
    const complementary = new Set<string>();
    const existingCapabilities = new Set(capabilities);

    // Look for complementary capabilities for each input capability
    capabilities.forEach((capability) => {
      const compatibilities = this.compatibilityMap.get(capability) || [];

      // Only include 'complementary' relationships
      compatibilities
        .filter(
          (c) =>
            c.type === 'complementary' &&
            !existingCapabilities.has(c.targetCapability),
        )
        .forEach((c) => complementary.add(c.targetCapability));
    });

    return Array.from(complementary);
  }

  /**
   * Get capabilities by taxonomy category
   */
  getCapabilitiesByTaxonomy(taxonomy: CapabilityTaxonomy): string[] {
    return Array.from(this.capabilities.entries())
      .filter(([_, desc]) => desc.taxonomy?.includes(taxonomy))
      .map(([name, _]) => name);
  }

  /**
   * Register a compatibility relationship between capabilities
   * @private
   */
  private registerCompatibilityRelationship(
    sourceCapability: string,
    compatibility: CapabilityCompatibility,
  ): void {
    // Create the compatibility map entry if it doesn't exist
    if (!this.compatibilityMap.has(sourceCapability)) {
      this.compatibilityMap.set(sourceCapability, []);
    }

    // Add the compatibility relationship
    const relationships = this.compatibilityMap.get(sourceCapability)!;

    // Check if this relationship already exists
    const existingIndex = relationships.findIndex(
      (r) =>
        r.targetCapability === compatibility.targetCapability &&
        r.type === compatibility.type,
    );

    if (existingIndex >= 0) {
      // Update existing relationship
      relationships[existingIndex] = {
        ...relationships[existingIndex],
        ...compatibility,
        // Take the highest strength value
        strength: Math.max(
          relationships[existingIndex].strength,
          compatibility.strength,
        ),
      };
    } else {
      // Add new relationship
      relationships.push(compatibility);
    }

    // For complementary and enhances relationships, create the reciprocal relationship
    if (
      compatibility.type === 'complementary' ||
      compatibility.type === 'enhances'
    ) {
      const reciprocalType = compatibility.type;

      if (!this.compatibilityMap.has(compatibility.targetCapability)) {
        this.compatibilityMap.set(compatibility.targetCapability, []);
      }

      const reciprocalRelationships = this.compatibilityMap.get(
        compatibility.targetCapability,
      )!;
      const existingRecipIndex = reciprocalRelationships.findIndex(
        (r) =>
          r.targetCapability === sourceCapability && r.type === reciprocalType,
      );

      if (existingRecipIndex >= 0) {
        // Update existing reciprocal relationship
        reciprocalRelationships[existingRecipIndex].strength = Math.max(
          reciprocalRelationships[existingRecipIndex].strength,
          compatibility.strength,
        );
      } else {
        // Add new reciprocal relationship
        reciprocalRelationships.push({
          type: reciprocalType,
          targetCapability: sourceCapability,
          strength: compatibility.strength,
          description: `Reciprocal ${reciprocalType} relationship with ${sourceCapability}`,
        });
      }
    }

    // For prerequisite relationships, create the inverse relationship
    if (compatibility.type === 'prerequisite') {
      if (!this.compatibilityMap.has(compatibility.targetCapability)) {
        this.compatibilityMap.set(compatibility.targetCapability, []);
      }

      const dependentRelationships = this.compatibilityMap.get(
        compatibility.targetCapability,
      )!;
      const existingDepIndex = dependentRelationships.findIndex(
        (r) =>
          r.targetCapability === sourceCapability && r.type === 'prerequisite',
      );

      if (existingDepIndex === -1) {
        // Add prerequisite dependency relationship
        dependentRelationships.push({
          type: 'prerequisite',
          targetCapability: sourceCapability,
          strength: compatibility.strength,
          description: `${sourceCapability} is required for ${compatibility.targetCapability}`,
        });
      }
    }
  }

  /**
   * Rebuilds the similarity map between capabilities
   * @private
   */
  private rebuildSimilarityMap(): void {
    const capabilities = Array.from(this.capabilities.keys());

    for (const capability of capabilities) {
      const similar: Array<{ name: string; score: number }> = [];

      for (const otherCapability of capabilities) {
        if (capability === otherCapability) continue;

        const score = this.calculateCapabilitySimilarity(
          capability,
          otherCapability,
        );

        if (score > 0.2) {
          similar.push({ name: otherCapability, score });
        }
      }

      // Sort by score
      similar.sort((a, b) => b.score - a.score);

      this.similarityMap.set(capability, similar);
    }
  }

  /**
   * Calculate similarity between two capabilities
   * @private
   */
  private calculateCapabilitySimilarity(capA: string, capB: string): number {
    // Name similarity (40%)
    const nameSimilarity = stringSimilarity(capA, capB);

    // Provider overlap (30%)
    const providersA = this.capabilityProviders.get(capA) || new Set();
    const providersB = this.capabilityProviders.get(capB) || new Set();
    const providerOverlap =
      providersA.size === 0 || providersB.size === 0
        ? 0
        : this.calculateSetOverlap(providersA, providersB);

    // Description word overlap (30%)
    const descA = this.capabilities.get(capA)?.description || '';
    const descB = this.capabilities.get(capB)?.description || '';
    const descriptionOverlap = wordOverlap(descA, descB);

    // Taxonomy overlap as bonus (10% bonus for matching taxonomies)
    const taxA = this.capabilities.get(capA)?.taxonomy || [];
    const taxB = this.capabilities.get(capB)?.taxonomy || [];
    const taxOverlapBonus =
      taxA.length && taxB.length
        ? this.calculateArrayOverlap(taxA, taxB) * 0.1
        : 0;

    // Calculate weighted score
    let score =
      nameSimilarity * 0.4 + providerOverlap * 0.3 + descriptionOverlap * 0.3;

    // Add taxonomy bonus without exceeding 1.0
    score = Math.min(1, score + taxOverlapBonus);

    return score;
  }

  /**
   * Calculate the overlap between two sets
   * @private
   */
  private calculateSetOverlap<T>(setA: Set<T>, setB: Set<T>): number {
    if (setA.size === 0 || setB.size === 0) return 0;

    let intersection = 0;
    for (const item of setA) {
      if (setB.has(item)) {
        intersection++;
      }
    }

    return intersection / Math.min(setA.size, setB.size);
  }

  /**
   * Calculate the overlap between two arrays
   * @private
   */
  private calculateArrayOverlap<T>(arrA: T[], arrB: T[]): number {
    if (arrA.length === 0 || arrB.length === 0) return 0;

    const setA = new Set(arrA);
    const setB = new Set(arrB);

    return this.calculateSetOverlap(setA, setB);
  }

  /**
   * Score a combination of capabilities based on complementarity
   * and overall composition strength
   */
  public scoreCapabilityCombination(capabilities: string[]): {
    compositionScore: number;
    complementarityScore: number;
    taxonomicCoverageScore: number;
    missingCriticalCapabilities: string[];
    suggestedAdditions: string[];
  } {
    if (capabilities.length === 0) {
      return {
        compositionScore: 0,
        complementarityScore: 0,
        taxonomicCoverageScore: 0,
        missingCriticalCapabilities: [],
        suggestedAdditions: [],
      };
    }

    // Evaluate complementarity between capabilities
    let totalComplementarityScore = 0;
    let relationshipCount = 0;

    // Check each pair of capabilities for complementary relationships
    for (let i = 0; i < capabilities.length; i++) {
      for (let j = i + 1; j < capabilities.length; j++) {
        const capA = capabilities[i];
        const capB = capabilities[j];

        // Skip if either capability doesn't exist
        if (!this.hasCapability(capA) || !this.hasCapability(capB)) {
          continue;
        }

        const compatibilitiesA = this.compatibilityMap.get(capA) || [];
        const complementaryRelationship = compatibilitiesA.find(
          (r) => r.targetCapability === capB && r.type === 'complementary',
        );

        if (complementaryRelationship) {
          totalComplementarityScore += complementaryRelationship.strength;
          relationshipCount++;
        }
      }
    }

    // Calculate complementarity score (average strength of complementary relationships)
    const complementarityScore =
      relationshipCount > 0 ? totalComplementarityScore / relationshipCount : 0;

    // Evaluate taxonomic coverage
    const taxonomies = new Set<CapabilityTaxonomy>();
    const relevantTaxonomies = Object.values(CapabilityTaxonomy).filter(
      (t) => t !== CapabilityTaxonomy.UNCATEGORIZED,
    );

    // Collect all taxonomies covered by these capabilities
    capabilities.forEach((cap) => {
      const capability = this.capabilities.get(cap);
      if (capability?.taxonomy) {
        capability.taxonomy.forEach((t) => taxonomies.add(t));
      }
    });

    // Calculate taxonomic coverage score
    const taxonomicCoverageScore =
      relevantTaxonomies.length > 0
        ? taxonomies.size / relevantTaxonomies.length
        : 0;

    // Identify missing critical capabilities
    const missingCriticalCapabilities: string[] = [];
    capabilities.forEach((cap) => {
      const compatibilities = this.compatibilityMap.get(cap) || [];

      // Find prerequisite relationships where the prerequisite is not in our set
      compatibilities
        .filter((r) => r.type === 'prerequisite')
        .forEach((r) => {
          if (!capabilities.includes(r.targetCapability)) {
            missingCriticalCapabilities.push(r.targetCapability);
          }
        });
    });

    // Suggest additional capabilities that would enhance the combination
    const suggestedAdditions = this.getComplementaryCapabilities(capabilities)
      // Sort by most complementary first
      .sort((a, b) => {
        let scoreA = 0;
        let scoreB = 0;

        capabilities.forEach((cap) => {
          const compatibilities = this.compatibilityMap.get(cap) || [];

          // Find relationship with capability A
          const relationshipA = compatibilities.find(
            (r) => r.targetCapability === a,
          );
          if (relationshipA && relationshipA.type === 'complementary') {
            scoreA += relationshipA.strength;
          }

          // Find relationship with capability B
          const relationshipB = compatibilities.find(
            (r) => r.targetCapability === b,
          );
          if (relationshipB && relationshipB.type === 'complementary') {
            scoreB += relationshipB.strength;
          }
        });

        return scoreB - scoreA;
      })
      // Take top 3 suggestions
      .slice(0, 3);

    // Calculate overall composition score
    // 60% complementarity, 30% taxonomic coverage, 10% penalty for missing critical capabilities
    const missingCriticalPenalty =
      missingCriticalCapabilities.length > 0
        ? 0.1 *
          Math.min(1, missingCriticalCapabilities.length / capabilities.length)
        : 0;

    const compositionScore = Math.max(
      0,
      0.6 * complementarityScore +
        0.3 * taxonomicCoverageScore -
        missingCriticalPenalty,
    );

    return {
      compositionScore,
      complementarityScore,
      taxonomicCoverageScore,
      missingCriticalCapabilities: [...new Set(missingCriticalCapabilities)],
      suggestedAdditions,
    };
  }

  /**
   * Find providers that can fulfill multiple capabilities
   * Performs optimal matching with weighted scoring
   */
  public findProvidersForCapabilities(params: {
    capabilities: string[];
    requiredCapabilities?: string[];
    preferredProviders?: string[];
    excludedProviders?: string[];
    contextualTaxonomies?: CapabilityTaxonomy[];
    maxProviders?: number;
    allowPartialMatches?: boolean;
  }): {
    success: boolean;
    coverageScore: number;
    providers: Array<{
      providerId: string;
      capabilities: string[];
      score: number;
    }>;
    unfulfilledCapabilities: string[];
    fulfilledCapabilities: string[];
  } {
    const {
      capabilities,
      requiredCapabilities = [],
      preferredProviders = [],
      excludedProviders = [],
      contextualTaxonomies = [],
      maxProviders = 5,
      allowPartialMatches = true,
    } = params;

    // Validate input
    if (capabilities.length === 0) {
      return {
        success: false,
        coverageScore: 0,
        providers: [],
        unfulfilledCapabilities: [],
        fulfilledCapabilities: [],
      };
    }

    // Create a map of capabilities to providers
    const capabilityProvidersMap = new Map<string, Set<string>>();
    capabilities.forEach((cap) => {
      const providers = this.getCapabilityProviders(cap).filter(
        (p) => !excludedProviders.includes(p),
      );
      capabilityProvidersMap.set(cap, new Set(providers));
    });

    // Create a map of providers to their capabilities
    const providerCapabilitiesMap = new Map<string, Set<string>>();
    const allProviders = new Set<string>();

    // Populate provider capabilities map
    for (const [capability, providers] of capabilityProvidersMap.entries()) {
      for (const provider of providers) {
        allProviders.add(provider);
        if (!providerCapabilitiesMap.has(provider)) {
          providerCapabilitiesMap.set(provider, new Set());
        }
        providerCapabilitiesMap.get(provider)!.add(capability);
      }
    }

    // Score each provider based on multiple criteria
    const scoredProviders = Array.from(allProviders)
      .map((providerId) => {
        const providerCapabilities =
          providerCapabilitiesMap.get(providerId) || new Set();
        const coveredCapabilities = Array.from(providerCapabilities);

        // Calculate base coverage score
        const coverageRatio = providerCapabilities.size / capabilities.length;

        // Calculate required capabilities coverage
        let requiredCoverage = 1.0;
        if (requiredCapabilities.length > 0) {
          const coveredRequired = requiredCapabilities.filter((cap) =>
            providerCapabilities.has(cap),
          ).length;
          requiredCoverage = coveredRequired / requiredCapabilities.length;
        }

        // Preferred provider bonus
        const preferredBonus = preferredProviders.includes(providerId)
          ? 0.1
          : 0;

        // Contextual relevance based on taxonomies
        let taxonomyRelevance = 0;
        if (contextualTaxonomies.length > 0) {
          const relevantCapabilitiesCount = coveredCapabilities.filter(
            (cap) => {
              const capability = this.capabilities.get(cap);
              if (!capability?.taxonomy) return false;
              return capability.taxonomy.some((t) =>
                contextualTaxonomies.includes(t),
              );
            },
          ).length;

          taxonomyRelevance =
            contextualTaxonomies.length > 0
              ? relevantCapabilitiesCount /
                Math.min(
                  coveredCapabilities.length,
                  contextualTaxonomies.length,
                )
              : 0;
        }

        // Calculate final score
        // 50% coverage, 30% required capability coverage, 10% taxonomy relevance, 10% preferred bonus
        const score =
          0.5 * coverageRatio +
          0.3 * requiredCoverage +
          0.1 * taxonomyRelevance +
          preferredBonus;

        return {
          providerId,
          capabilities: coveredCapabilities,
          score,
        };
      })
      .sort((a, b) => b.score - a.score);

    // Select the optimal set of providers to maximize coverage
    const selectedProviders: Array<{
      providerId: string;
      capabilities: string[];
      score: number;
    }> = [];

    const coveredCapabilities = new Set<string>();

    // First pass: select providers with highest scores until max providers
    // or all capabilities are covered
    for (const provider of scoredProviders) {
      if (selectedProviders.length >= maxProviders) break;

      // Check if this provider adds any new capabilities
      const newCapabilities = provider.capabilities.filter(
        (cap) => !coveredCapabilities.has(cap),
      );

      if (newCapabilities.length > 0) {
        selectedProviders.push(provider);
        newCapabilities.forEach((cap) => coveredCapabilities.add(cap));
      }

      // If we've covered all capabilities, we can stop
      if (coveredCapabilities.size === capabilities.length) break;
    }

    // Calculate final coverage
    const fulfilledCapabilities = Array.from(coveredCapabilities);
    const unfulfilledCapabilities = capabilities.filter(
      (cap) => !coveredCapabilities.has(cap),
    );

    // Check if we have fulfilled all required capabilities
    const allRequiredFulfilled = requiredCapabilities.every((cap) =>
      coveredCapabilities.has(cap),
    );

    // Calculate coverage score
    const coverageScore =
      capabilities.length > 0
        ? coveredCapabilities.size / capabilities.length
        : 0;

    // Check success criteria
    const success =
      coverageScore === 1.0 || // All capabilities covered
      (allowPartialMatches && allRequiredFulfilled); // Partial match allowed and all required covered

    return {
      success,
      coverageScore,
      providers: selectedProviders,
      unfulfilledCapabilities,
      fulfilledCapabilities,
    };
  }
}
