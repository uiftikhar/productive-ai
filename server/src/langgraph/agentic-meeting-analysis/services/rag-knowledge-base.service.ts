/**
 * RAG Knowledge Base Service for Meeting Analysis
 * 
 * This service provides retrieval-augmented generation capabilities
 * for meeting analysis agents, leveraging vector databases and LLMs
 * for context-enhanced analysis.
 */
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { 
  KnowledgeBaseConnector, 
  KnowledgeDocument, 
  SearchResult 
} from '../../core/integration/connectors/knowledge-base-connector.base';
import { AgentExpertise } from '../interfaces/agent.interface';
import { MeetingTranscript, MeetingMetadata } from '../interfaces/state.interface';

/**
 * Interface for embedded content
 */
export interface EmbeddedContent {
  id: string;
  content: string;
  embedding: number[];
  metadata: Record<string, any>;
}

/**
 * Query context for RAG
 */
export interface RagQueryContext {
  query: string;
  expertise?: AgentExpertise;
  meetingId?: string;
  sessionId?: string;
  maxResults?: number;
  threshold?: number;
  includeMetadata?: boolean;
}

/**
 * Configuration for RAG knowledge base service
 */
export interface RagKnowledgeBaseConfig {
  connector: KnowledgeBaseConnector;
  logger?: Logger;
  defaultCollection?: string;
  embeddingDimension?: number;
  contextWindowSize?: number;
  similarityThreshold?: number;
  maxRetrievalResults?: number;
}

/**
 * RAG Knowledge Base Service implementation for Meeting Analysis
 */
export class RagKnowledgeBaseService {
  private connector: KnowledgeBaseConnector;
  private logger: Logger;
  private defaultCollection: string;
  private embeddingDimension: number;
  private contextWindowSize: number;
  private similarityThreshold: number;
  private maxRetrievalResults: number;
  
  /**
   * Create a new RAG Knowledge Base Service
   */
  constructor(config: RagKnowledgeBaseConfig) {
    this.connector = config.connector;
    this.logger = config.logger || new ConsoleLogger();
    this.defaultCollection = config.defaultCollection || 'meeting-analysis';
    this.embeddingDimension = config.embeddingDimension || 1536; // Default for OpenAI embeddings
    this.contextWindowSize = config.contextWindowSize || 4000;
    this.similarityThreshold = config.similarityThreshold || 0.7;
    this.maxRetrievalResults = config.maxRetrievalResults || 5;
  }
  
  /**
   * Initialize the knowledge base (connect to the underlying connector)
   */
  public async initialize(): Promise<void> {
    if (!this.connector.isConnected()) {
      this.logger.info('Connecting to knowledge base connector');
      await this.connector.connect();
    }
    
    // Ensure collection exists
    await this.ensureCollectionExists(this.defaultCollection);
  }
  
  /**
   * Ensure the collection exists in the knowledge base
   */
  private async ensureCollectionExists(collection: string): Promise<void> {
    try {
      const collections = await this.connector.listCollections();
      const exists = collections.some(c => c.name === collection);
      
      if (!exists) {
        this.logger.info(`Collection ${collection} does not exist, creating it`);
        // Create collection logic depends on the specific connector implementation
        // This might need to be delegated to the connector
      }
    } catch (error) {
      this.logger.error(`Error checking collection ${collection}`, { error });
      throw error;
    }
  }
  
