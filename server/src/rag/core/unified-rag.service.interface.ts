/**
 * Interface for the unified RAG service
 */
import { ContentChunk, ChunkingOptions, ChunkingResult } from './chunking.interface';
import { 
  RetrievalOptions, 
  RetrievalResult, 
  ContextProcessingOptions, 
  ProcessedContext,
  ContextStorageOptions
} from '../context/context-provider.interface';

export interface EmbeddingOptions {
  model?: string;
  batchSize?: number;
  dimensions?: number;
  useCache?: boolean;
}

export interface PromptEnhancementOptions {
  includeMetadata?: boolean;
  formatAsList?: boolean;
  highlightRelevantSections?: boolean;
  includeSourceInfo?: boolean;
  maxContextLength?: number;
  template?: string;
}

export interface AnalysisOptions {
  deepAnalysis?: boolean;
  extractEntities?: boolean;
  summarize?: boolean;
  highlightKeyPoints?: boolean;
}

export interface PromptWithContext {
  prompt: string;
  context: string;
  sources: Array<{
    id: string;
    type: string;
  }>;
  metadata: Record<string, any>;
}

export interface QueryAnalysisResult {
  enhancedQuery: string;
  extractedEntities: string[];
  inferredIntent: string;
  requiredContextTypes: string[];
  confidence: number;
}

export interface UnifiedRAGService {
  /**
   * Process content for RAG (chunking and indexing)
   * @param content The content to process
   * @param contentType Type of content (e.g., 'transcript', 'document')
   * @param metadata Additional metadata for the content
   * @param options Processing options
   * @returns Information about the processed content
   */
  processContent(
    content: string | object,
    contentType: string,
    metadata: Record<string, any>,
    options?: ChunkingOptions & ContextStorageOptions
  ): Promise<{ chunkCount: number, sourceId: string }>;
  
  /**
   * Retrieve relevant context based on a query
   * @param query The query to retrieve context for
   * @param options Retrieval options
   * @returns Array of retrieval results
   */
  retrieveContext(
    query: string,
    options?: RetrievalOptions
  ): Promise<RetrievalResult[]>;
  
  /**
   * Create a prompt enhanced with relevant context
   * @param query The user query or base prompt
   * @param promptTemplate Template for constructing the final prompt
   * @param options Options for context retrieval and prompt construction
   * @returns Enhanced prompt with context
   */
  createContextEnhancedPrompt(
    query: string,
    promptTemplate: string,
    options?: RetrievalOptions & PromptEnhancementOptions
  ): Promise<PromptWithContext>;
  
  /**
   * Analyze a query to enhance retrieval effectiveness
   * @param query The query to analyze
   * @param options Analysis options
   * @returns Analysis of the query
   */
  analyzeQuery(
    query: string,
    options?: AnalysisOptions
  ): Promise<QueryAnalysisResult>;
  
  /**
   * Generate embeddings for text
   * @param text Text to embed
   * @param options Embedding options
   * @returns Vector embedding
   */
  generateEmbedding(
    text: string,
    options?: EmbeddingOptions
  ): Promise<number[]>;
  
  /**
   * Generate embeddings for multiple texts
   * @param texts Array of texts to embed
   * @param options Embedding options
   * @returns Array of vector embeddings
   */
  generateEmbeddings(
    texts: string[],
    options?: EmbeddingOptions
  ): Promise<number[][]>;
  
  /**
   * Delete content from the knowledge base
   * @param sourceId Source identifier
   * @param sourceType Type of source
   * @returns Whether delete was successful
   */
  deleteContent(sourceId: string, sourceType: string): Promise<boolean>;
} 