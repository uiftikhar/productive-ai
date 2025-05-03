/**
 * Semantic Chunking Service for Meeting Analysis
 * 
 * This service implements semantic chunking for meeting transcripts to identify
 * key sections, topics, and content characteristics that help with intelligent team formation.
 * Uses embeddings to identify true semantic boundaries between chunks.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { EmbeddingService } from '../../../shared/services/embedding.service';
import { EmbeddingServiceFactory } from '../../../shared/services/embedding.factory';
import { IEmbeddingService } from '../../../shared/services/embedding.interface';

/**
 * Configuration options for SemanticChunkingService
 */
export interface SemanticChunkingConfig {
  logger?: Logger;
  chunkOverlap?: number;
  minChunkSize?: number;
  maxChunkSize?: number;
  slidingWindowSize?: number;
  similarityThreshold?: number;
  embeddingService?: IEmbeddingService;
}

/**
 * Chunk metadata including semantic information and relevance
 */
export interface ChunkMetadata {
  id: string;
  startIndex: number;
  endIndex: number;
  text: string;
  semanticScore: number;
  topicRelevance: Record<string, number>;
  speakers: string[];
  keywords: string[];
  timestamp: number;
  embedding?: number[]; // Store embedding for future comparisons
}

/**
 * Content characteristic scores extracted from semantic analysis
 */
export interface ContentCharacteristics {
  technicalComplexity: number;
  domainSpecificity: number;
  controversyLevel: number;
  decisionDensity: number;
  informationDensity: number;
  participantInteractions: number;
  topicDiversity: number;
}

/**
 * Implementation of semantic chunking service
 */
export class SemanticChunkingService {
  private logger: Logger;
  private chunkOverlap: number;
  private minChunkSize: number;
  private maxChunkSize: number;
  private slidingWindowSize: number;
  private similarityThreshold: number;
  private embeddingService!: IEmbeddingService; // Use ! to indicate it will be initialized
  
  /**
   * Create a new semantic chunking service
   */
  constructor(config: SemanticChunkingConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.chunkOverlap = config.chunkOverlap || 0.2; // 20% overlap by default
    this.minChunkSize = config.minChunkSize || 100; // Minimum 100 tokens
    this.maxChunkSize = config.maxChunkSize || 500; // Maximum 500 tokens
    this.slidingWindowSize = config.slidingWindowSize || 3; // Number of sentences in sliding window
    this.similarityThreshold = config.similarityThreshold || 0.7; // Threshold for semantic similarity
    
    // Use provided embedding service or get one from the factory
    try {
      this.embeddingService = config.embeddingService || 
        EmbeddingServiceFactory.getService({ 
          logger: this.logger
        });
      this.logger.info('Successfully initialized embedding service for semantic chunking');
    } catch (error) {
      this.logger.warn(`Could not initialize embedding service: ${error instanceof Error ? error.message : String(error)}`);
      this.createFallbackEmbeddingService();
    }
    
    this.logger.info('Initialized SemanticChunkingService');
  }
  
  /**
   * Creates a fallback embedding service when the real one can't be initialized
   * This allows the semantic chunking to still work in a degraded mode
   */
  private createFallbackEmbeddingService(): void {
    this.logger.info('Creating fallback embedding service');
    
    // Create a minimal implementation of IEmbeddingService for fallback
    this.embeddingService = {
      embedText: async () => new Array(1536).fill(0),
      generateEmbedding: async () => new Array(1536).fill(0),
      calculateCosineSimilarity: () => 0.5,
      embedBatch: async (texts: string[]) => texts.map(() => new Array(1536).fill(0)),
      getModelName: () => 'fallback',
      getDimensions: () => 1536,
      getCost: () => 0,
      // Adding missing interface methods
      findSimilarEmbeddings: () => [],
      combineEmbeddings: (embeddings: number[][]) => new Array(1536).fill(0)
    } as unknown as IEmbeddingService;
  }
  
