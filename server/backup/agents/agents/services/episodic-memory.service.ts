import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';

import {
  AgentMemoryType,
  EpisodicMemory,
  MemoryQuery,
  MemoryQueryResult,
  MemoryReference,
  MemoryUpdate,
  createEpisodicMemory,
} from '../interfaces/agent-memory.interface';
import { Logger } from '../../shared/logger/logger.interface';

/**
 * Service for managing episodic memory - experiential, event-based memories
 */
export class EpisodicMemoryService {
  private memories: Map<string, EpisodicMemory> = new Map();
  private references: Map<string, MemoryReference[]> = new Map();
  private agentMemories: Map<string, Set<string>> = new Map();
  private readonly eventEmitter: EventEmitter;
  private readonly logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.eventEmitter = new EventEmitter();
    this.eventEmitter.setMaxListeners(100);
  }

  /**
   * Create a new episodic memory
   */
  createMemory(
    agentId: string,
    title: string,
    description: string,
    narrative: string,
    keyEvents: EpisodicMemory['keyEvents'],
    outcomes: string[],
    options: {
      timestamp?: number;
      duration?: number;
      location?: string;
      participants?: string[];
      relatedTaskIds?: string[];
      conversationId?: string;
      messageIds?: string[];
      emotional?: EpisodicMemory['emotional'];
      lessons?: string[];
      tags?: string[];
      importance?: number;
      confidence?: number;
    } = {},
  ): EpisodicMemory {
    // Create the memory
    const memory = createEpisodicMemory(
      agentId,
      title,
      description,
      narrative,
      keyEvents,
      outcomes,
      options.importance || 0.5,
      options.confidence || 0.8,
      options.timestamp || Date.now(),
      options.tags || [],
    );

    // Add optional fields
    if (options.duration) memory.duration = options.duration;
    if (options.location) memory.location = options.location;
    if (options.participants) memory.participants = options.participants;
    if (options.relatedTaskIds) memory.relatedTaskIds = options.relatedTaskIds;
    if (options.conversationId) memory.conversationId = options.conversationId;
    if (options.messageIds) memory.messageIds = options.messageIds;
    if (options.emotional) memory.emotional = options.emotional;
    if (options.lessons) memory.lessons = options.lessons;

    // Store the memory
    this.memories.set(memory.id, memory);

    // Track memory by agent
    this.trackAgentMemory(agentId, memory.id);

    this.logger.info('Episodic memory created', {
      agentId,
      memoryId: memory.id,
      title: memory.title,
    });

    // Emit event
    this.eventEmitter.emit('memory.episodic.created', memory);

    return memory;
  }

  /**
   * Get a memory by ID
   */
  getMemory(memoryId: string): EpisodicMemory | undefined {
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
  getAgentMemories(agentId: string): EpisodicMemory[] {
    const memoryIds = this.agentMemories.get(agentId) || new Set();
    const memories: EpisodicMemory[] = [];

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
    const matchingMemories: EpisodicMemory[] = [];

    // Get relevant memory IDs for the agent
    const agentMemoryIds = this.agentMemories.get(query.agentId) || new Set();

    for (const memoryId of agentMemoryIds) {
      const memory = this.memories.get(memoryId);

      if (!memory) continue;

      // Skip non-episodic memories if type is specified
      if (
        query.types &&
        query.types.length > 0 &&
        !query.types.includes(AgentMemoryType.EPISODIC)
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

      // Check recency constraints
      if (query.recency) {
        if (query.recency.after && memory.timestamp < query.recency.after) {
          continue;
        }

        if (query.recency.before && memory.timestamp > query.recency.before) {
          continue;
        }
      }

      // Check tags
      if (query.tags && query.tags.length > 0) {
        if (!query.tags.some((tag) => memory.tags.includes(tag))) {
          continue;
        }
      }

      // Text-based search (basic implementation - could be improved with embeddings)
      if (query.query) {
        const searchText = query.query.toLowerCase();

        // Search across multiple fields
        const searchableText = [
          memory.title,
          memory.description,
          memory.narrative,
          ...memory.keyEvents.map((e) => e.description),
          ...memory.outcomes,
          ...(memory.lessons || []),
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
            comparison = a.timestamp - b.timestamp;
            break;
          case 'relevance':
          default:
            // For relevance, we could implement more sophisticated scoring
            // For now, use a combination of importance and recency
            comparison =
              a.importance * 0.7 +
              a.timestamp * 0.3 -
              (b.importance * 0.7 + b.timestamp * 0.3);
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

    this.logger.debug('Episodic memory search performed', {
      agentId: query.agentId,
      matchCount: matchingMemories.length,
      returnedCount: limitedResults.length,
    });

    return result;
  }

  /**
   * Update a memory
   */
  updateMemory(
    memoryId: string,
    updates: Partial<
      Omit<EpisodicMemory, 'id' | 'agentId' | 'type' | 'createdAt'>
    >,
  ): EpisodicMemory | undefined {
    const memory = this.memories.get(memoryId);

    if (!memory) {
      return undefined;
    }

    // Apply updates
    const updatedMemory: EpisodicMemory = {
      ...memory,
      ...updates,
    };

    // Store updated memory
    this.memories.set(memoryId, updatedMemory);

    this.logger.info('Episodic memory updated', {
      memoryId,
      agentId: memory.agentId,
    });

    // Emit event
    this.eventEmitter.emit('memory.episodic.updated', updatedMemory);

    return updatedMemory;
  }

  /**
   * Apply memory update operations
   */
  updateMemoryState(update: MemoryUpdate): EpisodicMemory | undefined {
    const memory = this.memories.get(update.memoryId);

    if (!memory) {
      return undefined;
    }

    switch (update.operation) {
      case 'reinforce':
        // Strengthen the memory
        if (update.magnitudeChange) {
          memory.memoryStrength = Math.min(
            1,
            memory.memoryStrength + update.magnitudeChange,
          );
          this.memories.set(memory.id, memory);

          this.logger.debug('Memory reinforced', {
            memoryId: memory.id,
            newStrength: memory.memoryStrength,
          });
        }
        break;

      case 'weaken':
        // Weaken the memory
        if (update.magnitudeChange) {
          memory.memoryStrength = Math.max(
            0,
            memory.memoryStrength - update.magnitudeChange,
          );
          this.memories.set(memory.id, memory);

          this.logger.debug('Memory weakened', {
            memoryId: memory.id,
            newStrength: memory.memoryStrength,
          });
        }
        break;

      case 'modify':
        // Modify memory content
        if (update.modifications) {
          Object.assign(memory, update.modifications);
          this.memories.set(memory.id, memory);

          this.logger.debug('Memory modified', {
            memoryId: memory.id,
          });
        }
        break;

      case 'connect':
        // Create connection to another memory
        if (update.connectionDetails) {
          const { targetMemoryId, relationshipType, strength, bidirectional } =
            update.connectionDetails;

          // Check if target memory exists
          const targetMemory = this.memories.get(targetMemoryId);
          if (!targetMemory) {
            this.logger.warn('Cannot connect to non-existent memory', {
              sourceMemoryId: memory.id,
              targetMemoryId,
            });
            break;
          }

          // Create reference
          const reference: MemoryReference = {
            sourceMemoryId: memory.id,
            targetMemoryId,
            relationshipType,
            strength,
            createdAt: Date.now(),
            bidirectional,
          };

          // Store reference
          const sourceRefs = this.references.get(memory.id) || [];
          sourceRefs.push(reference);
          this.references.set(memory.id, sourceRefs);

          // Update related memories field
          if (!memory.relatedMemories) {
            memory.relatedMemories = [];
          }

          if (!memory.relatedMemories.includes(targetMemoryId)) {
            memory.relatedMemories.push(targetMemoryId);
            this.memories.set(memory.id, memory);
          }

          // If bidirectional, update target memory too
          if (bidirectional) {
            const targetRefs = this.references.get(targetMemoryId) || [];
            targetRefs.push(reference);
            this.references.set(targetMemoryId, targetRefs);

            if (!targetMemory.relatedMemories) {
              targetMemory.relatedMemories = [];
            }

            if (!targetMemory.relatedMemories.includes(memory.id)) {
              targetMemory.relatedMemories.push(memory.id);
              this.memories.set(targetMemoryId, targetMemory);
            }
          }

          this.logger.debug('Memory connection created', {
            sourceMemoryId: memory.id,
            targetMemoryId,
            relationshipType,
            bidirectional,
          });
        }
        break;

      case 'consolidate':
        // Consolidate multiple memories (not applicable for a single memory update)
        this.logger.warn(
          'Memory consolidation requires multiple memories, not applied',
          {
            memoryId: memory.id,
          },
        );
        break;
    }

    // Emit event
    this.eventEmitter.emit('memory.episodic.stateUpdated', {
      memory,
      updateType: update.operation,
      reason: update.reason,
    });

    return memory;
  }

  /**
   * Delete a memory
   */
  deleteMemory(memoryId: string): boolean {
    const memory = this.memories.get(memoryId);

    if (!memory) {
      return false;
    }

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

    this.logger.info('Episodic memory deleted', {
      memoryId,
      agentId: memory.agentId,
    });

    // Emit event
    this.eventEmitter.emit('memory.episodic.deleted', {
      memoryId,
      agentId: memory.agentId,
    });

    return true;
  }

  /**
   * Subscribe to memory events
   */
  subscribe(
    eventType: 'created' | 'updated' | 'stateUpdated' | 'deleted',
    callback: (memory: any) => void,
  ): () => void {
    const eventName = `memory.episodic.${eventType}`;

    this.eventEmitter.on(eventName, callback);

    // Return unsubscribe function
    return () => {
      this.eventEmitter.off(eventName, callback);
    };
  }

  /**
   * Track memory by agent ID
   */
  private trackAgentMemory(agentId: string, memoryId: string): void {
    const agentMemories = this.agentMemories.get(agentId) || new Set();
    agentMemories.add(memoryId);
    this.agentMemories.set(agentId, agentMemories);
  }

  /**
   * Apply memory decay effects
   * This would typically be called periodically to simulate memory fading
   */
  applyMemoryDecay(decayFactor: number = 0.01): void {
    const now = Date.now();

    for (const [memoryId, memory] of this.memories.entries()) {
      // Skip recently accessed memories
      if (
        memory.lastAccessed &&
        now - memory.lastAccessed < 24 * 60 * 60 * 1000
      ) {
        continue;
      }

      // Apply decay based on memory's decay rate or default factor
      const decayRate = memory.decayRate || decayFactor;
      const newStrength = Math.max(0, memory.memoryStrength - decayRate);

      // Update memory strength
      if (newStrength !== memory.memoryStrength) {
        memory.memoryStrength = newStrength;
        this.memories.set(memoryId, memory);
      }
    }

    this.logger.debug('Memory decay applied', { factor: decayFactor });
  }

  /**
   * Get a summary of agent's emotional state based on recent memories
   */
  getEmotionalSummary(
    agentId: string,
    timeWindow?: number,
  ): {
    dominantEmotions: string[];
    valence: number;
    arousal: number;
    dominance: number;
  } {
    const agentMemories = this.getAgentMemories(agentId);

    // Filter recent memories
    const cutoffTime = timeWindow ? Date.now() - timeWindow : 0;
    const recentMemories = agentMemories.filter(
      (m) => m.timestamp > cutoffTime,
    );

    // Extract emotional data
    const emotionalMemories = recentMemories.filter((m) => m.emotional);

    if (emotionalMemories.length === 0) {
      return {
        dominantEmotions: [],
        valence: 0,
        arousal: 0,
        dominance: 0,
      };
    }

    // Calculate averages
    let totalValence = 0;
    let totalArousal = 0;
    let totalDominance = 0;
    const emotionCounts: Record<string, number> = {};

    for (const memory of emotionalMemories) {
      if (memory.emotional) {
        totalValence += memory.emotional.valence || 0;
        totalArousal += memory.emotional.arousal || 0;
        totalDominance += memory.emotional.dominance || 0;

        (memory.emotional.emotions || []).forEach((emotion) => {
          emotionCounts[emotion] = (emotionCounts[emotion] || 0) + 1;
        });
      }
    }

    // Calculate averages
    const avgValence = totalValence / emotionalMemories.length;
    const avgArousal = totalArousal / emotionalMemories.length;
    const avgDominance = totalDominance / emotionalMemories.length;

    // Find dominant emotions
    const sortedEmotions = Object.entries(emotionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([emotion]) => emotion);

    return {
      dominantEmotions: sortedEmotions,
      valence: avgValence,
      arousal: avgArousal,
      dominance: avgDominance,
    };
  }
}
