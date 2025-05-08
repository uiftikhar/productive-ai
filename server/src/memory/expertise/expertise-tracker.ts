/**
 * Expertise Tracking System
 * Part of Milestone 2.2: Agent Memory System
 */
import { v4 as uuidv4 } from 'uuid';
import { 
  ExpertiseTracker, 
  Memory, 
  MemoryRepository 
} from '../interfaces/memory.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Configuration for expertise tracking
 */
export interface ExpertiseTrackerConfig {
  defaultWeight?: number;
  learningRate?: number;
  forgettingRate?: number;
  expertiseThreshold?: number;
  maxLevel?: number;
  minTrackingEvents?: number;
  logger?: Logger;
}

/**
 * Expertise usage event
 */
export interface ExpertiseUsageEvent {
  id: string;
  agentId: string;
  memoryId: string;
  domain: string;
  wasUseful: boolean;
  timestamp: Date;
  context?: string;
}

/**
 * Agent expertise profile
 */
export interface AgentExpertiseProfile {
  agentId: string;
  domains: Map<string, AgentDomainExpertise>;
  overallLevel: number;
  totalUsageEvents: number;
  lastUpdated: Date;
}

/**
 * Agent expertise in a specific domain
 */
export interface AgentDomainExpertise {
  domain: string;
  level: number;
  successCount: number;
  failureCount: number;
  totalCount: number;
  successRate: number;
  recentTrend: number; // -1 to 1, negative means declining, positive means improving
  lastUsed: Date;
}

/**
 * Domain expertise statistics
 */
export interface DomainExpertiseStats {
  domain: string;
  averageLevel: number;
  expertCount: number; // Agents above expertiseThreshold
  topExperts: Array<{agentId: string; level: number}>;
  totalUsageEvents: number;
}

/**
 * Implementation of expertise tracking system
 */
export class ExpertiseTrackerService implements ExpertiseTracker {
  private config: ExpertiseTrackerConfig;
  private logger: Logger;
  private memoryRepository: MemoryRepository;
  
  // In-memory caches
  private expertiseProfiles: Map<string, AgentExpertiseProfile> = new Map();
  private usageEvents: ExpertiseUsageEvent[] = [];
  private domainStats: Map<string, DomainExpertiseStats> = new Map();
  private domainsByMemory: Map<string, string> = new Map();
  
  /**
   * Create a new expertise tracker service
   */
  constructor(
    memoryRepository: MemoryRepository,
    config: ExpertiseTrackerConfig = {}
  ) {
    this.memoryRepository = memoryRepository;
    
    this.config = {
      defaultWeight: 0.1,
      learningRate: 0.05,
      forgettingRate: 0.01,
      expertiseThreshold: 0.7,
      maxLevel: 1.0,
      minTrackingEvents: 5,
      ...config
    };
    
    this.logger = config.logger || new ConsoleLogger();
  }
  
