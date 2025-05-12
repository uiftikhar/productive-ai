/**
 * Meeting Context Provider
 * 
 * Provides meeting transcript context for the RAG framework.
 * Manages the storage, retrieval, and processing of meeting transcript content.
 */

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { PineconeConnector } from '../../connectors/pinecone-connector';
import { VectorIndexes } from '../../pinecone/pinecone-index.service';
import { ContentChunk } from '../core/chunking.interface';
import { 
  ContextProvider, 
  RetrievalOptions, 
  RetrievalResult, 
  ContextProcessingOptions, 
  ProcessedContext,
  ContextStorageOptions
} from './context-provider.interface';
import { performance } from 'perf_hooks';
import { RecordMetadata } from '@pinecone-database/pinecone';

export interface MeetingContextOptions extends ContextStorageOptions {
  meetingId?: string;
  organizationId?: string;
  sourceId?: string;
  namespace?: string;
  speakerInfo?: Record<string, {
    name: string;
    role?: string;
    department?: string;
  }>;
}

export class MeetingContextProvider implements ContextProvider {
  private logger: Logger;
  private openAiConnector: OpenAIConnector;
  private pineconeConnector: PineconeConnector;
  private indexName: string;
  
  // Default namespace for meeting context
  private defaultNamespace = 'meeting-transcripts';
  
