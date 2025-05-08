/**
 * In-Memory Storage Provider for Agent Memory System
 * Part of Milestone 2.2: Agent Memory System
 */
import { v4 as uuidv4 } from 'uuid';
import {
  Memory,
  MemoryType, 
  MemoryQueryParams, 
  MemoryQueryResults
} from '../../interfaces/memory.interface';
import {
  MemoryStorageProvider,
  MemoryStorageConfig,
  RetentionPolicy,
  StorageStats
} from '../../interfaces/storage.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

/**
 * A simple in-memory storage provider for testing and development
 */
export class InMemoryStorageProvider<T extends Memory = Memory> implements MemoryStorageProvider<T> {
  private memories: Map<string, T> = new Map();
  private accessCounts: Map<string, number> = new Map();
  private isInitialized: boolean = false;
  private config: MemoryStorageConfig;
  private logger: Logger;
  private retentionTimer?: NodeJS.Timeout;
  private embeddings: Map<string, number[]> = new Map();

  /**
   * Create a new in-memory storage provider
   */
  constructor(config: MemoryStorageConfig = {}, logger?: Logger) {
    this.config = {
      retentionPolicy: {
        maxItems: 10000,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        prunePriority: 'oldest'
      },
      syncInterval: 3600000, // 1 hour
      ...config
    };
    
    this.logger = logger || new ConsoleLogger();
  }

  /**
   * Initialize the storage provider
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    
    this.logger.info('Initializing in-memory storage provider');
    
    // Set up retention policy timer
    if (this.config.syncInterval && this.config.syncInterval > 0) {
      this.retentionTimer = setInterval(() => {
        this.applyRetentionPolicy().catch(error => {
          this.logger.error('Error applying retention policy', { error });
        });
      }, this.config.syncInterval);
    }
    
    this.isInitialized = true;
  }

  /**
   * Store a memory
   */
  async store(memory: T): Promise<T> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    // Generate ID if not provided
    if (!memory.id) {
      memory = { ...memory, id: uuidv4() } as T;
    }
    
    // Set creation and update timestamps
    const now = new Date();
    memory = {
      ...memory,
      createdAt: memory.createdAt || now,
      updatedAt: now,
      accessCount: 0
    } as T;
    
    // Store the memory
    this.memories.set(memory.id, memory);
    this.accessCounts.set(memory.id, 0);
    
    // Store the embedding if available
    if (memory.vectorEmbedding) {
      this.embeddings.set(memory.id, memory.vectorEmbedding);
    }
    
    this.logger.debug(`Stored memory: ${memory.id}`, { type: memory.type });
    
