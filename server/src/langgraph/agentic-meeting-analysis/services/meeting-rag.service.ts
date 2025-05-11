import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { OpenAIConnector } from '../../../connectors/openai-connector';
import { PineconeConnector } from '../../../connectors/pinecone-connector';
import { v4 as uuidv4 } from 'uuid';
import { VectorIndexes } from '../../../pinecone/pinecone-index.service';
import { SemanticChunkingService } from './semantic-chunking.service';
import { RawTranscript } from '../../../langgraph/core/transcript/enhanced-transcript-processor';
import { RecordMetadata } from '@pinecone-database/pinecone';

// Define the transcript segments index name
// In a real implementation, this would be in VectorIndexes
const TRANSCRIPT_SEGMENTS = 'transcript-segments';

/**
 * Configuration for Meeting RAG Service
 */
export interface MeetingRAGConfig {
  indexName: string;
  namespace: string;
  embeddingModel: string;
  minRelevanceScore: number;
  maxRetrievalResults: number;
  reRankResults: boolean;
  logRetrievalStats: boolean;
  trackUsage: boolean;
}

/**
 * Default RAG configuration
 */
const DEFAULT_CONFIG: MeetingRAGConfig = {
  indexName: TRANSCRIPT_SEGMENTS,
  namespace: 'meeting-transcripts',
  embeddingModel: 'text-embedding-3-small',
  minRelevanceScore: 0.7,
  maxRetrievalResults: 5,
  reRankResults: true,
  logRetrievalStats: true,
  trackUsage: true,
};

/**
 * Chunk metadata for vector storage
 * We're not extending RecordMetadata directly to avoid type conflicts
 */
interface ChunkMetadata {
  meetingId: string;
  sessionId: string;
  chunkIndex: number;
  timestamp: number;
  speakerIds?: string[];
  topicTags?: string[];
  importanceScore?: number;
  extractedAt: number;
  content?: string; // Store content in metadata for simplicity
}

/**
 * Retrieval result with relevance information
 */
export interface RetrievalResult {
  content: string;
  metadata: ChunkMetadata;
  score: number;
}

/**
 * Type for Pinecone query match results
 */
interface PineconeMatch {
  id: string;
  score?: number;
  metadata?: Record<string, any>;
  values?: number[];
}

/**
 * Service for Meeting Transcript RAG operations
 * Handles processing, storing, and retrieving transcript chunks
 * for Retrieval Augmented Generation
 */
export class MeetingRAGService {
  private logger: Logger;
  private openAiConnector: OpenAIConnector;
  private pineconeConnector: PineconeConnector;
  private chunkingService: SemanticChunkingService;
  private config: MeetingRAGConfig;
  
  // Used to store usage metrics
  private usageStats = {
    totalProcessedTranscripts: 0,
    totalChunksStored: 0,
    totalTokensEmbedded: 0,
    totalQueries: 0,
    totalRetrievals: 0,
    averageQueryTime: 0,
    totalQueryTime: 0,
  };

  /**
   * Create a new Meeting RAG Service
   */
  constructor(options: {
    logger?: Logger;
    openAiConnector: OpenAIConnector;
    pineconeConnector: PineconeConnector;
    chunkingService?: SemanticChunkingService;
    config?: Partial<MeetingRAGConfig>;
  }) {
    this.logger = options.logger || new ConsoleLogger();
    this.openAiConnector = options.openAiConnector;
    this.pineconeConnector = options.pineconeConnector;
    this.config = { ...DEFAULT_CONFIG, ...(options.config || {}) };
    
    // Create chunking service if not provided
    this.chunkingService = options.chunkingService || 
      new SemanticChunkingService({
        logger: this.logger,
        openAiConnector: this.openAiConnector,
      });
  }