  /**
   * Index a meeting transcript in the knowledge base
   */
  public async indexMeetingTranscript(
    transcript: MeetingTranscript,
    metadata: MeetingMetadata,
    options?: {
      chunkSize?: number;
      chunkOverlap?: number;
      collection?: string;
    }
  ): Promise<string[]> {
    const collection = options?.collection || this.defaultCollection;
    const chunkSize = options?.chunkSize || 1000;
    const chunkOverlap = options?.chunkOverlap || 200;
    
    try {
      this.logger.info(`Indexing meeting transcript for meeting ${metadata.meetingId}`);
      
      // Split transcript into chunks for better retrieval
      const chunks = this.chunkTranscript(transcript, chunkSize, chunkOverlap);
      
      // Store each chunk in the knowledge base
      const documentIds: string[] = [];
      
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const docId = `meeting-${metadata.meetingId}-chunk-${i}`;
        
        // Create document
        const document: Partial<KnowledgeDocument> = {
          id: docId,
          title: `${metadata.title || 'Meeting'} - Part ${i+1}`,
          content: chunk,
          contentType: 'text',
          createdAt: new Date(metadata.date || Date.now()),
          updatedAt: new Date(),
          tags: ['meeting', 'transcript'],
          category: 'meeting-transcript',
          collections: [collection],
          metadata: {
            part: i,
            totalParts: chunks.length,
            ...metadata
          }
        };
        
        // Store in knowledge base
        await this.connector.createDocument({
          document,
          collection
        });
        
        documentIds.push(docId);
      }
      
      this.logger.info(`Indexed meeting transcript into ${documentIds.length} chunks`);
      return documentIds;
      
    } catch (error) {
      this.logger.error(`Error indexing meeting transcript`, { 
        meetingId: metadata.meetingId,
        error 
      });
      throw error;
    }
  }
  
  /**
   * Retrieve relevant context based on a query
   */
  public async retrieveContext(
    context: RagQueryContext
  ): Promise<SearchResult[]> {
    const collection = context.meetingId 
      ? `meeting-${context.meetingId}` 
      : this.defaultCollection;
    
    const maxResults = context.maxResults || this.maxRetrievalResults;
    const threshold = context.threshold || this.similarityThreshold;
    
    try {
      // Perform vector search using the query
      const results = await this.connector.search({
        query: context.query,
        collection,
        limit: maxResults,
        filters: context.meetingId ? { 
          meetingId: context.meetingId 
        } : undefined
      });
      
      // Filter results by similarity threshold
      const filteredResults = results.filter(result => 
        result.score >= threshold
      );
      
      return filteredResults;
    } catch (error) {
      this.logger.error(`Error retrieving context for query`, {
        query: context.query,
        collection,
        error
      });
      throw error;
    }
  }
  
  /**
   * Format retrieved context for agent consumption
   */
  public formatRetrievedContext(
    results: SearchResult[],
    maxTokens: number = this.contextWindowSize
  ): string {
    // Simple formatter that concatenates results
    let context = "### Relevant Context\n\n";
    let currentLength = context.length;
    
    for (const result of results) {
      const document = result.document;
      const content = document.content;
      
      // Estimate the token count (rough approximation)
      const tokenEstimate = content.length / 4;
      
      // Check if adding this would exceed the limit
      if (currentLength + content.length > maxTokens * 4) {
        break;
      }
      
      // Add formatted content
      context += `Source: ${document.title}\n`;
      context += `Relevance: ${(result.score * 100).toFixed(1)}%\n`;
      context += `${content}\n\n`;
      
      currentLength += content.length;
    }
    
    return context;
  }
  
  /**
   * Split transcript into overlapping chunks
   */
  private chunkTranscript(
    transcript: MeetingTranscript, 
    chunkSize: number, 
    chunkOverlap: number
  ): string[] {
    const chunks: string[] = [];
    const fullText = this.transcriptToText(transcript);
    
    if (fullText.length <= chunkSize) {
      return [fullText];
    }
    
    let startIndex = 0;
    while (startIndex < fullText.length) {
      const endIndex = Math.min(startIndex + chunkSize, fullText.length);
      chunks.push(fullText.substring(startIndex, endIndex));
      startIndex += chunkSize - chunkOverlap;
    }
    
    return chunks;
  }
  
  /**
   * Convert transcript to plain text
   */
  private transcriptToText(transcript: MeetingTranscript): string {
    if (typeof transcript === 'string') {
      return transcript;
    }
    
    if (Array.isArray(transcript)) {
      return transcript
        .map(entry => {
          if (typeof entry === 'string') {
            return entry;
          }
          
          const speaker = entry.speaker ? `${entry.speaker}: ` : '';
          const timestamp = entry.timestamp ? `[${entry.timestamp}] ` : '';
          return `${timestamp}${speaker}${entry.text || ''}`;
        })
        .join('\n\n');
    }
    
    return JSON.stringify(transcript);
  }
  
  /**
   * Add external knowledge to the knowledge base (for context enhancement)
   */
  public async addExternalKnowledge(
    content: string,
    metadata: Record<string, any>,
    collection?: string
  ): Promise<string> {
    const documentId = `external-${uuidv4()}`;
    const targetCollection = collection || this.defaultCollection;
    
    try {
      // Create document
      const document: Partial<KnowledgeDocument> = {
        id: documentId,
        title: metadata.title || 'External Knowledge',
        content,
        contentType: metadata.contentType || 'text',
        createdAt: new Date(),
        updatedAt: new Date(),
        tags: ['external', ...(metadata.tags || [])],
        category: metadata.category || 'external-knowledge',
        collections: [targetCollection],
        metadata
      };
      
      // Store in knowledge base
      await this.connector.createDocument({
        document,
        collection: targetCollection
      });
      
      return documentId;
    } catch (error) {
      this.logger.error(`Error adding external knowledge`, { error });
      throw error;
    }
  }
  
  /**
   * Delete documents from the knowledge base
   */
  public async deleteDocument(documentId: string, collection?: string): Promise<boolean> {
    try {
      return await this.connector.deleteDocument({
        documentId,
        collection: collection || this.defaultCollection
      });
    } catch (error) {
      this.logger.error(`Error deleting document ${documentId}`, { error });
      throw error;
    }
  }
  
  /**
   * Get health status of the knowledge base
   */
  public async getHealth(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details?: Record<string, any>;
  }> {
    return this.connector.checkHealth();
  }
} 