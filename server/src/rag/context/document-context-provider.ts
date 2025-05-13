/**
 * Document Context Provider
 * 
 * Provides document context for the RAG framework.
 * Manages the storage, retrieval, and processing of document content.
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

export interface DocumentContextOptions extends ContextStorageOptions {
  documentId?: string;
  documentType?: 'pdf' | 'text' | 'markdown' | 'html' | string;
  organizationId?: string;
  sourceId?: string;
  namespace?: string;
  authors?: string[];
  createdAt?: string;
  title?: string;
  tags?: string[];
}

export class DocumentContextProvider implements ContextProvider {
  private logger: Logger;
  private openAiConnector: OpenAIConnector;
  private pineconeConnector: PineconeConnector;
  private indexName: string;
  
  // Default namespace for document context
  private defaultNamespace = 'documents';
  
  constructor(options: {
    logger?: Logger;
    openAiConnector?: OpenAIConnector;
    pineconeConnector?: PineconeConnector;
    indexName?: string;
    defaultNamespace?: string;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.openAiConnector = options.openAiConnector || new OpenAIConnector({ logger: this.logger });
    this.pineconeConnector = options.pineconeConnector || new PineconeConnector({ 
      logger: this.logger,
      defaultNamespace: this.defaultNamespace 
    });
    this.indexName = options.indexName || VectorIndexes.TRANSCRIPT_EMBEDDINGS;
    
    if (options.defaultNamespace) {
      this.defaultNamespace = options.defaultNamespace;
    }
  }

  /**
   * Store content chunks with embeddings for later retrieval
   * @param chunks Content chunks to store
   * @param options Storage options
   * @returns Array of stored chunk IDs
   */
  async storeContext(
    chunks: ContentChunk[],
    options: DocumentContextOptions = {}
  ): Promise<string[]> {
    const startTime = performance.now();
    const namespace = options.namespace || this.defaultNamespace;
    const documentId = options.documentId || options.sourceId || `doc-${Date.now()}`;
    const documentType = options.documentType || 'text';
    
    try {
      this.logger.info('Storing document context', {
        chunkCount: chunks.length,
        documentId,
        documentType,
        namespace
      });
      
      // Generate embeddings for all chunks
      const chunkTexts = chunks.map(chunk => chunk.content);
      const embeddings = await this.generateEmbeddings(chunkTexts);
      
      // Prepare records for Pinecone
      const records = chunks.map((chunk, index) => {
        // Generate a unique ID for each chunk
        const chunkId = `${documentId}-chunk-${chunk.metadata.index || index}`;
        
        // Create metadata for the chunk
        const metadata: Record<string, any> = {
          ...chunk.metadata,
          documentId,
          documentType,
          organizationId: options.organizationId,
          contentType: 'document',
          timestamp: new Date().toISOString(),
          chunkIndex: chunk.metadata.index || index,
          // Add document-specific metadata
          title: options.title || '',
          authors: Array.isArray(options.authors) ? options.authors.join(',') : '',
          tags: Array.isArray(options.tags) ? options.tags.join(',') : '',
          // Add any additional metadata from options
          ...options.metadata
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
      this.logger.info('Document context stored successfully', {
        chunkCount: chunks.length,
        documentId,
        documentType,
        processingTimeMs: (endTime - startTime).toFixed(2)
      });
      
      // Return the IDs of the stored chunks
      return records.map(record => record.id);
    } catch (error) {
      this.logger.error('Error storing document context', {
        error: error instanceof Error ? error.message : String(error),
        documentId,
        documentType,
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
    options: RetrievalOptions & { documentId?: string; documentType?: string; namespace?: string } = {}
  ): Promise<RetrievalResult[]> {
    const startTime = performance.now();
    const namespace = options.namespace || this.defaultNamespace;
    const limit = options.limit || 5;
    const minScore = options.minScore || 0.6;
    
    try {
      this.logger.debug('Retrieving document context', {
        query: query.substring(0, 100),
        namespace,
        limit,
        minScore,
        documentType: options.documentType
      });
      
      // Generate embedding for the query
      const queryEmbedding = await this.generateEmbedding(query);
      
      // Build the filter
      const filter: Record<string, any> = {
        contentType: 'document'
      };
      
      // Add documentId to filter if provided
      if (options.documentId) {
        filter.documentId = options.documentId;
      }
      
      // Add documentType to filter if provided
      if (options.documentType) {
        filter.documentType = options.documentType;
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
        sourceId: String(match.metadata.documentId || match.metadata.sourceId || ''),
        sourceType: 'document',
        metadata: match.metadata || {}
      }));
      
      // Apply post-filtering and deduplication if needed
      if (options.distinctSources) {
        results = this.deduplicateBySource(results);
      }
      
      // Limit final results
      results = results.slice(0, limit);
      
      const endTime = performance.now();
      this.logger.info('Document context retrieved', {
        query: query.substring(0, 50),
        resultCount: results.length,
        topScore: results.length > 0 ? results[0].score : 'N/A',
        processingTimeMs: (endTime - startTime).toFixed(2)
      });
      
      return results;
    } catch (error) {
      this.logger.error('Error retrieving document context', {
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
      this.logger.debug('Processing document context', {
        resultCount: retrievalResults.length,
        format,
        maxLength
      });
      
      if (retrievalResults.length === 0) {
        return {
          formattedContent: 'No relevant document context found.',
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
        type: 'document'
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
      this.logger.error('Error processing document context', {
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
   * @param sourceId Source identifier (usually documentId)
   * @param sourceType Type of source
   * @returns Whether context exists
   */
  async contextExists(sourceId: string, sourceType: string): Promise<boolean> {
    try {
      if (sourceType !== 'document') {
        return false;
      }
      
      // Query with a filter for the source ID but limit to 1 result
      const filter = { documentId: sourceId };
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
   * @param sourceId Source identifier (usually documentId)
   * @param sourceType Type of source
   * @returns Whether delete was successful
   */
  async deleteContext(sourceId: string, sourceType: string): Promise<boolean> {
    if (sourceType !== 'document') {
      this.logger.warn('Attempted to delete non-document context', {
        sourceId,
        sourceType
      });
      return false;
    }
    
    try {
      const namespace = this.defaultNamespace;
      const filter = { documentId: sourceId };
      
      this.logger.info('Deleting document context', {
        documentId: sourceId,
        namespace
      });
      
      await this.pineconeConnector.deleteVectorsByFilter(
        this.indexName,
        filter,
        namespace
      );
      
      return true;
    } catch (error) {
      this.logger.error('Error deleting document context', {
        error: error instanceof Error ? error.message : String(error),
        documentId: sourceId
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
    // Handle the embedding of multiple texts
    if (texts.length === 0) {
      return [];
    }
    
    // For multiple texts, use batch processing
    try {
      // Process in manageable batches of 10 to avoid rate limits
      const batchSize = 10;
      const allEmbeddings: number[][] = [];
      
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const batchEmbeddings = await Promise.all(
          batch.map(text => this.openAiConnector.generateEmbedding(text))
        );
        allEmbeddings.push(...batchEmbeddings);
      }
      
      return allEmbeddings;
    } catch (error) {
      this.logger.error('DOCUMENT-CONTEXT-PROVIDER: Error generating embeddings', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
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
    return results.map(result => {
      const docId = result.metadata.documentId || 'unknown';
      const title = result.metadata.title || 'Untitled';
      const docType = result.metadata.documentType || 'document';
      
      return `CONTEXT [From ${docType}: ${title} (${docId})]:\n${result.content}`;
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
    
    // Group by document ID
    const documentGroups: Record<string, RetrievalResult[]> = {};
    
    for (const result of results) {
      const docId = result.metadata.documentId || result.sourceId || 'unknown';
      if (!documentGroups[docId]) {
        documentGroups[docId] = [];
      }
      documentGroups[docId].push(result);
    }
    
    // Format each document's context
    const formattedGroups = Object.entries(documentGroups).map(([docId, docResults]) => {
      // Sort by chunkIndex if available
      docResults.sort((a, b) => {
        const indexA = Number(a.metadata.chunkIndex || 0);
        const indexB = Number(b.metadata.chunkIndex || 0);
        return indexA - indexB;
      });
      
      // Get document metadata from the first result
      const docTitle = docResults[0].metadata.title || 'Untitled';
      const docType = docResults[0].metadata.documentType || 'document';
      const authors = docResults[0].metadata.authors || '';
      
      // Format the document header
      let docHeader = `## Document: ${docTitle} (${docId})`;
      if (authors) {
        docHeader += `\nAuthors: ${authors}`;
      }
      docHeader += `\nType: ${docType}`;
      
      // Format each chunk
      const formattedChunks = docResults.map(result => {
        let chunkHeader = '';
        
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
      
      // Join everything for this document
      return `${docHeader}\n\n${formattedChunks.join('\n\n---\n\n')}`;
    });
    
    // Join all document groups
    return formattedGroups.join('\n\n==========\n\n');
  }
} 