  constructor(options: {
    logger?: Logger;
    openAiConnector?: OpenAIConnector;
    pineconeConnector?: PineconeConnector;
    indexName?: string;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.openAiConnector = options.openAiConnector || new OpenAIConnector({ logger: this.logger });
    this.pineconeConnector = options.pineconeConnector || new PineconeConnector({ 
      logger: this.logger,
      defaultNamespace: this.defaultNamespace 
    });
    this.indexName = options.indexName || VectorIndexes.TRANSCRIPT_EMBEDDINGS;
  }

  /**
   * Store content chunks with embeddings for later retrieval
   * @param chunks Content chunks to store
   * @param options Storage options
   * @returns Array of stored chunk IDs
   */
  async storeContext(
    chunks: ContentChunk[],
    options: MeetingContextOptions = {}
  ): Promise<string[]> {
    const startTime = performance.now();
    const namespace = options.namespace || this.defaultNamespace;
    const meetingId = options.meetingId || options.sourceId || `meeting-${Date.now()}`;
    
    try {
      this.logger.info('Storing meeting context', {
        chunkCount: chunks.length,
        meetingId,
        namespace
      });
      
      // Generate embeddings for all chunks
      const chunkTexts = chunks.map(chunk => chunk.content);
      const embeddings = await this.generateEmbeddings(chunkTexts);
      
      // Prepare records for Pinecone
      const records = chunks.map((chunk, index) => {
        // Generate a unique ID for each chunk
        const chunkId = `${meetingId}-chunk-${chunk.metadata.index || index}`;
        
        // Create metadata for the chunk
        const metadata: RecordMetadata = {
          meetingId,
          contentType: 'meeting_transcript',
          timestamp: new Date().toISOString(),
          speakerIds: Array.isArray(chunk.metadata.speakers) 
            ? chunk.metadata.speakers.join(',') 
            : (chunk.metadata.speakers || ''),
          chunkIndex: chunk.metadata.index || index,
          sourceId: meetingId,
          sourceType: 'meeting_transcript',
          // Copy additional fields from chunk metadata
          ...(chunk.metadata.sectionTitle ? { sectionTitle: chunk.metadata.sectionTitle } : {}),
          ...(chunk.metadata.startPosition !== undefined ? { startPosition: chunk.metadata.startPosition } : {}),
          ...(chunk.metadata.endPosition !== undefined ? { endPosition: chunk.metadata.endPosition } : {}),
          // Include optional fields
          ...(options.organizationId ? { organizationId: options.organizationId } : {}),
          // Add any additional metadata from options
          ...(options.metadata || {})
        };
        
        return {
          id: chunkId,
          vector: embeddings[index],
          metadata
        };
      });
      
      // Store in Pinecone
      await this.pineconeConnector.storeVectors(
        this.indexName,
        records,
        namespace
      );
      
      const endTime = performance.now();
      this.logger.info('Meeting context stored successfully', {
        chunkCount: chunks.length,
        meetingId,
        processingTimeMs: (endTime - startTime).toFixed(2)
      });
      
      // Return the IDs of the stored chunks
      return records.map(record => record.id);
    } catch (error) {
      this.logger.error('Error storing meeting context', {
        error: error instanceof Error ? error.message : String(error),
        meetingId,
        chunkCount: chunks.length
      });
      throw error;
    }
  }

  /**
   * Retrieve relevant context based on a query
   * @param query The query to retrieve context for
   * @param options Retrieval options
   * @returns Array of retrieval results
   */
  async retrieveContext(
    query: string,
    options: RetrievalOptions & { meetingId?: string; namespace?: string } = {}
  ): Promise<RetrievalResult[]> {
    const startTime = performance.now();
    const namespace = options.namespace || this.defaultNamespace;
    const limit = options.limit || 5;
    const minScore = options.minScore || 0.6;
    
    try {
      this.logger.debug('Retrieving meeting context', {
        query: query.substring(0, 100),
        namespace,
        limit,
        minScore
      });
      
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Build the filter
      const filter: Record<string, any> = {
        contentType: 'meeting_transcript'
      };
      
      // Add meetingId to filter if provided
      if (options.meetingId) {
        filter.meetingId = options.meetingId;
      }
      
      // Add userId filter if provided
      if (options.userId) {
        filter.organizationId = options.userId;
      }
      
      // Add any additional filters
      if (options.filter) {
        Object.assign(filter, options.filter);
      }
      
      // Query Pinecone
      const queryResponse = await this.pineconeConnector.querySimilar(
        this.indexName,
        queryEmbedding,
        {
          topK: limit * 2, // Request more results for post-filtering
          filter,
          minScore,
          includeValues: false
        },
        namespace
      );
      
      // Transform results
      let results: RetrievalResult[] = queryResponse.map(match => ({
        content: String(match.metadata.content || ''),
        score: match.score,
        sourceId: String(match.metadata.meetingId || match.metadata.sourceId || ''),
        sourceType: 'meeting_transcript',
        metadata: match.metadata || {}
      }));
      
      // Apply post-filtering and deduplication if needed
      if (options.distinctSources) {
        results = this.deduplicateBySource(results);
      }
      
      // Limit final results
      results = results.slice(0, limit);
      
      const endTime = performance.now();
      this.logger.info('Meeting context retrieved', {
        query: query.substring(0, 50),
        resultCount: results.length,
        topScore: results.length > 0 ? results[0].score : 'N/A',
        processingTimeMs: (endTime - startTime).toFixed(2)
      });
      
      return results;
    } catch (error) {
      this.logger.error('Error retrieving meeting context', {
        error: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 100)
      });
      return [];
    }
  }

