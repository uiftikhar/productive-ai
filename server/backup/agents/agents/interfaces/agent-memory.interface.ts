/**
 * @deprecated This module is deprecated and will be removed in a future version.
 * Use the new agentic meeting analysis system in /langgraph/agentic-meeting-analysis instead.
 */

/**
 * Agent Memory Interface
 *
 * Defines structures for agent's personal memory system, including episodic,
 * semantic, and procedural memory types, as well as memory operations.
 */

import { v4 as uuidv4 } from 'uuid';

/**
 * Types of memories that agents can store
 */
export enum AgentMemoryType {
  EPISODIC = 'episodic', // Experience-based memories (events, conversations, interactions)
  SEMANTIC = 'semantic', // Knowledge-based memories (facts, concepts, relationships)
  PROCEDURAL = 'procedural', // Skill-based memories (how to perform actions)
  WORKING = 'working', // Short-term active memory for current tasks
  REFLECTIVE = 'reflective', // Self-evaluation and insights about past performance
}

/**
 * Base memory interface for all memory types
 */
export interface BaseMemory {
  id: string;
  agentId: string;
  type: AgentMemoryType;
  createdAt: number;
  lastAccessed?: number;
  accessCount: number;
  importance: number; // 0-1 scale of memory importance
  confidence: number; // 0-1 scale of confidence in memory accuracy
  memoryStrength: number; // 0-1 scale representing how well-established the memory is
  decayRate?: number; // How quickly this memory fades if not accessed
  tags: string[]; // Categorization/retrieval tags
  metadata?: Record<string, any>;
}

/**
 * Episodic memory for experiences and events
 */
export interface EpisodicMemory extends BaseMemory {
  type: AgentMemoryType.EPISODIC;

  // Core experience data
  title: string;
  description: string;
  timestamp: number; // When the experience occurred
  duration?: number; // Duration in milliseconds, if applicable

  // Context of the experience
  location?: string;
  participants?: string[];
  relatedTaskIds?: string[];
  conversationId?: string;
  messageIds?: string[];

  // Structure of the episodic memory
  narrative: string; // Coherent narrative of what happened
  keyEvents: Array<{
    timestamp: number;
    description: string;
    significance: number; // 0-1 importance of this event
  }>;

  // Emotional and cognitive aspects
  emotional?: {
    valence: number; // -1 to 1 (negative to positive)
    arousal: number; // 0-1 (calm to excited)
    dominance: number; // 0-1 (submissive to dominant)
    emotions: string[]; // Named emotions experienced
  };

  // Learning and outcomes
  outcomes: string[];
  lessons?: string[];

  // Related memories
  relatedMemories?: string[];
}

/**
 * Semantic memory for knowledge and facts
 */
export interface SemanticMemory extends BaseMemory {
  type: AgentMemoryType.SEMANTIC;

  // Knowledge representation
  concept: string;
  content: string;
  format?: 'text' | 'json' | 'triplet' | 'embedding';

  // Relationship to other knowledge
  domain: string;
  category?: string;

  relatedConcepts: Array<{
    conceptId?: string; // Memory ID if it exists as formal memory
    concept: string;
    relationshipType: string;
    relationshipStrength: number; // 0-1 strength of relationship
  }>;

  // Provenance
  source?: string;
  isVerified: boolean;
  verificationMethod?: string;

  // Knowledge characteristics
  stability: number; // 0-1 how likely this knowledge is to change
  contradictoryMemories?: string[];

  // Context of application
  applicableContexts?: string[];
  contextRestrictions?: string[];
}

/**
 * Procedural memory for skills and methods
 */
export interface ProceduralMemory extends BaseMemory {
  type: AgentMemoryType.PROCEDURAL;

  // Skill/procedure identification
  name: string;
  description: string;

  // Performance details
  skillLevel: 'novice' | 'intermediate' | 'expert' | 'master';
  skillScore: number; // 0-1 quantified skill level