  /**
   * Track memory usage by an agent
   */
  async trackMemoryUsage(
    memoryId: string,
    wasUseful: boolean
  ): Promise<void> {
    try {
      // Get the memory to determine domain and agent
      const memory = await this.memoryRepository.getById(memoryId);
      
      if (!memory) {
        this.logger.warn(`Cannot track expertise for unknown memory: ${memoryId}`);
        return;
      }
      
      // Determine domain from memory
      // First check cache
      let domain = this.domainsByMemory.get(memoryId);
      
      // If not in cache, extract from metadata or content
      if (!domain) {
        domain = this.extractDomainFromMemory(memory);
        
        // Cache it for future lookups
        if (domain) {
          this.domainsByMemory.set(memoryId, domain);
        } else {
          this.logger.debug(`Could not determine domain for memory: ${memoryId}`);
          return;
        }
      }
      
      // Record usage event
      const event: ExpertiseUsageEvent = {
        id: uuidv4(),
        agentId: memory.agentId,
        memoryId,
        domain,
        wasUseful,
        timestamp: new Date(),
        context: memory.metadata.context
      };
      
      this.usageEvents.push(event);
      
      // Limit size of usage events
      if (this.usageEvents.length > 10000) {
        this.usageEvents = this.usageEvents.slice(-10000);
      }
      
      // Update agent expertise profile
      await this.updateAgentExpertiseFromUsage(memory.agentId, domain, wasUseful);
      
      // Update domain stats
      this.updateDomainStats(domain);
      
      this.logger.debug(`Tracked expertise event for agent ${memory.agentId} in domain ${domain}`, {
        memoryId,
        wasUseful
      });
    } catch (error) {
      this.logger.error(`Error tracking memory usage: ${memoryId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Get expertise domains for an agent
   */
  async getExpertiseDomains(
    agentId: string
  ): Promise<{ domain: string; level: number }[]> {
    // Get profile from cache or create new one
    const profile = this.getAgentProfile(agentId);
    
    // Return domains with their expertise levels
    return Array.from(profile.domains.entries())
      .map(([domain, expertise]) => ({
        domain,
        level: expertise.level
      }))
      .filter(entry => entry.level > 0) // Only return domains with some expertise
      .sort((a, b) => b.level - a.level); // Sort by level descending
  }
  
  /**
   * Get top expertise agents for a domain
   */
  async getTopExpertiseAgents(
    domain: string,
    limit: number = 5
  ): Promise<{ agentId: string; level: number }[]> {
    // Find all agents with expertise in this domain
    const agentsWithExpertise: { agentId: string; level: number }[] = [];
    
    for (const [agentId, profile] of this.expertiseProfiles.entries()) {
      const domainExpertise = profile.domains.get(domain);
      
      if (domainExpertise && domainExpertise.level > 0) {
        agentsWithExpertise.push({
          agentId,
          level: domainExpertise.level
        });
      }
    }
    
    // Sort by expertise level and return top agents
    return agentsWithExpertise
      .sort((a, b) => b.level - a.level)
      .slice(0, limit);
  }
  
  /**
   * Update agent expertise level in a domain
   * Implementation of ExpertiseTracker interface method
   */
  async updateAgentExpertise(
    agentId: string,
    domain: string,
    level: number
  ): Promise<void> {
    // Get agent profile
    const profile = this.getAgentProfile(agentId);
    
    // Get domain expertise or create a new one
    let domainExpertise = profile.domains.get(domain);
    
    if (!domainExpertise) {
      // Create new domain expertise entry
      domainExpertise = {
        domain,
        level: 0,
        successCount: 0,
        failureCount: 0,
        totalCount: 0,
        successRate: 0,
        recentTrend: 0,
        lastUsed: new Date()
      };
      profile.domains.set(domain, domainExpertise);
    }
    
    // Set the expertise level directly
    domainExpertise.level = Math.max(0, Math.min(this.config.maxLevel!, level));
    
    // Update last used timestamp
    domainExpertise.lastUsed = new Date();
    
    // Update overall level
    this.updateOverallExpertiseLevel(profile);
    
    profile.lastUpdated = new Date();
    
    this.logger.debug(`Directly set expertise for agent ${agentId} in domain ${domain}`, {
      level: domainExpertise.level
    });
  }
  
  /**
   * Internal method to update agent expertise based on usage
   */
  private async updateAgentExpertiseFromUsage(
    agentId: string,
    domain: string,
    wasUseful: boolean
  ): Promise<void> {
    // Get agent profile
    const profile = this.getAgentProfile(agentId);
    
    // Get domain expertise
    let domainExpertise = profile.domains.get(domain);
    
    if (!domainExpertise) {
      // Create new domain expertise entry
      domainExpertise = {
        domain,
        level: 0,
        successCount: 0,
        failureCount: 0,
        totalCount: 0,
        successRate: 0,
        recentTrend: 0,
        lastUsed: new Date()
      };
      profile.domains.set(domain, domainExpertise);
    }
    
    // Update counts
    domainExpertise.totalCount++;
    if (wasUseful) {
      domainExpertise.successCount++;
    } else {
      domainExpertise.failureCount++;
    }
    
    domainExpertise.lastUsed = new Date();
    
    // Calculate success rate
    domainExpertise.successRate = domainExpertise.successCount / domainExpertise.totalCount;
    
    // Calculate recent trend
    const recentEvents = this.getRecentEvents(agentId, domain, 10);
    
    if (recentEvents.length >= 5) {
      const recentSuccessRate = recentEvents.filter(e => e.wasUseful).length / recentEvents.length;
      const overallSuccessRate = domainExpertise.successRate;
      domainExpertise.recentTrend = recentSuccessRate - overallSuccessRate;
    }
    
    // Update expertise level
    this.updateExpertiseLevel(domainExpertise, wasUseful);
    
    // Update overall level
    this.updateOverallExpertiseLevel(profile);
    
    profile.totalUsageEvents++;
    profile.lastUpdated = new Date();
    
    this.logger.debug(`Updated expertise for agent ${agentId} in domain ${domain}`, {
      level: domainExpertise.level,
      wasUseful,
      totalCount: domainExpertise.totalCount
    });
  }
  
  /**
   * Get an agent's expertise profile
   */
  getAgentProfile(agentId: string): AgentExpertiseProfile {
    let profile = this.expertiseProfiles.get(agentId);
    
    if (!profile) {
      // Create new profile
      profile = {
        agentId,
        domains: new Map(),
        overallLevel: 0,
        totalUsageEvents: 0,
        lastUpdated: new Date()
      };
      
      this.expertiseProfiles.set(agentId, profile);
    }
    
    return profile;
  }
  
  /**
   * Get recent usage events for an agent in a domain
   */
  getRecentEvents(
    agentId: string,
    domain: string,
    limit: number
  ): ExpertiseUsageEvent[] {
    return this.usageEvents
      .filter(event => 
        event.agentId === agentId && 
        event.domain === domain
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }
  
  /**
   * Update expertise level based on usage
   */
  private updateExpertiseLevel(
    expertise: AgentDomainExpertise,
    wasUseful: boolean
  ): void {
    // Don't update level until we have minimum number of events
    if (expertise.totalCount < this.config.minTrackingEvents!) {
      expertise.level = expertise.successRate; // Simple initialization
      return;
    }
    
    const learningRate = this.config.learningRate!;
    const forgettingRate = this.config.forgettingRate!;
    
    // Update level based on whether the usage was useful
    if (wasUseful) {
      // Increase expertise (with diminishing returns as it approaches max)
      const learningFactor = (this.config.maxLevel! - expertise.level) * learningRate;
      expertise.level += learningFactor;
    } else {
      // Decrease expertise
      expertise.level -= expertise.level * forgettingRate;
    }
    
    // Ensure level stays within bounds
    expertise.level = Math.max(0, Math.min(this.config.maxLevel!, expertise.level));
  }
  
  /**
   * Update overall expertise level for an agent
   */
  private updateOverallExpertiseLevel(profile: AgentExpertiseProfile): void {
    if (profile.domains.size === 0) {
      profile.overallLevel = 0;
      return;
    }
    
    // Calculate weighted average of domain expertise levels
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const [domain, expertise] of profile.domains.entries()) {
      // Weight by total count
      const weight = Math.min(1, expertise.totalCount / this.config.minTrackingEvents!);
      totalWeight += weight;
      weightedSum += expertise.level * weight;
    }
    
    if (totalWeight > 0) {
      profile.overallLevel = weightedSum / totalWeight;
    } else {
      profile.overallLevel = 0;
    }
  }
  
  /**
   * Update domain statistics
   */
  private updateDomainStats(domain: string): void {
    // Get all agents with expertise in this domain
    const agentsWithExpertise: { agentId: string; level: number }[] = [];
    let totalLevel = 0;
    let totalEvents = 0;
    
    for (const [agentId, profile] of this.expertiseProfiles.entries()) {
      const domainExpertise = profile.domains.get(domain);
      
      if (domainExpertise) {
        totalLevel += domainExpertise.level;
        totalEvents += domainExpertise.totalCount;
        
        if (domainExpertise.level > 0) {
          agentsWithExpertise.push({
            agentId,
            level: domainExpertise.level
          });
        }
      }
    }
    
    // Sort by expertise level
    agentsWithExpertise.sort((a, b) => b.level - a.level);
    
    // Count experts (agents above threshold)
    const expertCount = agentsWithExpertise.filter(
      a => a.level >= this.config.expertiseThreshold!
    ).length;
    
    // Update stats
    this.domainStats.set(domain, {
      domain,
      averageLevel: agentsWithExpertise.length > 0 
        ? totalLevel / agentsWithExpertise.length 
        : 0,
      expertCount,
      topExperts: agentsWithExpertise.slice(0, 5),
      totalUsageEvents: totalEvents
    });
  }
  
  /**
   * Extract domain from a memory
   */
  private extractDomainFromMemory(memory: Memory): string | undefined {
    // Try to get domain from metadata
    if (memory.metadata.domain) {
      return memory.metadata.domain as string;
    }
    
    // Try to get domain from tags
    if (memory.metadata.tags && memory.metadata.tags.length > 0) {
      // Look for domain-prefixed tags
      const domainTag = memory.metadata.tags.find(tag => tag.startsWith('domain:'));
      
      if (domainTag) {
        return domainTag.substring(7); // Remove 'domain:' prefix
      }
    }
    
    // Try to extract from semantic or procedural memories
    if ('content' in memory && typeof memory.content === 'object') {
      if ('domain' in memory.content && typeof memory.content.domain === 'string') {
        return memory.content.domain;
      }
    }
    
    // Default domain based on memory type
    return `type:${memory.type}`;
  }
  
  /**
   * Get domain expertise statistics
   */
  getDomainStats(domain: string): DomainExpertiseStats | undefined {
    return this.domainStats.get(domain);
  }
  
  /**
   * Get all domain expertise statistics
   */
  getAllDomainStats(): DomainExpertiseStats[] {
    return Array.from(this.domainStats.values());
  }
  
  /**
   * Get agent expertise information
   */
  getAgentExpertiseInfo(agentId: string): {
    overallLevel: number;
    topDomains: Array<{ domain: string; level: number; }>;
    totalDomains: number;
    expertDomainsCount: number;
  } {
    const profile = this.getAgentProfile(agentId);
    
    // Get domains sorted by expertise level
    const domains = Array.from(profile.domains.entries())
      .map(([domain, expertise]) => ({
        domain,
        level: expertise.level
      }))
      .sort((a, b) => b.level - a.level);
    
    // Count expert domains
    const expertDomainsCount = domains.filter(
      d => d.level >= this.config.expertiseThreshold!
    ).length;
    
    return {
      overallLevel: profile.overallLevel,
      topDomains: domains.slice(0, 5),
      totalDomains: profile.domains.size,
      expertDomainsCount
    };
  }
} 