  /**
   * Process and format retrieved context for consumption
   * @param retrievalResults Results from context retrieval
   * @param options Processing options
   * @returns Processed context
   */
  async processContext(
    retrievalResults: RetrievalResult[],
    options: ContextProcessingOptions = {}
  ): Promise<ProcessedContext> {
    const maxLength = options.maxLength || 4000;
    const format = options.format || 'structured';
    
    try {
      this.logger.debug('Processing meeting context', {
        resultCount: retrievalResults.length,
        format,
        maxLength
      });
      
      if (retrievalResults.length === 0) {
        return {
          formattedContent: 'No relevant context found.',
          sources: [],
          totalSources: 0,
          truncated: false,
          metadata: {}
        };
      }
      
      let formattedContent = '';
      const sourceIds = new Set<string>();
      
      // Format the content based on the requested format
      if (format === 'raw') {
        // Simple concatenation with separators
        formattedContent = retrievalResults
          .map(result => result.content)
          .join('\n\n---\n\n');
      } else if (format === 'condensed') {
        // Remove redundancy and condense
        formattedContent = this.condenseResults(retrievalResults);
      } else if (format === 'structured') {
        // Format as structured context with metadata
        formattedContent = this.formatStructuredContext(retrievalResults, options);
      }
      
      // Truncate if too long
      const truncated = formattedContent.length > maxLength;
      if (truncated) {
        formattedContent = formattedContent.substring(0, maxLength) + '...';
      }
      
      // Collect source IDs
      retrievalResults.forEach(result => {
        if (result.sourceId) {
          sourceIds.add(result.sourceId);
        }
      });
      
      // Collect all unique sources
      const sources = Array.from(sourceIds).map(id => ({
        id,
        type: 'meeting_transcript'
      }));
      
      return {
        formattedContent,
        sources,
        totalSources: sources.length,
        truncated,
        metadata: {
          resultCount: retrievalResults.length,
          format,
          averageScore: this.calculateAverageScore(retrievalResults)
        }
      };
    } catch (error) {
      this.logger.error('Error processing meeting context', {
        error: error instanceof Error ? error.message : String(error),
        resultCount: retrievalResults.length
      });
      
      // Return basic formatted content on error
      return {
        formattedContent: retrievalResults.map(r => r.content).join('\n\n'),
        sources: retrievalResults.map(r => ({ id: r.sourceId, type: r.sourceType })),
        totalSources: new Set(retrievalResults.map(r => r.sourceId)).size,
        truncated: false,
        metadata: {}
      };
    }
  }

  /**
   * Check if context exists for a given source
   * @param sourceId Source identifier (usually meetingId)
   * @param sourceType Type of source
   * @returns Whether context exists
   */
  async contextExists(sourceId: string, sourceType: string): Promise<boolean> {
    try {
      if (sourceType !== 'meeting_transcript') {
        return false;
      }
      
      // Query with a filter for the source ID but limit to 1 result
      const filter = { meetingId: sourceId };
      const namespace = this.defaultNamespace;
      
      // Generate a dummy embedding for the query
      const dummyEmbedding = new Array(1536).fill(0.1);
      
      const results = await this.pineconeConnector.querySimilar(
        this.indexName,
        dummyEmbedding,
        {
          topK: 1,
          filter,
          minScore: 0.0 // Accept any score since we're just checking existence
        },
        namespace
      );
      
      return results.length > 0;
    } catch (error) {
      this.logger.error('Error checking if context exists', {
        error: error instanceof Error ? error.message : String(error),
        sourceId,
        sourceType
      });
      return false;
    }
  }

  /**
   * Delete context for a given source
   * @param sourceId Source identifier (usually meetingId)
   * @param sourceType Type of source
   * @returns Whether delete was successful
   */
  async deleteContext(sourceId: string, sourceType: string): Promise<boolean> {
    if (sourceType !== 'meeting_transcript') {
      this.logger.warn('Attempted to delete non-meeting context', {
        sourceId,
        sourceType
      });
      return false;
    }
    
    try {
      const namespace = this.defaultNamespace;
      const filter = { meetingId: sourceId };
      
      this.logger.info('Deleting meeting context', {
        meetingId: sourceId,
        namespace
      });
      
      await this.pineconeConnector.deleteVectorsByFilter(
        this.indexName,
        filter,
        namespace
      );
      
      return true;
    } catch (error) {
      this.logger.error('Error deleting meeting context', {
        error: error instanceof Error ? error.message : String(error),
        meetingId: sourceId
      });
      return false;
    }
  }

  /**
   * Generate embedding for a single text
   * @param text Text to embed
   * @returns Vector embedding
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    return this.openAiConnector.generateEmbedding(text);
  }

  /**
   * Generate embeddings for multiple texts
   * @param texts Texts to embed
   * @returns Array of vector embeddings
   */
  private async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Process each text individually to ensure correct typing
    if (texts.length === 0) {
      return [];
    }
    