  // Procedure structure
  steps: Array<{
    order: number;
    description: string;
    isRequired: boolean;
    estimatedDuration?: number;
    commonErrors?: string[];
    alternatives?: Array<{
      description: string;
      conditions: string[];
    }>;
  }>;

  // Usage information
  usageCount: number;
  successRate: number;
  lastExecuted?: number;

  // Execution context
  triggerConditions?: string[];
  requiredResources?: string[];
  constraints?: string[];

  // Performance history
  executionHistory?: Array<{
    timestamp: number;
    duration: number;
    outcome: 'success' | 'partial' | 'failure';
    adaptations?: string[];
    context?: string;
  }>;
}

/**
 * Working memory for active task processing
 */
export interface WorkingMemory extends BaseMemory {
  type: AgentMemoryType.WORKING;

  // Content currently being processed
  focusedItems: Array<{
    id: string; // Unique identifier for this item
    content: any;
    type: string;
    priority: number; // 0-1 priority scale
    addedAt: number;
    lastProcessed?: number;
    expiresAt?: number; // When this should be dropped from working memory
  }>;

  // Capacity management
  capacity: number; // 0-1 representation of current capacity used
  maxCapacity: number; // Maximum number of items that can be held
  overflowBehavior: 'drop_oldest' | 'drop_lowest_priority' | 'consolidate';

  // State tracking
  currentGoal?: string;
  activeTaskId?: string;
  subgoals?: string[];

  // Control information
  attentionFocus?: {
    itemId: string;
    since: number;
    intensity: number; // 0-1 intensity of focus
  };

  // Context window
  contextWindow?: {
    recentEvents: Array<{
      timestamp: number;
      type: string;
      description: string;
    }>;
    environmentState?: Record<string, any>;
  };
}

/**
 * Reflective memory for self-evaluation and improvement
 */
export interface ReflectiveMemory extends BaseMemory {
  type: AgentMemoryType.REFLECTIVE;

  // Core reflection
  title: string;
  content: string;

  // Source of reflection
  reflectionTrigger:
    | 'scheduled'
    | 'outcome_based'
    | 'external_feedback'
    | 'internal_process';
  sourceExperiences: string[]; // IDs of related memories that were reflected upon

  // Insights and outcomes
  insights: string[];
  strengthsIdentified?: string[];
  weaknessesIdentified?: string[];

  // Improvement planning
  improvementActions?: Array<{
    description: string;
    priority: number; // 0-1 priority scale
    status: 'planned' | 'in_progress' | 'completed' | 'abandoned';
    result?: string;
  }>;

  // Metacognitive aspects
  confidenceAdjustment?: number; // How this reflection affected confidence (-1 to 1)
  strategyAdjustments?: Array<{
    strategy: string;
    adjustmentType: 'adopt' | 'avoid' | 'modify';
    reasoning: string;
  }>;
}

/**
 * Memory reference for linking memories together
 */
export interface MemoryReference {
  sourceMemoryId: string;
  targetMemoryId: string;
  relationshipType: string;
  strength: number; // 0-1 strength of the relationship
  createdAt: number;
  description?: string;
  bidirectional: boolean; // Whether the relationship is symmetric
}

/**
 * Memory query parameters for memory retrieval
 */
export interface MemoryQuery {
  agentId: string;
  types?: AgentMemoryType[];
  query?: string;
  relatedToMemories?: string[];
  tags?: string[];
  semanticSearch?: boolean;
  recency?: {
    after?: number;
    before?: number;
  };
  importanceThreshold?: number;
  confidenceThreshold?: number;
  limit?: number;
  includeForgotten?: boolean;
  includeReferences?: boolean;
  sortBy?: 'importance' | 'confidence' | 'recency' | 'relevance';
  sortDirection?: 'asc' | 'desc';
}

/**
 * Memory reinforcement or modification details
 */
export interface MemoryUpdate {
  operation: 'reinforce' | 'weaken' | 'modify' | 'connect' | 'consolidate';
  memoryId: string;
  reason: string;

