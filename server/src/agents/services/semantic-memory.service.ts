import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';

import {
  AgentMemoryType,
  SemanticMemory,
  MemoryQuery,
  MemoryQueryResult,
  MemoryReference,
  MemoryUpdate,
  createSemanticMemory,
} from '../interfaces/agent-memory.interface';

/**
 * Service for managing semantic memory - knowledge, concepts, and facts
 */
export class SemanticMemoryService {
  private memories: Map<string, SemanticMemory> = new Map();
  private references: Map<string, MemoryReference[]> = new Map();
  private agentMemories: Map<string, Set<string>> = new Map();
  private conceptIndex: Map<string, Set<string>> = new Map(); // concept -> memory IDs
  private domainIndex: Map<string, Set<string>> = new Map(); // domain -> memory IDs
  private readonly eventEmitter: EventEmitter;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);
  }

  /**
   * Create a new semantic memory
   */
  createMemory(
    agentId: string,
    concept: string,
    content: string,
    domain: string,
    relatedConcepts: SemanticMemory['relatedConcepts'],
    options: {
      category?: string;
      source?: string;
      isVerified?: boolean;
      verificationMethod?: string;
      stability?: number;
      applicableContexts?: string[];
      contextRestrictions?: string[];
      tags?: string[];
      importance?: number;
      confidence?: number;
      format?: 'text' | 'json' | 'triplet' | 'embedding';
    } = {},
  ): SemanticMemory {
    // Create the memory
    const memory = createSemanticMemory(
      agentId,
      concept,
      content,
      domain,
      relatedConcepts,
      options.importance || 0.5,
      options.confidence || 0.8,
      options.isVerified || false,
      options.tags || [],
    );

    // Add optional fields
    if (options.category) memory.category = options.category;
    if (options.source) memory.source = options.source;
    if (options.verificationMethod)
      memory.verificationMethod = options.verificationMethod;
    if (options.stability) memory.stability = options.stability;
    if (options.applicableContexts)
      memory.applicableContexts = options.applicableContexts;
    if (options.contextRestrictions)
      memory.contextRestrictions = options.contextRestrictions;
    if (options.format) memory.format = options.format;

    // Store the memory
    this.memories.set(memory.id, memory);

    // Track memory by agent
    this.trackAgentMemory(agentId, memory.id);

    // Update indexes
    this.indexMemory(memory);

    this.logger.info('Semantic memory created', {
      agentId,
      memoryId: memory.id,
      concept: memory.concept,
    });

    // Emit event
    this.eventEmitter.emit('memory.semantic.created', memory);

    return memory;
  }

  /**
   * Get a memory by ID
   */
  getMemory(memoryId: string): SemanticMemory | undefined {
    const memory = this.memories.get(memoryId);

    if (memory) {
      // Update access statistics
      memory.lastAccessed = Date.now();
      memory.accessCount += 1;
      this.memories.set(memoryId, memory);
    }

    return memory;
  }

  /**
   * Get all memories for an agent
   */
  getAgentMemories(agentId: string): SemanticMemory[] {
    const memoryIds = this.agentMemories.get(agentId) || new Set();
    const memories: SemanticMemory[] = [];

    for (const id of memoryIds) {
      const memory = this.memories.get(id);
      if (memory) {
        memories.push(memory);

        // Update access statistics
        memory.lastAccessed = Date.now();
        memory.accessCount += 1;
        this.memories.set(id, memory);
      }
    }

    return memories;
  }

  /**
   * Search for memories based on a query
   */
  searchMemories(query: MemoryQuery): MemoryQueryResult {
    // Filter memories that match the query
    const matchingMemories: SemanticMemory[] = [];

    // Get relevant memory IDs for the agent
    const agentMemoryIds = this.agentMemories.get(query.agentId) || new Set();

    for (const memoryId of agentMemoryIds) {
      const memory = this.memories.get(memoryId);

      if (!memory) continue;

      // Skip non-semantic memories if type is specified
      if (
        query.types &&
        query.types.length > 0 &&
        !query.types.includes(AgentMemoryType.SEMANTIC)
      ) {
        continue;
      }

      // Check importance threshold
      if (
        query.importanceThreshold !== undefined &&
        memory.importance < query.importanceThreshold
      ) {
        continue;
      }

      // Check confidence threshold
      if (
        query.confidenceThreshold !== undefined &&
        memory.confidence < query.confidenceThreshold
      ) {
        continue;
      }

      // Check tags
      if (query.tags && query.tags.length > 0) {
        if (!query.tags.some((tag) => memory.tags.includes(tag))) {
          continue;
        }
      }

      // Text-based search
      if (query.query) {
        const searchText = query.query.toLowerCase();

        // Search across multiple fields
        const searchableText = [
          memory.concept,
          memory.content,
          memory.domain,
          memory.category || '',
          ...memory.relatedConcepts.map((rc) => rc.concept),
        ]
          .join(' ')
          .toLowerCase();

        if (!searchableText.includes(searchText)) {
          continue;
        }
      }

      // Check related memories
      if (query.relatedToMemories && query.relatedToMemories.length > 0) {
        const memoryReferences = this.references.get(memoryId) || [];
        const relatedMemoryIds = memoryReferences.map((ref) =>
          ref.sourceMemoryId === memoryId
            ? ref.targetMemoryId
            : ref.sourceMemoryId,
        );

        if (
          !query.relatedToMemories.some((id) => relatedMemoryIds.includes(id))
        ) {
          continue;
        }
      }

      // Memory matches all criteria, add to results
      matchingMemories.push(memory);

      // Update access statistics
      memory.lastAccessed = Date.now();
      memory.accessCount += 1;
      this.memories.set(memoryId, memory);
    }

    // Sort results
    if (query.sortBy) {
      matchingMemories.sort((a, b) => {
        let comparison = 0;

        switch (query.sortBy) {
          case 'importance':
            comparison = a.importance - b.importance;
            break;
          case 'confidence':
            comparison = a.confidence - b.confidence;
            break;
          case 'recency':
            comparison = a.createdAt - b.createdAt;
            break;
          case 'relevance':
          default:
            // For relevance, we could implement more sophisticated scoring
            // For now, use a combination of importance and confidence
            comparison =
              a.importance * 0.5 +
              a.confidence * 0.5 -
              (b.importance * 0.5 + b.confidence * 0.5);
            break;
        }

        return query.sortDirection === 'desc' ? -comparison : comparison;
      });
    }

    // Apply limit
    let limitedResults = matchingMemories;
    if (query.limit && matchingMemories.length > query.limit) {
      limitedResults = matchingMemories.slice(0, query.limit);
    }

    // Build result object
    const result: MemoryQueryResult = {
      memories: limitedResults,
      totalCount: matchingMemories.length,
    };

    // Include references if requested
    if (query.includeReferences) {
      const allReferences: MemoryReference[] = [];

      for (const memory of limitedResults) {
        const memoryRefs = this.references.get(memory.id) || [];
        allReferences.push(...memoryRefs);
      }

      result.references = allReferences;
    }

    this.logger.debug('Semantic memory search performed', {
      agentId: query.agentId,
      matchCount: matchingMemories.length,
      returnedCount: limitedResults.length,
    });

    return result;
  }

  /**
   * Find memories by concept
   */
  findByConcept(
    agentId: string,
    concept: string,
    options: {
      exactMatch?: boolean;
      confidence?: number;
    } = {},
  ): SemanticMemory[] {
    const memories: SemanticMemory[] = [];

    // Get memory IDs related to this concept
    let memoryIds: Set<string> | undefined;

    if (options.exactMatch) {
      memoryIds = this.conceptIndex.get(concept.toLowerCase());
    } else {
      // Find similar concepts (this is a naive implementation)
      memoryIds = new Set<string>();

      for (const [indexedConcept, ids] of this.conceptIndex.entries()) {
        if (
          indexedConcept.includes(concept.toLowerCase()) ||
          concept.toLowerCase().includes(indexedConcept)
        ) {
          ids.forEach((id) => memoryIds!.add(id));
        }
      }
    }

    if (!memoryIds) {
      return [];
    }

    // Filter by agent
    const agentMemoryIds = this.agentMemories.get(agentId) || new Set();

    // Find intersection of agent memories and concept memories
    for (const memoryId of memoryIds) {
      if (agentMemoryIds.has(memoryId)) {
        const memory = this.memories.get(memoryId);

        if (
          memory &&
          (!options.confidence || memory.confidence >= options.confidence)
        ) {
          memories.push(memory);

          // Update access statistics
          memory.lastAccessed = Date.now();
          memory.accessCount += 1;
          this.memories.set(memoryId, memory);
        }
      }
    }

    return memories;
  }

  /**
   * Find memories by domain
   */
  findByDomain(agentId: string, domain: string): SemanticMemory[] {
    const memories: SemanticMemory[] = [];

    // Get memory IDs related to this domain
    const memoryIds = this.domainIndex.get(domain.toLowerCase()) || new Set();

    // Filter by agent
    const agentMemoryIds = this.agentMemories.get(agentId) || new Set();

    // Find intersection
    for (const memoryId of memoryIds) {
      if (agentMemoryIds.has(memoryId)) {
        const memory = this.memories.get(memoryId);

        if (memory) {
          memories.push(memory);

          // Update access statistics
          memory.lastAccessed = Date.now();
          memory.accessCount += 1;
          this.memories.set(memoryId, memory);
        }
      }
    }

    return memories;
  }

  /**
   * Update a memory
   */
  updateMemory(
    memoryId: string,
    updates: Partial<
      Omit<SemanticMemory, 'id' | 'agentId' | 'type' | 'createdAt'>
    >,
  ): SemanticMemory | undefined {
    const memory = this.memories.get(memoryId);

    if (!memory) {
      return undefined;
    }

    // Remove from indexes if concept or domain changes
    if (
      (updates.concept && updates.concept !== memory.concept) ||
      (updates.domain && updates.domain !== memory.domain)
    ) {
      this.removeFromIndexes(memory);
    }

    // Apply updates
    const updatedMemory: SemanticMemory = {
      ...memory,
      ...updates,
    };

    // Store updated memory
    this.memories.set(memoryId, updatedMemory);

    // Reindex if needed
    if (
      (updates.concept && updates.concept !== memory.concept) ||
      (updates.domain && updates.domain !== memory.domain)
    ) {
      this.indexMemory(updatedMemory);
    }

    this.logger.info('Semantic memory updated', {
      memoryId,
      agentId: memory.agentId,
      concept: updatedMemory.concept,
    });

    // Emit event
    this.eventEmitter.emit('memory.semantic.updated', updatedMemory);

    return updatedMemory;
  }

  /**
   * Link two concepts by creating references between their memories
   */
  linkConcepts(
    agentId: string,
    sourceConcept: string,
    targetConcept: string,
    relationshipType: string,
    strength: number = 0.8,
    bidirectional: boolean = true,
  ): boolean {
    // Find memories for these concepts
    const sourceMemories = this.findByConcept(agentId, sourceConcept, {
      exactMatch: true,
    });
    const targetMemories = this.findByConcept(agentId, targetConcept, {
      exactMatch: true,
    });

    if (sourceMemories.length === 0 || targetMemories.length === 0) {
      return false;
    }

    // Use the highest confidence memories for each concept
    const sourceMemory = sourceMemories.sort(
      (a, b) => b.confidence - a.confidence,
    )[0];
    const targetMemory = targetMemories.sort(
      (a, b) => b.confidence - a.confidence,
    )[0];

    // Create memory reference
    const reference: MemoryReference = {
      sourceMemoryId: sourceMemory.id,
      targetMemoryId: targetMemory.id,
      relationshipType,
      strength,
      createdAt: Date.now(),
      bidirectional,
    };

    // Store reference
    const sourceRefs = this.references.get(sourceMemory.id) || [];
    sourceRefs.push(reference);
    this.references.set(sourceMemory.id, sourceRefs);

    // Update related concepts in source memory
    const sourceConceptExists = sourceMemory.relatedConcepts.some(
      (rc) => rc.concept.toLowerCase() === targetConcept.toLowerCase(),
    );

    if (!sourceConceptExists) {
      sourceMemory.relatedConcepts.push({
        concept: targetConcept,
        relationshipType,
        relationshipStrength: strength,
      });

      this.memories.set(sourceMemory.id, sourceMemory);
    }

    // If bidirectional, update target memory too
    if (bidirectional) {
      const targetRefs = this.references.get(targetMemory.id) || [];
      targetRefs.push(reference);
      this.references.set(targetMemory.id, targetRefs);

      const targetConceptExists = targetMemory.relatedConcepts.some(
        (rc) => rc.concept.toLowerCase() === sourceConcept.toLowerCase(),
      );

      if (!targetConceptExists) {
        targetMemory.relatedConcepts.push({
          concept: sourceConcept,
          relationshipType: this.getReverseRelationship(relationshipType),
          relationshipStrength: strength,
        });

        this.memories.set(targetMemory.id, targetMemory);
      }
    }

    this.logger.debug('Concepts linked', {
      agentId,
      sourceConcept,
      targetConcept,
      relationshipType,
      bidirectional,
    });

    return true;
  }

  /**
   * Delete a memory
   */
  deleteMemory(memoryId: string): boolean {
    const memory = this.memories.get(memoryId);

    if (!memory) {
      return false;
    }

    // Remove from indexes
    this.removeFromIndexes(memory);

    // Remove from agent memories tracking
    const agentMemories = this.agentMemories.get(memory.agentId);
    if (agentMemories) {
      agentMemories.delete(memoryId);
      this.agentMemories.set(memory.agentId, agentMemories);
    }

    // Delete memory
    this.memories.delete(memoryId);

    // Delete references
    this.references.delete(memoryId);

    // Clean up references in other memories
    for (const [refId, refList] of this.references.entries()) {
      const updatedRefs = refList.filter(
        (ref) =>
          ref.sourceMemoryId !== memoryId && ref.targetMemoryId !== memoryId,
      );

      if (updatedRefs.length !== refList.length) {
        this.references.set(refId, updatedRefs);
      }
    }

    this.logger.info('Semantic memory deleted', {
      memoryId,
      agentId: memory.agentId,
      concept: memory.concept,
    });

    // Emit event
    this.eventEmitter.emit('memory.semantic.deleted', {
      memoryId,
      agentId: memory.agentId,
      concept: memory.concept,
    });

    return true;
  }

  /**
   * Subscribe to memory events
   */
  subscribe(
    eventType: 'created' | 'updated' | 'deleted',
    callback: (memory: any) => void,
  ): () => void {
    const eventName = `memory.semantic.${eventType}`;

    this.eventEmitter.on(eventName, callback);

    // Return unsubscribe function
    return () => {
      this.eventEmitter.off(eventName, callback);
    };
  }

  /**
   * Helper methods
   */

  /**
   * Track memory by agent ID
   */
  private trackAgentMemory(agentId: string, memoryId: string): void {
    const agentMemories = this.agentMemories.get(agentId) || new Set();
    agentMemories.add(memoryId);
    this.agentMemories.set(agentId, agentMemories);
  }

  /**
   * Index a memory for faster retrieval
   */
  private indexMemory(memory: SemanticMemory): void {
    // Index by concept
    const conceptKey = memory.concept.toLowerCase();
    const conceptMemories = this.conceptIndex.get(conceptKey) || new Set();
    conceptMemories.add(memory.id);
    this.conceptIndex.set(conceptKey, conceptMemories);

    // Index by domain
    const domainKey = memory.domain.toLowerCase();
    const domainMemories = this.domainIndex.get(domainKey) || new Set();
    domainMemories.add(memory.id);
    this.domainIndex.set(domainKey, domainMemories);
  }

  /**
   * Remove a memory from indexes
   */
  private removeFromIndexes(memory: SemanticMemory): void {
    // Remove from concept index
    const conceptKey = memory.concept.toLowerCase();
    const conceptMemories = this.conceptIndex.get(conceptKey);
    if (conceptMemories) {
      conceptMemories.delete(memory.id);
      if (conceptMemories.size === 0) {
        this.conceptIndex.delete(conceptKey);
      } else {
        this.conceptIndex.set(conceptKey, conceptMemories);
      }
    }

    // Remove from domain index
    const domainKey = memory.domain.toLowerCase();
    const domainMemories = this.domainIndex.get(domainKey);
    if (domainMemories) {
      domainMemories.delete(memory.id);
      if (domainMemories.size === 0) {
        this.domainIndex.delete(domainKey);
      } else {
        this.domainIndex.set(domainKey, domainMemories);
      }
    }
  }

  /**
   * Try to determine the reverse relationship type
   */
  private getReverseRelationship(relationship: string): string {
    // Map of common relationship types to their inverses
    const relationshipMap: Record<string, string> = {
      is_a: 'has_instance',
      has_instance: 'is_a',
      is_part_of: 'has_part',
      has_part: 'is_part_of',
      causes: 'is_caused_by',
      is_caused_by: 'causes',
      precedes: 'follows',
      follows: 'precedes',
      requires: 'is_required_by',
      is_required_by: 'requires',
    };

    return relationshipMap[relationship] || `inverse_of_${relationship}`;
  }
}