    // Process in smaller batches
    const batchSize = 10;
    const allEmbeddings: number[][] = [];
    
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(text => this.openAiConnector.generateEmbedding(text))
      );
      allEmbeddings.push(...batchResults);
    }
    
    return allEmbeddings;
  }

  /**
   * Deduplicate results by source
   * @param results Results to deduplicate
   * @returns Deduplicated results
   */
  private deduplicateBySource(results: RetrievalResult[]): RetrievalResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      const sourceId = result.sourceId;
      if (seen.has(sourceId)) {
        return false;
      }
      seen.add(sourceId);
      return true;
    });
  }

  /**
   * Calculate the average score of retrieval results
   * @param results Retrieval results
   * @returns Average score
   */
  private calculateAverageScore(results: RetrievalResult[]): number {
    if (results.length === 0) return 0;
    const sum = results.reduce((acc, result) => acc + result.score, 0);
    return sum / results.length;
  }

  /**
   * Format results in a condensed way, removing redundancy
   * @param results Retrieval results
   * @returns Condensed content
   */
  private condenseResults(results: RetrievalResult[]): string {
    // Simple approach: just concatenate but add a little context
    return results.map(result => {
      const meetingId = result.metadata.meetingId || 'unknown';
      const timestamp = result.metadata.timestamp 
        ? new Date(result.metadata.timestamp).toLocaleString() 
        : 'unknown time';
      
      return `CONTEXT [From meeting ${meetingId}, ${timestamp}]:\n${result.content}`;
    }).join('\n\n');
  }

  /**
   * Format context in a structured way with metadata
   * @param results Retrieval results
   * @param options Processing options
   * @returns Structured context
   */
  private formatStructuredContext(
    results: RetrievalResult[],
    options: ContextProcessingOptions
  ): string {
    const highlightRelevance = options.highlightRelevance || false;
    
    // Group by meeting ID
    const meetingGroups: Record<string, RetrievalResult[]> = {};
    
    for (const result of results) {
      const meetingId = result.metadata.meetingId || 'unknown';
      if (!meetingGroups[meetingId]) {
        meetingGroups[meetingId] = [];
      }
      meetingGroups[meetingId].push(result);
    }
    
    // Format each meeting's context
    const formattedGroups = Object.entries(meetingGroups).map(([meetingId, meetingResults]) => {
      // Sort by chunkIndex if available
      meetingResults.sort((a, b) => {
        const indexA = Number(a.metadata.chunkIndex || 0);
        const indexB = Number(b.metadata.chunkIndex || 0);
        return indexA - indexB;
      });
      
      // Get meeting metadata from the first result
      const meetingDate = meetingResults[0].metadata.timestamp 
        ? new Date(meetingResults[0].metadata.timestamp).toLocaleString()
        : 'unknown date';
      
      // Format the meeting header
      const meetingHeader = `## Meeting: ${meetingId} (${meetingDate})`;
      
      // Format each chunk
      const formattedChunks = meetingResults.map(result => {
        let chunkHeader = '';
        
        // Add speaker info if available
        if (result.metadata.speakerIds) {
          chunkHeader += `Speaker(s): ${result.metadata.speakerIds}\n`;
        }
        
        // Add section info if available
        if (result.metadata.sectionTitle) {
          chunkHeader += `Section: ${result.metadata.sectionTitle}\n`;
        }
        
        // Add relevance score if requested
        if (highlightRelevance) {
          chunkHeader += `Relevance: ${(result.score * 100).toFixed(1)}%\n`;
        }
        
        // Combine header and content
        return chunkHeader ? `${chunkHeader}\n${result.content}` : result.content;
      });
      
      // Join everything for this meeting
      return `${meetingHeader}\n\n${formattedChunks.join('\n\n---\n\n')}`;
    });
    
    // Join all meeting groups
    return formattedGroups.join('\n\n==========\n\n');
  }
}