  // For reinforce/weaken operations
  magnitudeChange?: number; // How much to adjust memory strength

  // For modify operations
  modifications?: Record<string, any>;

  // For connect operations
  connectionDetails?: {
    targetMemoryId: string;
    relationshipType: string;
    strength: number;
    bidirectional: boolean;
  };

  // For consolidate operations
  consolidationDetails?: {
    memoryIds: string[]; // Memories to consolidate
    preserveDetails: boolean;
    consolidationType: 'summarize' | 'extract_pattern' | 'generalize';
  };
}

/**
 * Memory query results
 */
export interface MemoryQueryResult {
  memories: Array<
    | EpisodicMemory
    | SemanticMemory
    | ProceduralMemory
    | WorkingMemory
    | ReflectiveMemory
  >;
  references?: MemoryReference[];
  totalCount: number;
  relevanceScores?: Record<string, number>;
}

/**
 * Memory statistics for an agent
 */
export interface MemoryStatistics {
  agentId: string;
  totalMemories: number;
  byType: Record<AgentMemoryType, number>;
  averageImportance: number;
  averageConfidence: number;
  topTags: Array<{ tag: string; count: number }>;
  memoryCreationRate: number; // Memories created per day
  memoryAccessRate: number; // Memory accesses per day
  activeMemoryEstimate: number; // Estimate of currently active memories
  currentWorkingMemoryUsage: number; // 0-1 scale
}

/**
 * Helper functions for creating memories
 */
export function createBaseMemory(
  agentId: string,
  type: AgentMemoryType,
  importance: number,
  confidence: number,
  tags: string[] = [],
): BaseMemory {
  return {
    id: uuidv4(),
    agentId,
    type,
    createdAt: Date.now(),
    accessCount: 0,
    importance,
    confidence,
    memoryStrength: 0.5, // Start at medium strength
    tags,
  };
}

export function createEpisodicMemory(
  agentId: string,
  title: string,
  description: string,
  narrative: string,
  keyEvents: EpisodicMemory['keyEvents'],
  outcomes: string[],
  importance: number,
  confidence: number,
  timestamp: number = Date.now(),
  tags: string[] = [],
): EpisodicMemory {
  const baseMemory = createBaseMemory(
    agentId,
    AgentMemoryType.EPISODIC,
    importance,
    confidence,
    tags,
  );
  return {
    ...baseMemory,
    type: AgentMemoryType.EPISODIC,
    title,
    description,
    timestamp,
    narrative,
    keyEvents,
    outcomes,
  };
}

export function createSemanticMemory(
  agentId: string,
  concept: string,
  content: string,
  domain: string,
  relatedConcepts: SemanticMemory['relatedConcepts'],
  importance: number,
  confidence: number,
  isVerified: boolean = false,
  tags: string[] = [],
): SemanticMemory {
  const baseMemory = createBaseMemory(
    agentId,
    AgentMemoryType.SEMANTIC,
    importance,
    confidence,
    tags,
  );
  return {
    ...baseMemory,
    type: AgentMemoryType.SEMANTIC,
    concept,
    content,
    domain,
    relatedConcepts,
    isVerified,
    stability: confidence * 0.8, // Stability correlates with confidence but not perfectly
  };
}

export function createProceduralMemory(
  agentId: string,
  name: string,
  description: string,
  steps: ProceduralMemory['steps'],
  skillLevel: ProceduralMemory['skillLevel'],
  skillScore: number,
  importance: number,
  confidence: number,
  tags: string[] = [],
): ProceduralMemory {
  const baseMemory = createBaseMemory(
    agentId,
    AgentMemoryType.PROCEDURAL,
    importance,
    confidence,
    tags,
  );
  return {
    ...baseMemory,
    type: AgentMemoryType.PROCEDURAL,
    name,
    description,
    steps,
    skillLevel,
    skillScore,
    usageCount: 0,
    successRate: 0.5, // Start with neutral success rate
  };
}
