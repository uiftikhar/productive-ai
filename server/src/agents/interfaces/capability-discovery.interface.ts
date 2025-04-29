/**
 * Capability Discovery Interfaces
 *
 * Standardized interfaces for agent capability discovery, requests, and fallbacks.
 * These interfaces ensure consistent communication between agents about capabilities.
 */

/**
 * Capability level indicating how well an agent can perform a capability
 */
export enum CapabilityLevel {
  BASIC = 'basic', // Basic implementation, limited features
  STANDARD = 'standard', // Standard implementation with core features
  ADVANCED = 'advanced', // Advanced implementation with extended features
  EXPERT = 'expert', // Expert implementation with comprehensive features
}

/**
 * Capability taxonomy categories for organizing capabilities
 */
export enum CapabilityTaxonomy {
  // Core functions
  GENERATION = 'generation',
  REASONING = 'reasoning',
  MEMORY = 'memory',
  PERCEPTION = 'perception',
  PLANNING = 'planning',
  
  // Specialized domains
  DATA_ANALYSIS = 'data_analysis',
  CONTENT_CREATION = 'content_creation',
  CODE = 'code',
  RESEARCH = 'research',
  SUMMARIZATION = 'summarization',
  
  // Communication & coordination
  COMMUNICATION = 'communication',
  COORDINATION = 'coordination',
  SUPERVISION = 'supervision',
  DELEGATION = 'delegation',
  
  // Meta capabilities
  META_COGNITION = 'meta_cognition',
  SELF_IMPROVEMENT = 'self_improvement',
  
  // System integration
  TOOL_USE = 'tool_use',
  API_INTEGRATION = 'api_integration',
  
  // Other
  UNCATEGORIZED = 'uncategorized'
}

/**
 * Compatibility relationship between capabilities
 */
export interface CapabilityCompatibility {
  /**
   * Type of compatibility relationship
   */
  type: 'complementary' | 'prerequisite' | 'enhances' | 'conflicts';
  
  /**
   * Target capability name that this capability relates to
   */
  targetCapability: string;
  
  /**
   * Strength of the relationship (0-1)
   */
  strength: number;
  
  /**
   * Description of how these capabilities interact
   */
  description: string;
}

/**
 * Capability description including metadata
 */
export interface CapabilityDescription {
  name: string; // Unique capability name
  description: string; // Human-readable description
  level: CapabilityLevel; // Level of implementation
  parameters?: Record<string, any>; // Expected parameters
  outputFormat?: string; // Expected output format (e.g., "json", "text", etc.)
  requiresContext?: boolean; // Whether capability requires context
  requestedBy?: string[]; // IDs of agents that have requested this capability
  
  // Enhanced metadata for team formation
  taxonomy?: CapabilityTaxonomy[]; // Taxonomic categories
  compatibilities?: CapabilityCompatibility[]; // Compatibility relationships
  contextualRelevance?: Record<string, number>; // Relevance scores for different contexts
  teamRole?: string; // Primary team role this capability supports
}

/**
 * Status of a capability request
 */
export enum CapabilityRequestStatus {
  PENDING = 'pending',
  FULFILLED = 'fulfilled',
  REJECTED = 'rejected',
  EXPIRED = 'expired',
}

/**
 * Standardized capability request
 */
export interface CapabilityRequest {
  id: string; // Unique request ID
  capability: string; // Requested capability
  requesterId: string; // ID of the agent making the request
  parameters?: Record<string, any>; // Capability parameters
  requestedAt: number; // When this request was made
  priority: 'low' | 'medium' | 'high'; // Priority level
  reason?: string; // Reason for the request
  status: CapabilityRequestStatus; // Current status
  fallbackStrategy?: 'none' | 'similar' | 'any'; // Fallback strategy
  expiresAt?: number; // When this request expires (if applicable)
  
  // Team formation parameters
  teamContext?: {
    taskId?: string;
    teamId?: string;
    requiredRole?: string;
    complementaryTo?: string[]; // Capabilities this should complement
    workflow?: string; // Workflow this capability will be used in
  };
}

/**
 * Standardized capability request
 */
export type StandardCapabilityRequest = CapabilityRequest;

/**
 * Options for capability discovery
 */
export interface CapabilityDiscoveryOptions {
  capability: string; // Capability to discover
  requirements?: Record<string, any>; // Specific requirements
  fallbackStrategy?: 'none' | 'similar' | 'any'; // Fallback strategy
  minConfidence?: number; // Minimum confidence threshold
  context?: Record<string, any>; // Additional context
  
  // Team-oriented discovery options
  teamOptions?: {
    requiredCapabilities?: string[]; // Other capabilities required
    excludedAgentIds?: string[]; // Agents to exclude
    preferredAgentId?: string; // Preferred agent if available
    teamId?: string; // Team this agent will join
    role?: string; // Role the agent will play
    mustComplementCapabilities?: string[]; // Must complement these capabilities
  };
}

