/**
 * Types related to cognitive memory
 */

/**
 * Types of cognitive memories
 */
export enum MemoryType {
  EPISODIC = 'episodic', // Event or experience-based memory
  SEMANTIC = 'semantic', // Concept or knowledge-based memory
  PROCEDURAL = 'procedural', // Process or skill-based memory
}

/**
 * Structure for episodic memory context
 */
export interface EpisodicContext {
  /** When the episode occurred */
  timestamp: number;
  /** Type of episode (meeting, decision point, etc.) */
  episodeType: string;
  /** Sequence of related events with timestamps */
  timeline?: Array<{
    timestamp: number;
    event: string;
    actors?: string[];
  }>;
  /** Participants involved in this episode */
  participants?: string[];
  /** Outcomes or conclusions from this episode */
  outcomes?: string[];
  /** Emotional context surrounding this episode */
  emotionalContext?: {
    sentiment: 'positive' | 'negative' | 'neutral';
    intensity: number;
    description?: string;
  };
}

/**
 * Structure for semantic (concept) memory
 */
export interface SemanticStructure {
  /** Core concept represented */
  concept: string;
  /** Definition of the concept */
  definition: string;
  /** Related concepts */
  relatedConcepts?: Array<{
    concept: string;
    relationshipType: string;
    strength: number;
  }>;
  /** Examples of this concept */
  examples?: string[];
  /** Domain this concept belongs to */
  domain?: string;
  /** Specificity of this concept (0-1, higher = more specific) */
  specificity: number;
}

/**
 * Structure for procedural (process) memory
 */
export interface ProceduralSteps {
  /** Name of the procedure */
  procedure: string;
  /** Ordered steps in this procedure */
  steps: Array<{
    order: number;
    description: string;
    isRequired: boolean;
    estimatedDuration?: number;
  }>;
  /** What triggers this procedure */
  triggers?: string[];
  /** Expected outcomes of this procedure */
  outcomes?: string[];
  /** Common variations of this procedure */
  variations?: Array<{
    name: string;
    description: string;
    conditionForUse: string;
  }>;
}

/**
 * Memory-related metadata
 */
export interface MemoryMetadata {
  /** Type of cognitive memory */
  memoryType?: MemoryType;
  /** Strength of this memory (reinforcement level, 0-1) */
  memoryStrength?: number;
  /** Related memory IDs */
  memoryConnections?: string[];
  /** Context for episodic memories */
  episodicContext?: EpisodicContext;
  /** Structure for semantic memories */
  semanticStructure?: SemanticStructure;
  /** Steps for procedural memories */
  proceduralSteps?: ProceduralSteps;
}