  /**
   * Process a meeting transcript and store in vector DB
   * @param transcript The meeting transcript to process
   * @param sessionId The analysis session ID
   * @returns Number of chunks stored
   */
  async processTranscript(transcript: RawTranscript, sessionId: string): Promise<number> {
    const startTime = Date.now();
    this.logger.info('Processing transcript for RAG', {
      meetingId: transcript.meetingId,
      sessionId,
      entriesCount: transcript.entries.length
    });

    try {
      // Chunk the transcript semantically
      const chunks = await this.chunkingService.chunkStructuredTranscript(transcript);
      
      this.logger.info('Transcript chunking complete', {
        meetingId: transcript.meetingId,
        chunks: chunks.length
      });

      // Process each chunk: generate embedding and store in Pinecone
      const storedChunks = await this.storeChunks(
        chunks, 
        transcript.meetingId, 
        sessionId
      );
      
      if (this.config.trackUsage) {
        this.usageStats.totalProcessedTranscripts++;
        this.usageStats.totalChunksStored += storedChunks;
      }

      const duration = Date.now() - startTime;
      this.logger.info('Transcript processing complete', {
        meetingId: transcript.meetingId,
        sessionId,
        chunksStored: storedChunks,
        durationMs: duration
      });

      return storedChunks;
    } catch (error) {
      this.logger.error('Error processing transcript for RAG', {
        meetingId: transcript.meetingId,
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Store transcript chunks in vector database
   * @param chunks Array of transcript chunks
   * @param meetingId Meeting ID
   * @param sessionId Analysis session ID
   * @returns Number of chunks successfully stored
   */
  private async storeChunks(
    chunks: string[], 
    meetingId: string, 
    sessionId: string
  ): Promise<number> {
    let storedCount = 0;
    
    try {
      // Process chunks in batches to avoid rate limits
      const batchSize = 10;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
        const batchPromises = batch.map(async (chunk, index) => {
          const chunkIndex = i + index;
          
          try {
            // Generate embedding for the chunk
            const embedding = await this.generateEmbedding(chunk);
            
            // Create metadata for the chunk - converting to compatible format for Pinecone
            const metadata: Record<string, any> = {
              meetingId,
              sessionId,
              chunkIndex,
              timestamp: Date.now(),
              extractedAt: Date.now(),
              // Store the actual text content in metadata
              content: chunk 
            };
            
            // Generate a unique ID for the chunk
            const chunkId = `${meetingId}-${sessionId}-chunk-${chunkIndex}`;
            
            // Store in Pinecone
            await this.pineconeConnector.upsertVectors(
              this.config.indexName,
              [{
                id: chunkId,
                values: embedding,
                metadata
              }],
              this.config.namespace
            );
            
            return true;
          } catch (error) {
            this.logger.error('Error storing chunk', {
              meetingId,
              sessionId,
              chunkIndex,
              error: error instanceof Error ? error.message : String(error)
            });
            return false;
          }
        });
        
        // Wait for all chunks in this batch to be processed
        const results = await Promise.all(batchPromises);
        storedCount += results.filter(success => success).length;
      }
      
      this.logger.info('Chunks stored successfully', {
        meetingId,
        sessionId,
        totalChunks: chunks.length,
        storedChunks: storedCount
      });
      
      return storedCount;
    } catch (error) {
      this.logger.error('Error in batch storing chunks', {
        meetingId, 
        sessionId,
        error: error instanceof Error ? error.message : String(error)
      });
      return storedCount;
    }
  }

  /**
   * Generate an embedding for a text chunk
   * @param text Text to embed
   * @returns Embedding vector
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      // The OpenAIConnector.generateEmbedding method takes only text parameter
      const embedding = await this.openAiConnector.generateEmbedding(text);
      
      if (this.config.trackUsage) {
        // Rough estimate: 1 token ~= 4 chars for English text
        const estimatedTokens = Math.ceil(text.length / 4);
        this.usageStats.totalTokensEmbedded += estimatedTokens;
      }
      
      return embedding;
    } catch (error) {
      this.logger.error('Error generating embedding', {
        error: error instanceof Error ? error.message : String(error),
        textLength: text.length
      });
      throw error;
    }
  }

  /**
   * Retrieve relevant transcript chunks for a query
   * @param query Query text
   * @param meetingId Optional meeting ID to filter
   * @param sessionId Optional session ID to filter
   * @returns Retrieval results
   */
  async retrieveRelevantChunks(
    query: string,
    meetingId?: string,
    sessionId?: string
  ): Promise<RetrievalResult[]> {
    const startTime = Date.now();
    
    try {
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Build filter if meetingId or sessionId is provided
      let filter: Record<string, any> = {};
      if (meetingId) {
        filter.meetingId = meetingId;
      }
      if (sessionId) {
        filter.sessionId = sessionId;
      }
      
      // Query Pinecone for similar vectors
      const queryResponse = await this.pineconeConnector.queryVectors(
        this.config.indexName,
        queryEmbedding,
        this.config.maxRetrievalResults,
        this.config.namespace,
        filter,
        true // Include metadata
      );
      
      // Transform results
      const results: RetrievalResult[] = [];
      if (queryResponse.matches && queryResponse.matches.length > 0) {
        // First fetch the actual content for all the matches
        const chunkIds = queryResponse.matches.map((match: PineconeMatch) => match.id);
        const chunkContents = await this.fetchChunkContents(chunkIds, meetingId, sessionId);
        
        // Map results
        for (const match of queryResponse.matches as PineconeMatch[]) {
          const score = match.score || 0;
          
          if (match.metadata) {
            // Convert the raw metadata to our ChunkMetadata type
            const metadata: ChunkMetadata = {
              meetingId: match.metadata.meetingId || '',
              sessionId: match.metadata.sessionId || '',
              chunkIndex: typeof match.metadata.chunkIndex === 'number' ? match.metadata.chunkIndex : 0,
              timestamp: typeof match.metadata.timestamp === 'number' ? match.metadata.timestamp : 0,
              extractedAt: typeof match.metadata.extractedAt === 'number' ? match.metadata.extractedAt : 0,
              content: typeof match.metadata.content === 'string' ? match.metadata.content : '',
              speakerIds: Array.isArray(match.metadata.speakerIds) ? match.metadata.speakerIds : undefined,
              topicTags: Array.isArray(match.metadata.topicTags) ? match.metadata.topicTags : undefined,
              importanceScore: typeof match.metadata.importanceScore === 'number' ? match.metadata.importanceScore : undefined
            };
            
            // Only include results above the minimum relevance threshold
            if (score >= this.config.minRelevanceScore) {
              // Use stored content from metadata if available, otherwise from our content cache
              const content = metadata.content || chunkContents[match.id] || '';
              if (content) {
                results.push({
                  content,
                  metadata,
                  score
                });
              }
            }
          }
        }
      }
      
      // Re-rank results if enabled (using a more sophisticated approach)
      const finalResults = this.config.reRankResults 
        ? await this.reRankResults(results, query) 
        : results;
      
      const duration = Date.now() - startTime;
      
      // Update usage stats
      if (this.config.trackUsage) {
        this.usageStats.totalQueries++;
        this.usageStats.totalRetrievals += finalResults.length;
        this.usageStats.totalQueryTime += duration;
        this.usageStats.averageQueryTime = 
          this.usageStats.totalQueryTime / this.usageStats.totalQueries;
      }
      
      // Log query stats
      if (this.config.logRetrievalStats) {
        this.logger.info('RAG query complete', {
          query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
          meetingId: meetingId || 'any',
          retrievedCount: finalResults.length,
          topScore: finalResults.length > 0 ? finalResults[0].score : 'N/A',
          durationMs: duration
        });
      }
      
      return finalResults;
    } catch (error) {
      this.logger.error('Error retrieving relevant chunks', {
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
        meetingId: meetingId || 'any',
        sessionId: sessionId || 'any',
        error: error instanceof Error ? error.message : String(error)
      });
      
      return [];
    }
  }

  /**
   * Fetch chunk contents by IDs - handles retrieving the actual text content
   * that is stored separately from the vector database
   */
  private async fetchChunkContents(
    chunkIds: string[],
    meetingId?: string,
    sessionId?: string
  ): Promise<Record<string, string>> {
    try {
      // In a real implementation, this would fetch from wherever the content is stored
      // For this implementation, we're using a simplified approach since the content
      // might be stored in the metadata directly
      
      const contentMap: Record<string, string> = {};
      
      // Fetch the vector records from Pinecone
      const response = await this.pineconeConnector.fetchVectors(
        this.config.indexName,
        chunkIds,
        this.config.namespace
      );
      
      if (response.records) {
        // Extract content from metadata or lookup in content store
        for (const [id, record] of Object.entries(response.records)) {
          if (record && typeof record === 'object' && 'metadata' in record) {
            // Type assertion for the metadata
            const metadata = record.metadata as Record<string, any>;
            contentMap[id] = typeof metadata.content === 'string' ? metadata.content : 
              `[Content for chunk ${id} - In a production system, this would be actual text]`;
          } else {
            contentMap[id] = `[Content for chunk ${id} - No metadata found]`;
          }
        }
      }
      
      return contentMap;
    } catch (error) {
      this.logger.error('Error fetching chunk contents', {
        chunkCount: chunkIds.length,
        meetingId: meetingId || 'any',
        sessionId: sessionId || 'any',
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {};
    }
  }

  /**
   * Re-rank retrieval results using semantic similarity
   * This provides a more nuanced ranking than pure vector similarity
   */
  private async reRankResults(
    results: RetrievalResult[],
    query: string
  ): Promise<RetrievalResult[]> {
    if (results.length <= 1) {
      return results;
    }
    
    try {
      // Use OpenAI to score each result for relevance
      const scoredResults = await Promise.all(results.map(async (result) => {
        try {
          const instruction = 'On a scale from 0 to 10, rate the relevance of the following transcript segment to the query. Return only the numeric score.';
          const response = await this.openAiConnector.generateResponse(
            [
              { role: 'system', content: 'You are a relevance scoring system. Return only a number from 0-10.' },
              { 
                role: 'user', 
                content: `${instruction}\n\nQUERY: ${query}\n\nTRANSCRIPT SEGMENT:\n${result.content.substring(0, 1500)}` 
              }
            ],
            {
              temperature: 0.1,
              maxTokens: 5,
            }
          );
          
          // Parse the response as a number
          const semanticScore = parseFloat(response.content);
          if (!isNaN(semanticScore)) {
            // Combine vector similarity with semantic score (weighted average)
            const combinedScore = (result.score * 0.4) + (semanticScore / 10 * 0.6);
            return { ...result, score: combinedScore };
          }
          
          return result;
        } catch (error) {
          this.logger.warn('Error re-ranking result', {
            error: error instanceof Error ? error.message : String(error)
          });
          return result;
        }
      }));
      
      // Sort by score descending
      return scoredResults.sort((a, b) => b.score - a.score);
    } catch (error) {
      this.logger.error('Error re-ranking results', {
        resultCount: results.length,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return results;
    }
  }

  /**
   * Get usage statistics for monitoring
   */
  getUsageStats() {
    return { ...this.usageStats };
  }
} 