    return memory;
  }

  /**
   * Retrieve a memory by ID
   */
  async retrieve(id: string): Promise<T | null> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const memory = this.memories.get(id) || null;
    
    if (memory) {
      await this.recordAccess(id);
    }
    
    return memory;
  }

  /**
   * Update an existing memory
   */
  async update(id: string, updates: Partial<T>): Promise<T> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const memory = this.memories.get(id);
    
    if (!memory) {
      throw new Error(`Memory with ID ${id} not found`);
    }
    
    // Apply updates
    const updatedMemory = {
      ...memory,
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: new Date()
    } as T;
    
    // Update the memory
    this.memories.set(id, updatedMemory);
    
    // Update embedding if provided
    if (updates.vectorEmbedding) {
      this.embeddings.set(id, updates.vectorEmbedding);
    }
    
    this.logger.debug(`Updated memory: ${id}`);
    
    return updatedMemory;
  }

  /**
   * Delete a memory by ID
   */
  async delete(id: string): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const deleted = this.memories.delete(id);
    
    if (deleted) {
      this.accessCounts.delete(id);
      this.embeddings.delete(id);
      this.logger.debug(`Deleted memory: ${id}`);
    }
    
    return deleted;
  }

  /**
   * Perform a query against the stored memories
   */
  async query(params: MemoryQueryParams): Promise<MemoryQueryResults<T>> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const startTime = Date.now();
    
    // Apply filters to get matching memories
    let filteredMemories = Array.from(this.memories.values()).filter(memory => {
      // Filter by agent ID
      if (params.agentId && memory.agentId !== params.agentId) {
        return false;
      }
      
      // Filter by type
      if (params.type) {
        const types = Array.isArray(params.type) ? params.type : [params.type];
        if (!types.includes(memory.type)) {
          return false;
        }
      }
      
      // Filter by date range
      if (params.startDate && memory.createdAt < params.startDate) {
        return false;
      }
      
      if (params.endDate && memory.createdAt > params.endDate) {
        return false;
      }
      
      // Filter by importance threshold
      if (params.importanceThreshold !== undefined && 
          memory.metadata.importance < params.importanceThreshold) {
        return false;
      }
      
      // Filter by confidence threshold
      if (params.confidenceThreshold !== undefined && 
          memory.metadata.confidence < params.confidenceThreshold) {
        return false;
      }
      
      // Filter by tags
      if (params.tags && params.tags.length > 0) {
        if (!memory.metadata.tags || 
            !params.tags.every(tag => memory.metadata.tags!.includes(tag))) {
          return false;
        }
      }
      
      return true;
    });
    
    // Apply text search if provided
    if (params.query) {
      filteredMemories = this.searchByText(filteredMemories, params.query);
    }
    
    // Get total count before pagination
    const totalCount = filteredMemories.length;
    
    // Apply sorting
    if (params.sortBy) {
      filteredMemories = this.sortMemories(filteredMemories, params.sortBy, params.sortDirection);
    }
    
    // Apply pagination
    const limit = params.limit || 100;
    const offset = params.offset || 0;
    const paginatedMemories = filteredMemories.slice(offset, offset + limit);
    
    // Record access for retrieved memories
    for (const memory of paginatedMemories) {
      await this.recordAccess(memory.id);
    }
    
    // Create result
    const result: MemoryQueryResults<T> = {
      items: paginatedMemories,
      totalCount,
      hasMore: offset + limit < totalCount,
      metadata: {
        executionTimeMs: Date.now() - startTime
      }
    };
    
    return result;
  }

  /**
   * Perform a similarity search for memories
   */
  async similaritySearch(
    query: string,
    params: Partial<MemoryQueryParams> = {}
  ): Promise<MemoryQueryResults<T>> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    // For in-memory provider, this is just a text search
    return this.query({
      ...params,
      query
    });
  }

  /**
   * Get memories by vector similarity to an embedding
   */
  async vectorSearch(
    embedding: number[],
    params: Partial<MemoryQueryParams> = {}
  ): Promise<MemoryQueryResults<T>> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    // Convert params to full query params
    const queryParams: MemoryQueryParams = {
      limit: 10,
      ...params
    };
    
    // Get the initial filtered memories
    const baseQuery = await this.query({
      ...queryParams,
      query: undefined // Remove text query since we're doing vector search
    });
    
    // If no embeddings, return as is
    if (this.embeddings.size === 0) {
      return baseQuery;
    }
    
    // Calculate similarities
    const memoriesWithScores: Array<{memory: T; score: number}> = [];
    
    for (const memory of baseQuery.items) {
      const memoryEmbedding = this.embeddings.get(memory.id);
      
      if (memoryEmbedding) {
        const similarity = this.calculateCosineSimilarity(embedding, memoryEmbedding);
        
        // Filter by similarity threshold if provided
        if (params.similarityThreshold === undefined || similarity >= params.similarityThreshold) {
          memoriesWithScores.push({
            memory,
            score: similarity
          });
        }
      }
    }
    
    // Sort by similarity score
    memoriesWithScores.sort((a, b) => b.score - a.score);
    
    // Apply pagination
    const limit = params.limit || 10;
    const offset = params.offset || 0;
    const paginatedResults = memoriesWithScores.slice(offset, offset + limit);
    
    // Record access for retrieved memories
    for (const { memory } of paginatedResults) {
      await this.recordAccess(memory.id);
    }
    
    // Calculate average similarity
    const avgSimilarity = paginatedResults.length > 0
      ? paginatedResults.reduce((sum, item) => sum + item.score, 0) / paginatedResults.length
      : 0;
    
    // Create result
    return {
      items: paginatedResults.map(item => item.memory),
      totalCount: memoriesWithScores.length,
      hasMore: offset + limit < memoriesWithScores.length,
      metadata: {
        avgSimilarity,
        executionTimeMs: 0 // Not meaningful for in-memory
      }
    };
  }

  /**
   * Increment the access count for a memory
   */
  async recordAccess(id: string): Promise<void> {
    if (!this.memories.has(id)) {
      return;
    }
    
    // Update access count
    const currentCount = this.accessCounts.get(id) || 0;
    this.accessCounts.set(id, currentCount + 1);
    
    // Update the memory with lastAccessed timestamp and access count
    const memory = this.memories.get(id)!;
    this.memories.set(id, {
      ...memory,
      lastAccessed: new Date(),
      accessCount: (memory.accessCount || 0) + 1
    } as T);
  }

  /**
   * Apply the retention policy
   */
  async applyRetentionPolicy(): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const policy = this.config.retentionPolicy;
    
    if (!policy) {
      return 0;
    }
    
    let memoriesToPrune: T[] = [];
    const now = Date.now();
    
    // Get all memories sorted by selected priority
    const allMemories = Array.from(this.memories.values());
    
    // Check if we need to prune by age
    if (policy.maxAge) {
      const cutoffDate = new Date(now - policy.maxAge);
      const agedMemories = allMemories.filter(memory => memory.createdAt < cutoffDate);
      
      // Skip excluded tags
      if (policy.excludedTags && policy.excludedTags.length > 0) {
        memoriesToPrune = agedMemories.filter(memory => 
          !memory.metadata.tags || 
          !memory.metadata.tags.some(tag => policy.excludedTags!.includes(tag))
        );
      } else {
        memoriesToPrune = agedMemories;
      }
    }
    
    // Check if we need to prune by max items
    if (policy.maxItems && allMemories.length > policy.maxItems) {
      // If we already have memories to prune by age, we don't need to prune more
      if (memoriesToPrune.length === 0) {
        const sortedMemories = this.sortMemoriesByPriority(allMemories, policy.prunePriority || 'oldest');
        
        // Skip excluded tags
        if (policy.excludedTags && policy.excludedTags.length > 0) {
          const pruneableMemories = sortedMemories.filter(memory => 
            !memory.metadata.tags || 
            !memory.metadata.tags.some(tag => policy.excludedTags!.includes(tag))
          );
          
          memoriesToPrune = pruneableMemories.slice(0, allMemories.length - policy.maxItems);
        } else {
          memoriesToPrune = sortedMemories.slice(0, allMemories.length - policy.maxItems);
        }
      }
    }
    
    // Prune the selected memories
    for (const memory of memoriesToPrune) {
      if (policy.archiveInsteadOfDelete) {
        // Archive logic would go here
        // For this implementation, we'll just log it
        this.logger.debug(`Archiving memory: ${memory.id} due to retention policy`);
      } else {
        await this.delete(memory.id);
      }
    }
    
    this.logger.info(`Applied retention policy, pruned ${memoriesToPrune.length} memories`);
    
    return memoriesToPrune.length;
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    const memories = Array.from(this.memories.values());
    const totalMemories = memories.length;
    
    // Calculate total size (rough estimate for in-memory)
    const totalSize = memories.reduce((sum, memory) => {
      const jsonSize = JSON.stringify(memory).length;
      return sum + jsonSize;
    }, 0);
    
    // Calculate memory type distribution
    const typeDistribution: Record<string, number> = {};
    for (const memory of memories) {
      typeDistribution[memory.type] = (typeDistribution[memory.type] || 0) + 1;
    }
    
    // Calculate agent distribution
    const agentDistribution: Record<string, number> = {};
    for (const memory of memories) {
      agentDistribution[memory.agentId] = (agentDistribution[memory.agentId] || 0) + 1;
    }
    
    // Get oldest and newest memories
    let oldestDate: Date | undefined;
    let newestDate: Date | undefined;
    
    if (totalMemories > 0) {
      oldestDate = new Date(Math.min(...memories.map(m => m.createdAt.getTime())));
      newestDate = new Date(Math.max(...memories.map(m => m.createdAt.getTime())));
    }
    
    // Calculate access stats
    const totalAccesses = Array.from(this.accessCounts.values()).reduce((sum, count) => sum + count, 0);
    const avgAccesses = totalMemories > 0 ? totalAccesses / totalMemories : 0;
    
    // Find most accessed memory
    let mostAccessedId: string | undefined;
    let mostAccessedCount: number = 0;
    
    for (const [id, count] of this.accessCounts.entries()) {
      if (count > mostAccessedCount) {
        mostAccessedId = id;
        mostAccessedCount = count;
      }
    }
    
    return {
      totalMemories,
      usedStorage: totalSize,
      oldestMemory: oldestDate,
      newestMemory: newestDate,
      averageSize: totalMemories > 0 ? totalSize / totalMemories : 0,
      memoryTypeDistribution: typeDistribution,
      agentDistribution: agentDistribution,
      accessStats: {
        totalAccesses,
        averageAccessesPerMemory: avgAccesses,
        mostAccessedMemoryId: mostAccessedId,
        mostAccessedCount: mostAccessedCount > 0 ? mostAccessedCount : undefined
      }
    };
  }

  /**
   * Close the storage provider
   */
  async close(): Promise<void> {
    if (this.retentionTimer) {
      clearInterval(this.retentionTimer);
    }
    
    this.isInitialized = false;
    this.logger.info('Closed in-memory storage provider');
  }

  /**
   * Search memories by text content
   */
  private searchByText(memories: T[], query: string): T[] {
    const normalizedQuery = query.toLowerCase();
    
    return memories.filter(memory => {
      // Search in memory content
      const content = JSON.stringify(memory.content).toLowerCase();
      if (content.includes(normalizedQuery)) {
        return true;
      }
      
      // Check metadata
      const metadata = JSON.stringify(memory.metadata).toLowerCase();
      if (metadata.includes(normalizedQuery)) {
        return true;
      }
      
      return false;
    });
  }

  /**
   * Sort memories by field
   */
  private sortMemories(
    memories: T[],
    sortBy: string,
    direction: 'asc' | 'desc' = 'desc'
  ): T[] {
    return [...memories].sort((a, b) => {
      let valueA: any;
      let valueB: any;
      
      // Get values to compare
      switch (sortBy) {
        case 'importance':
          valueA = a.metadata.importance;
          valueB = b.metadata.importance;
          break;
        case 'confidence':
          valueA = a.metadata.confidence;
          valueB = b.metadata.confidence;
          break;
        case 'createdAt':
          valueA = a.createdAt.getTime();
          valueB = b.createdAt.getTime();
          break;
        case 'updatedAt':
          valueA = a.updatedAt.getTime();
          valueB = b.updatedAt.getTime();
          break;
        case 'lastAccessed':
          valueA = a.lastAccessed ? a.lastAccessed.getTime() : 0;
          valueB = b.lastAccessed ? b.lastAccessed.getTime() : 0;
          break;
        default:
          valueA = 0;
          valueB = 0;
      }
      
      // Compare based on direction
      return direction === 'asc' 
        ? (valueA > valueB ? 1 : -1)
        : (valueA < valueB ? 1 : -1);
    });
  }

  /**
   * Sort memories by retention policy priority
   */
  private sortMemoriesByPriority(memories: T[], priority: RetentionPolicy['prunePriority']): T[] {
    switch (priority) {
      case 'oldest':
        return [...memories].sort((a, b) => 
          a.createdAt.getTime() - b.createdAt.getTime()
        );
      
      case 'least_important':
        return [...memories].sort((a, b) => 
          a.metadata.importance - b.metadata.importance
        );
      
      case 'least_accessed':
        return [...memories].sort((a, b) => {
          const accessA = this.accessCounts.get(a.id) || 0;
          const accessB = this.accessCounts.get(b.id) || 0;
          return accessA - accessB;
        });
      
      case 'lowest_confidence':
        return [...memories].sort((a, b) => 
          a.metadata.confidence - b.metadata.confidence
        );
      
      default:
        return [...memories].sort((a, b) => 
          a.createdAt.getTime() - b.createdAt.getTime()
        );
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private calculateCosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimensions');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
} 