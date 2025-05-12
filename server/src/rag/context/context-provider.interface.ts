/**
 * Interfaces for context providers in the RAG framework
 */
import { ContentChunk } from '../core/chunking.interface';

export interface RetrievalOptions {
  limit?: number;
  minScore?: number;
  filter?: Record<string, any>;
  reranking?: boolean;
  distinctSources?: boolean;
  useCachedResults?: boolean;
  expandResults?: boolean;
  includeMetadata?: boolean;
  contextType?: string | string[];
  userId?: string;
  contextScope?: 'global' | 'user' | 'organization';
}

export interface RetrievalResult {
  content: string;
  score: number;
  sourceId: string;
  sourceType: string;
  metadata: Record<string, any>;
  relevanceExplanation?: string;
}

export interface ContextProcessingOptions {
  format?: 'raw' | 'condensed' | 'structured';
  maxLength?: number;
  removeRedundancy?: boolean;
  highlightRelevance?: boolean;
  structureOutput?: boolean;
}

export interface ProcessedContext {
  formattedContent: string;
  sources: Array<{
    id: string;
    type: string;
  }>;
  totalSources: number;
  truncated: boolean;
  metadata: Record<string, any>;
}

export interface ContextStorageOptions {
  userId?: string;
  organizationId?: string;
  namespace?: string;
  metadata?: Record<string, any>;
  ttl?: number; // Time to live in seconds
  overwrite?: boolean;
}

export interface ContextProvider {
  /**
   * Store content chunks with embeddings for later retrieval
   * @param chunks Content chunks to store
   * @param options Storage options
   * @returns Array of stored chunk IDs
   */
  storeContext(
    chunks: ContentChunk[], 
    options?: ContextStorageOptions
  ): Promise<string[]>;
  
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
   * Process and format retrieved context for consumption
   * @param retrievalResults Results from context retrieval
   * @param options Processing options
   * @returns Processed context
   */
  processContext(
    retrievalResults: RetrievalResult[], 
    options?: ContextProcessingOptions
  ): Promise<ProcessedContext>;
  
  /**
   * Check if context exists for a given source
   * @param sourceId Source identifier
   * @param sourceType Type of source
   * @returns Whether context exists
   */
  contextExists(sourceId: string, sourceType: string): Promise<boolean>;
  
  /**
   * Delete context for a given source
   * @param sourceId Source identifier
   * @param sourceType Type of source
   * @returns Whether delete was successful
   */
  deleteContext(sourceId: string, sourceType: string): Promise<boolean>;
} 