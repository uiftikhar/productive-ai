/**
 * RAG Service Interface
 * 
 * Defines the contract for RAG (Retrieval Augmented Generation) services.
 */
import { RetrievalOptions, RetrievalResult } from '../context/context-provider.interface';
import { PromptEnhancementOptions, PromptWithContext } from '../core/unified-rag.service.interface';
import { ChunkingOptions } from '../core/chunking.interface';

export interface IRagService {
  /**
   * Retrieve relevant context based on a query
   */
  retrieveContext(
    query: string,
    options?: RetrievalOptions
  ): Promise<RetrievalResult[]>;
  
  /**
   * Create a prompt enhanced with relevant context
   */
  createContextEnhancedPrompt(
    query: string,
    promptTemplate: string,
    options?: RetrievalOptions & PromptEnhancementOptions
  ): Promise<PromptWithContext>;
  
  /**
   * Process content for RAG (chunking and storage)
   */
  processContent(
    content: string | object,
    contentType: string,
    metadata: Record<string, any>,
    options?: ChunkingOptions & any
  ): Promise<{ chunkCount: number, sourceId: string }>;
  
  /**
   * Generate embeddings for text
   */
  generateEmbedding(
    text: string,
    options?: any
  ): Promise<number[]>;
} 