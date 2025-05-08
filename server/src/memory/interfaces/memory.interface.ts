/**
 * Memory System Interfaces
 * Part of Milestone 2.2: Agent Memory System
 */

/**
 * Memory types for different kinds of agent memories
 */
export enum MemoryType {
  SHORT_TERM = 'short_term',
  EPISODIC = 'episodic',
  SEMANTIC = 'semantic',
  PROCEDURAL = 'procedural',
  WORKING = 'working',
}

/**
 * Memory storage types
 */
export enum MemoryStorageType {
  IN_MEMORY = 'in_memory',
  VECTOR_STORE = 'vector_store',
  KEY_VALUE = 'key_value',
  RELATIONAL = 'relational',
  GRAPH = 'graph',
  HYBRID = 'hybrid',
}

/**
 * Base memory interface
 */
export interface BaseMemory {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  type: MemoryType;
  agentId: string;
}

/**
 * Memory metadata for tracking and filtering
 */
export interface MemoryMetadata {
  importance: number; // 0-1 scale
  confidence: number; // 0-1 scale
  source?: string;
  context?: string;
  sessionId?: string;
  tags?: string[];
  [key: string]: any;
}

/**
 * Memory with content and metadata
 */
export interface Memory extends BaseMemory {
  content: any;
  metadata: MemoryMetadata;
  vectorEmbedding?: number[];
  expiresAt?: Date;
  accessCount?: number;
  lastAccessed?: Date;
}

/**
 * Short-term memory interface for conversation context
 */
export interface ConversationMemory extends Memory {
  type: MemoryType.SHORT_TERM;
  content: {
    messages: ConversationMessage[];
    participants: string[];
    topic?: string;
    startTime: Date;
    endTime?: Date;
  };
}

/**
 * Structure of a conversation message
 */
export interface ConversationMessage {
  id: string;
  sender: string;
  content: string;
  timestamp: Date;
  type: 'text' | 'image' | 'file' | 'action' | 'system';
  metadata?: Record<string, any>;
  replyTo?: string;
}

/**
 * Episodic memory for experiences and events
 */
export interface EpisodicMemory extends Memory {
  type: MemoryType.EPISODIC;
  content: {
    title: string;
    description: string;
    narrative: string;
    events: EpisodicEvent[];
    outcomes?: string[];
    participants?: string[];
    timeframe: {
      start: Date;
      end?: Date;
    };
  };
}

/**
 * Event within an episodic memory
 */
export interface EpisodicEvent {
  timestamp: Date;
  description: string;
  significance: number; // 0-1 scale
  agentIds?: string[];
  metadata?: Record<string, any>;
}

/**
 * Semantic memory for knowledge and facts
 */
export interface SemanticMemory extends Memory {
  type: MemoryType.SEMANTIC;
  content: {
    concept: string;
    description: string;
    domain: string;
    relationships: ConceptRelationship[];
    isVerified?: boolean;
    sourceReferences?: string[];
  };
}

/**
 * Relationship between concepts in semantic memory
 */
export interface ConceptRelationship {
  concept: string;
  relationshipType: string;
  relationshipStrength: number; // 0-1 scale
  bidirectional?: boolean;
  metadata?: Record<string, any>;
}

/**
 * Working memory for current task processing
 */
export interface WorkingMemory extends Memory {
  type: MemoryType.WORKING;
  content: {
    task: string;
    goal: string;
    context: any;
    progress: number; // 0-1 scale
    notes?: string[];
    resources?: string[];
    constraints?: string[];
    startTime: Date;
    deadline?: Date;
  };
}

/**
 * Procedural memory for skills and procedures
 */
export interface ProceduralMemory extends Memory {
  type: MemoryType.PROCEDURAL;
  content: {
    name: string;
    description: string;
    steps: ProcedureStep[];
    skillLevel: number; // 0-1 scale
    prerequisites?: string[];
    domain: string;
    usageCount?: number;
    successRate?: number;
  };
}

/**
 * Step in a procedural memory
 */
export interface ProcedureStep {
  order: number;
  description: string;
  expectedDuration?: number; // in seconds
  expectedOutcome?: string;
  isRequired: boolean;
  metadata?: Record<string, any>;
}

/**
 * Memory query parameters
 */
export interface MemoryQueryParams {
  agentId?: string;
  type?: MemoryType | MemoryType[];
  query?: string;
  tags?: string[];
  startDate?: Date;
  endDate?: Date;
  importanceThreshold?: number;
  confidenceThreshold?: number;
  similarityThreshold?: number;
  limit?: number;
  offset?: number;
  sortBy?: 'importance' | 'confidence' | 'createdAt' | 'updatedAt' | 'lastAccessed';
  sortDirection?: 'asc' | 'desc';
}

/**
 * Memory query results
 */
export interface MemoryQueryResults<T extends Memory = Memory> {
  items: T[];
  totalCount: number;
  hasMore: boolean;
  metadata?: {
    avgSimilarity?: number;
    executionTimeMs?: number;
    [key: string]: any;
  };
}

/**
 * Memory filtration options
 */
export interface MemoryFiltrationOptions {
  recencyWeight?: number; // 0-1, higher means more recent memories are more important
  importanceWeight?: number; // 0-1, higher means more important memories are prioritized
  relevanceWeight?: number; // 0-1, higher means more relevant memories are prioritized
  contextualWeight?: number; // 0-1, higher means context-matching memories are prioritized
  maxTokens?: number; // Maximum number of tokens to include in the filtered memories
  maxMemories?: number; // Maximum number of memories to return
  requiredTags?: string[]; // Tags that must be present
  excludedTags?: string[]; // Tags that must not be present
  includeMetadata?: boolean; // Whether to include metadata in the results
}

/**
 * Base interface for memory repositories
 */
export interface MemoryRepository<T extends Memory = Memory> {
  store(memory: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(id: string, updates: Partial<T>): Promise<T>;
  delete(id: string): Promise<boolean>;
  getById(id: string): Promise<T | null>;
  query(params: MemoryQueryParams): Promise<MemoryQueryResults<T>>;
  similaritySearch(text: string, params: Partial<MemoryQueryParams>): Promise<MemoryQueryResults<T>>;
}

/**
 * Interface for memory expertise tracking
 */
export interface ExpertiseTracker {
  trackMemoryUsage(memoryId: string, wasUseful: boolean): Promise<void>;
  getExpertiseDomains(agentId: string): Promise<{ domain: string; level: number }[]>;
  getTopExpertiseAgents(domain: string, limit?: number): Promise<{ agentId: string; level: number }[]>;
  updateAgentExpertise(agentId: string, domain: string, level: number): Promise<void>;
}

/**
 * Memory management service interface
 */
export interface MemoryManager {
  storeMemory<T extends Memory>(memory: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  retrieveMemory<T extends Memory>(id: string): Promise<T | null>;
  searchMemories<T extends Memory>(params: MemoryQueryParams): Promise<MemoryQueryResults<T>>;
  getRelevantMemories<T extends Memory>(
    context: string | object,
    options?: MemoryFiltrationOptions
  ): Promise<T[]>;
  forgetMemory(id: string): Promise<boolean>;
  associateMemories(sourceId: string, targetId: string, relationship: string): Promise<void>;
} 