/**
 * Result of a capability match search
 */
export interface CapabilityMatchResult {
  capability: string; // Requested capability
  available: boolean; // Whether a match was found
  directMatch?: {
    // Direct capability match
    agentId: string;
    confidence: number;
    level: CapabilityLevel;
  };
  fallbacks?: Array<{
    // Fallback options
    capability: string;
    agentId: string;
    similarityScore: number;
    level: CapabilityLevel;
  }>;
  
  // Enhanced team matching information
  teamSuitability?: {
    roleCompatibility: number; // How well this matches the required role (0-1)
    complementarityScore: number; // How well it complements other capabilities (0-1)
    compositionFit: number; // Overall fit into the proposed team (0-1)
    alternatives: Array<{
      agentId: string;
      complementarityScore: number;
      compositionFit: number;
    }>;
  };
}

/**
 * Result of a multi-capability discovery operation
 */
export interface TeamCapabilityMatchResult {
  // Overall team match details
  success: boolean;
  coverageScore: number; // How well the discovered agents cover the required capabilities
  matchedCapabilities: number;
  totalCapabilities: number;
  
  // Individual agent matches
  agents: Array<{
    agentId: string;
    capabilities: string[];
    complementarityScore: number;
    role?: string;
  }>;
  
  // Missing capabilities
  missingCapabilities?: string[];
  
  // Suggested alternative teams if available
  alternatives?: TeamCapabilityMatchResult[];
}

/**
 * Registry of capabilities with similarity mappings
 */
export interface CapabilityRegistry {
  getCapabilityProviders(capability: string): string[];
  getSimilarCapabilities(
    capability: string,
  ): Array<{ name: string; score: number }>;
  hasCapability(capability: string): boolean;
  registerCapability(
    capability: CapabilityDescription,
    providerId: string,
  ): void;
  listCapabilities(): CapabilityDescription[];
  
  // Enhanced methods for team formation
  getCompatibleCapabilities(capability: string): Array<{ name: string; compatibilityType: string; score: number }>;
  getComplementaryCapabilities(capabilities: string[]): string[];
  getCapabilitiesByTaxonomy(taxonomy: CapabilityTaxonomy): string[];
}

/**
 * Interface for capability discovery service
 */
export interface ICapabilityDiscoveryService {
  requestCapability(
    params: Omit<CapabilityRequest, 'id' | 'requestedAt' | 'status'>,
  ): {
    requestId: string;
    matchResult: CapabilityMatchResult;
  };
  findCapabilityMatch(
    options: CapabilityDiscoveryOptions,
  ): CapabilityMatchResult;
  registerCapabilityProvider(
    agentId: string,
    capability: string,
    description: string,
    level?: CapabilityLevel,
  ): void;
  getPendingRequests(): CapabilityRequest[];
  getCapabilityDetails(capability: string): CapabilityDescription | null;
  listCapabilities(): CapabilityDescription[];
  
  // Enhanced methods for team formation
  findTeamForCapabilities(
    capabilities: string[],
    teamOptions?: {
      preferredAgentIds?: string[];
      excludedAgentIds?: string[];
      requireAllCapabilities?: boolean;
      maxTeamSize?: number;
    }
  ): TeamCapabilityMatchResult;
  
  getCapabilityCompatibility(
    capabilityA: string,
    capabilityB: string
  ): {
    compatible: boolean;
    complementarity: number;
    relationship?: string;
  };
  
  registerCapabilityCompatibility(
    sourceCapability: string,
    targetCapability: string,
    compatibility: CapabilityCompatibility
  ): void;
}

/**
 * Message for capability inquiry between agents
 */
export interface CapabilityInquiryMessage {
  messageType: 'capability_inquiry';
  inquiryId: string;
  fromAgentId: string;
  capability: string;
  context?: Record<string, any>;
  teamContext?: {
    taskId?: string;
    teamId?: string;
    requiredCapabilities?: string[];
    role?: string;
  };
  priority: 'low' | 'medium' | 'high';
  responseDeadline?: number; // Timestamp when response is needed by
}

/**
 * Message for capability inquiry response
 */
export interface CapabilityInquiryResponseMessage {
  messageType: 'capability_inquiry_response';
  inquiryId: string; // Matches the original inquiry ID
  fromAgentId: string;
  available: boolean;
  confidenceLevel: number; // 0-1 confidence in capability
  estimatedCompletion?: number; // Estimated time to complete (ms)
  constraints?: string[]; // Any constraints on capability execution
  alternativeCapabilities?: string[]; // Alternative capabilities offered
  commitmentLevel?: 'tentative' | 'firm' | 'guaranteed'; // Level of commitment
}

/**
 * Capability negotiation protocol message
 */
export type CapabilityNegotiationMessage = 
  CapabilityInquiryMessage | 
  CapabilityInquiryResponseMessage;