  /**
   * Chunk a meeting transcript based on semantic boundaries
   */
  async chunkTranscript(transcript: string): Promise<ChunkMetadata[]> {
    this.logger.info('Chunking meeting transcript using semantic boundaries');
    
    try {
      // Step 1: Split transcript into sentences for semantic analysis
      const sentences = this.splitIntoSentences(transcript);
      
      // Step 2: Use embeddings to identify semantic boundaries (if available)
      let semanticBoundaries: number[] = [];
      
      if (this.embeddingService) {
        semanticBoundaries = await this.identifySemanticBoundariesWithEmbeddings(sentences);
        this.logger.info(`Identified ${semanticBoundaries.length} semantic boundaries using embeddings`);
      }
      
      // Step 3: Create chunks based on semantic boundaries
      const chunks = this.createChunksFromBoundaries(transcript, sentences, semanticBoundaries);
      
      // Step 4: Extract metadata from chunks
      const chunksWithMetadata = await this.extractChunkMetadata(chunks, transcript);
      
      this.logger.info(`Successfully created ${chunksWithMetadata.length} semantic chunks`);
      
      return chunksWithMetadata;
    } catch (error) {
      this.logger.error(`Error chunking transcript: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Split text into sentences
   */
  private splitIntoSentences(text: string): string[] {
    // Simple sentence splitting - in production, use a more robust NLP approach
    return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 0);
  }
  
  /**
   * Identify semantic boundaries using embeddings and sliding window approach
   */
  private async identifySemanticBoundariesWithEmbeddings(sentences: string[]): Promise<number[]> {
    const boundaries: number[] = [];
    
    // If we have fewer sentences than twice the window size, return no boundaries
    if (!this.embeddingService || sentences.length < this.slidingWindowSize * 2) {
      return boundaries;
    }
    
    // Generate embeddings for sliding windows
    const windowEmbeddings: number[][] = [];
    
    for (let i = 0; i <= sentences.length - this.slidingWindowSize; i++) {
      // Skip if no embedding service
      if (!this.embeddingService) continue;
      
      const windowText = sentences.slice(i, i + this.slidingWindowSize).join(' ');
      try {
        const embedding = await this.embeddingService.embedText(windowText);
        windowEmbeddings.push(embedding);
      } catch (error) {
        this.logger.warn(`Error generating embedding for window ${i}: ${error}`);
        // Use a placeholder of zeros if embedding fails
        // Default to 1536 dimensions (standard OpenAI embedding size)
        const dimensions = 1536;
        windowEmbeddings.push(new Array(dimensions).fill(0));
      }
    }
    
    // Compare adjacent windows to find semantic shifts
    for (let i = 0; i < windowEmbeddings.length - 1; i++) {
      // Make sure the embedding service exists
      if (!this.embeddingService) continue;
      
      const similarity = this.embeddingService.calculateCosineSimilarity(
        windowEmbeddings[i], 
        windowEmbeddings[i+1]
      );
      
      // If similarity is below threshold, it indicates a semantic boundary
      if (similarity < this.similarityThreshold) {
        // The boundary is at the end of the current window
        boundaries.push(i + this.slidingWindowSize);
      }
    }
    
    return boundaries;
  }
  
  /**
   * Create chunks from identified semantic boundaries
   */
  private createChunksFromBoundaries(
    transcript: string, 
    sentences: string[], 
    boundaries: number[]
  ): string[] {
    // If no semantic boundaries found or embedding service not available,
    // fall back to simpler chunking approach
    if (boundaries.length === 0) {
      return this.splitIntoRawChunks(transcript);
    }
    
    const chunks: string[] = [];
    let startIndex = 0;
    
    // Create chunks based on boundaries
    for (const boundary of boundaries) {
      const chunk = sentences.slice(startIndex, boundary).join(' ');
      
      // Only add if chunk meets minimum size requirement
      if (chunk.split(/\s+/).length >= this.minChunkSize) {
        chunks.push(chunk);
      }
      
      startIndex = boundary;
    }
    
    // Add the final chunk if there's text remaining
    if (startIndex < sentences.length) {
      const chunk = sentences.slice(startIndex).join(' ');
      if (chunk.split(/\s+/).length >= this.minChunkSize) {
        chunks.push(chunk);
      }
    }
    
    // If we didn't create any valid chunks, fall back to basic chunking
    if (chunks.length === 0) {
      return this.splitIntoRawChunks(transcript);
    }
    
    return chunks;
  }
  
  /**
   * Split transcript into raw chunks of appropriate size
   * (Fallback method when semantic chunking is not available)
   */
  private splitIntoRawChunks(transcript: string): string[] {
    // Basic implementation - in production, this would be more sophisticated
    // For now, split by paragraph boundaries or when exceeding max token size
    const paragraphs = transcript.split(/\n\s*\n/);
    const chunks: string[] = [];
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
      // Simple approximation of token count (words)
      const paragraphTokens = paragraph.split(/\s+/).length;
      const currentTokens = currentChunk.split(/\s+/).length;
      
      if (currentTokens + paragraphTokens > this.maxChunkSize && currentTokens >= this.minChunkSize) {
        // Current chunk is already large enough, start a new one
        chunks.push(currentChunk);
        currentChunk = paragraph;
      } else {
        // Add to current chunk
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }
    
    // Add the final chunk if not empty
    if (currentChunk.trim()) {
      chunks.push(currentChunk);
    }
    
    return chunks;
  }
  
  /**
   * Extract metadata from chunks, including generating embeddings if available
   */
  private async extractChunkMetadata(chunks: string[], fullTranscript: string): Promise<ChunkMetadata[]> {
    const result: ChunkMetadata[] = [];
    let startIndex = 0;
    
    for (const chunk of chunks) {
      // Find position in original transcript
      const chunkStartIndex = fullTranscript.indexOf(chunk, startIndex);
      const chunkEndIndex = chunkStartIndex + chunk.length;
      
      // Set start index for next iteration
      startIndex = chunkEndIndex;
      
      // Extract speakers (simple heuristic)
      const speakerPattern = /([A-Za-z]+):\s/g;
      const speakers = new Set<string>();
      let match;
      
      while ((match = speakerPattern.exec(chunk)) !== null) {
        speakers.add(match[1]);
      }
      
      // Extract basic keywords (very simple approach)
      const words = chunk.toLowerCase().split(/\W+/).filter(w => w.length > 4);
      const wordCounts = new Map<string, number>();
      
      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
      
      // Get top keywords
      const sortedWords = [...wordCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([word]) => word);
      
      // Generate embedding for the chunk if service is available
      let embedding: number[] | undefined;
      
      if (this.embeddingService) {
        try {
          embedding = await this.embeddingService.embedText(chunk);
        } catch (error) {
          this.logger.warn(`Error generating embedding for chunk: ${error}`);
        }
      }
      
      // Create metadata with semantic scores
      result.push({
        id: `chunk-${uuidv4()}`,
        startIndex: chunkStartIndex,
        endIndex: chunkEndIndex,
        text: chunk,
        semanticScore: 0.5, // Will be adjusted later based on embeddings
        topicRelevance: {
          "meeting": 0.8,
          "discussion": 0.6,
          "decision": 0.4
        }, // Placeholder - in production would use semantic analysis
        speakers: Array.from(speakers),
        keywords: sortedWords,
        timestamp: Date.now(),
        embedding
      });
    }
    
    // If we have embeddings, calculate semantic coherence scores
    if (this.embeddingService && result.length > 1) {
      for (let i = 0; i < result.length; i++) {
        const currentEmbedding = result[i].embedding;
        const compareIndex = i > 0 ? i-1 : i+1;
        const compareEmbedding = result[compareIndex].embedding;
        
        if (currentEmbedding && compareEmbedding) {
          // Compare with previous chunk (or next if first chunk)
          const similarity = this.embeddingService.calculateCosineSimilarity(
            currentEmbedding, 
            compareEmbedding
          );
          
          // Adjust semantic score based on similarity to adjacent chunks
          result[i].semanticScore = similarity;
        }
      }
    }
    
    return result;
  }
  
  /**
   * Analyze content characteristics based on semantic chunks
   */
  async analyzeContentCharacteristics(chunks: ChunkMetadata[]): Promise<ContentCharacteristics> {
    this.logger.info('Analyzing content characteristics from semantic chunks');
    
    try {
      // Default values
      const characteristics: ContentCharacteristics = {
        technicalComplexity: 0,
        domainSpecificity: 0,
        controversyLevel: 0,
        decisionDensity: 0,
        informationDensity: 0,
        participantInteractions: 0,
        topicDiversity: 0
      };
      
      // In a real implementation, this would use LLM analysis to determine characteristics
      // This is a placeholder for the concept
      
      // Sample logic: Analyze chunks and evaluate characteristics
      if (chunks.length > 0) {
        // Technical complexity based on keyword density and domain terms
        characteristics.technicalComplexity = this.calculateTechnicalComplexity(chunks);
        
        // Domain specificity based on topic relevance scores
        characteristics.domainSpecificity = this.calculateDomainSpecificity(chunks);
        
        // Controversy level based on semantic analysis
        characteristics.controversyLevel = this.calculateControversyLevel(chunks);
        
        // Decision density based on action items and decisions identified
        characteristics.decisionDensity = this.calculateDecisionDensity(chunks);
        
        // Information density based on content analysis
        characteristics.informationDensity = this.calculateInformationDensity(chunks);
        
        // Participant interactions based on speaker changes
        characteristics.participantInteractions = this.calculateParticipantInteractions(chunks);
        
        // Topic diversity based on topic distribution
        characteristics.topicDiversity = this.calculateTopicDiversity(chunks);
      }
      
      this.logger.info('Successfully analyzed content characteristics');
      
      return characteristics;
    } catch (error) {
      this.logger.error(`Error analyzing content characteristics: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Calculate technical complexity from chunks
   */
  private calculateTechnicalComplexity(chunks: ChunkMetadata[]): number {
    // In a real implementation, this would analyze the content for technical terms
    // For this demonstration, return a random value between 0 and 1
    return Math.random();
  }
  
  /**
   * Calculate domain specificity from chunks
   */
  private calculateDomainSpecificity(chunks: ChunkMetadata[]): number {
    // In a real implementation, this would analyze domain-specific terminology
    return Math.random();
  }
  
  /**
   * Calculate controversy level from chunks
   */
  private calculateControversyLevel(chunks: ChunkMetadata[]): number {
    // In a real implementation, this would look for disagreements or conflicting opinions
    return Math.random();
  }
  
  /**
   * Calculate decision density from chunks
   */
  private calculateDecisionDensity(chunks: ChunkMetadata[]): number {
    // In a real implementation, this would identify decision points
    return Math.random();
  }
  
  /**
   * Calculate information density from chunks
   */
  private calculateInformationDensity(chunks: ChunkMetadata[]): number {
    // In a real implementation, this would measure information content
    return Math.random();
  }
  
  /**
   * Calculate participant interactions from chunks
   */
  private calculateParticipantInteractions(chunks: ChunkMetadata[]): number {
    // Simple implementation - count speaker transitions
    let transitions = 0;
    let previousSpeakers = new Set<string>();
    
    for (const chunk of chunks) {
      const currentSpeakers = new Set(chunk.speakers);
      
      // Count speakers in this chunk who weren't in the previous chunk
      for (const speaker of currentSpeakers) {
        if (!previousSpeakers.has(speaker)) {
          transitions++;
        }
      }
      
      previousSpeakers = currentSpeakers;
    }
    
    // Normalize to 0-1 range
    return Math.min(1, transitions / (chunks.length * 2));
  }
  
  /**
   * Calculate topic diversity from chunks
   */
  private calculateTopicDiversity(chunks: ChunkMetadata[]): number {
    // If we have embeddings, use them to measure topic diversity
    if (this.embeddingService && chunks.length > 1) {
      let totalDiversity = 0;
      let pairCount = 0;
      
      // Compare each pair of chunks to measure overall diversity
      for (let i = 0; i < chunks.length; i++) {
        for (let j = i + 1; j < chunks.length; j++) {
          const embeddingI = chunks[i].embedding;
          const embeddingJ = chunks[j].embedding;
          
          if (embeddingI && embeddingJ && this.embeddingService) {
            const similarity = this.embeddingService.calculateCosineSimilarity(
              embeddingI, 
              embeddingJ
            );
            // Diversity is inverse of similarity
            totalDiversity += (1 - similarity);
            pairCount++;
          }
        }
      }
      
      return pairCount > 0 ? totalDiversity / pairCount : 0.5;
    }
    
    // Fallback to random value if no embeddings available
    return Math.random();
  }
} 