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
}

/**
 * Capability request for dynamic capability discovery
 */
export interface CapabilityRequest {
  id: string; // Unique request ID
  capability: string; // Requested capability name
  requesterId: string; // ID of requesting agent
  requestedAt: number; // Timestamp when requested
  priority: 'low' | 'medium' | 'high'; // Priority level
  context?: Record<string, any>; // Context for the request
  reason?: string; // Reason for requesting
  status: 'pending' | 'fulfilled' | 'rejected' | 'redirected'; // Status
  fulfillerId?: string; // ID of fulfilling agent
  fulfilledAt?: number; // Timestamp when fulfilled
  expiresAt?: number; // Optional expiration timestamp
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
}

/**
 * Capability assessment from an agent
 */
export interface CapabilityAssessmentResult {
  capability: string; // Capability being assessed
  canHandle: boolean; // Whether agent can handle capability
  confidence: number; // Confidence level (0-1)
  reasoning: string; // Reasoning behind assessment
  limitationNotes?: string[]; // Notes about limitations
  alternativeCapabilities?: string[]; // Suggested alternatives
}

/**
 * Options for capability discovery
 */
export interface CapabilityDiscoveryOptions {
  capability: string; // Capability to discover
  requirements?: Record<string, any>; // Specific requirements
  fallbackStrategy?: 'none' | 'similar' | 'any'; // Fallback strategy
  minConfidence?: number; // Minimum confidence threshold
  context?: Record<string, any>; // Additional context
}

/**
 * Learning update about capabilities
 */
export interface CapabilityLearningUpdate {
  timestamp: number; // When the update occurred
  capability: string; // Capability being updated
  updateType:
    | 'new_capability'
    | 'improvement'
    | 'deprecation'
    | 'limitation_found';
  details: string; // Details about the update
  source: string; // Source of the update (e.g., agent ID)
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
}
