import { Injectable, Logger, Inject } from '@nestjs/common';
import { RetrievalService, RetrievedDocument, RetrievalOptions } from './retrieval.service';
import { EmbeddingService } from '../embedding/embedding.service';
import { LlmService } from '../langgraph/llm/llm.service';
import { VectorIndexes } from '../pinecone/pinecone-index.service';
import { StateService } from '../langgraph/state/state.service';
import { IRagService } from './interfaces/rag-service.interface';
import { IRetrievalService } from './interfaces/retrieval-service.interface';
import { RETRIEVAL_SERVICE, RAG_SERVICE } from './constants/injection-tokens';
import { EMBEDDING_SERVICE } from '../embedding/constants/injection-tokens';
import { LLM_SERVICE } from '../langgraph/llm/constants/injection-tokens';
import { STATE_SERVICE } from '../langgraph/state/constants/injection-tokens';

export interface RagOptions {
  retrievalOptions?: RetrievalOptions;
  maxTokens?: number;
  temperature?: number;
  modelName?: string;
}

/**
 * Types for RAG state
 */
export interface RetrievedContext {
  query: string;
  documents: RetrievedDocument[];
  timestamp: string;
}

/**
 * RAG Service for enhancing LLM interactions with retrieved context
 */
@Injectable()
export class RagService implements IRagService {
  private readonly logger = new Logger(RagService.name);

  constructor(
    @Inject(RETRIEVAL_SERVICE) private readonly retrievalService: IRetrievalService,
    @Inject(EMBEDDING_SERVICE) private readonly embeddingService: EmbeddingService,
    @Inject(LLM_SERVICE) private readonly llmService: LlmService,
    @Inject(STATE_SERVICE) private readonly stateService: StateService,
  ) {}

  /**
   * Get relevant context for a query
   */
  async getContext(
    query: string,
    options: RetrievalOptions = {},
  ): Promise<RetrievedDocument[]> {
    return this.retrievalService.retrieveDocuments(query, options);
  }

  /**
   * Simple text chunking method
   */
  chunkText(
    text: string,
    options: {
      chunkSize?: number;
      chunkOverlap?: number;
    } = {},
  ): string[] {
    const chunkSize = options.chunkSize || 1000;
    const chunkOverlap = options.chunkOverlap || 200;
    
    // Split text into tokens (words)
    const tokens = text.split(' ');
    const chunks: string[] = [];
    
    // Process chunks with overlap
    for (let i = 0; i < tokens.length; i += chunkSize - chunkOverlap) {
      const chunk = tokens.slice(i, i + chunkSize).join(' ');
      if (chunk.trim()) {
        chunks.push(chunk);
      }
    }
    
    return chunks.length > 0 ? chunks : [text];
  }

  /**
   * Process documents for RAG storage
   */
  async processDocumentsForRag(
    documents: Array<{
      id: string;
      content: string;
      metadata?: Record<string, any>;
    }>,
    options: {
      indexName?: VectorIndexes | string;
      namespace?: string;
    } = {},
  ): Promise<string[]> {
    const indexName = options.indexName || VectorIndexes.MEETING_ANALYSIS;
    const namespace = options.namespace || 'documents';
    
    try {
      // Process each document
      const processedDocIds: string[] = [];
      
      for (const doc of documents) {
        const chunks = this.chunkText(doc.content, {
          chunkSize: 1000,
          chunkOverlap: 200,
        });
        
        const processedChunks = await Promise.all(
          chunks.map(async (chunk, idx) => {
            const chunkId = `${doc.id}-chunk-${idx}`;
            const embedding = await this.embeddingService.generateEmbedding(chunk);
            
            // Store in Pinecone
            await this.storeVectorInPinecone(
              indexName,
              chunkId,
              embedding,
              {
                content: chunk,
                document_id: doc.id,
                chunk_index: idx,
                chunk_count: chunks.length,
                ...doc.metadata,
              },
              namespace,
            );
            
            return chunkId;
          }),
        );
        
        processedDocIds.push(doc.id);
      }
      
      return processedDocIds;
    } catch (error) {
      this.logger.error(`Error processing documents for RAG: ${error.message}`);
      throw error;
    }
  }

  /**
   * Enhance graph state with RAG context
   */
  async enhanceStateWithContext<T extends Record<string, any>>(
    state: T,
    query: string,
    options: RetrievalOptions = {},
  ): Promise<T & { retrievedContext: RetrievedContext }> {
    try {
      // Retrieve context
      const documents = await this.retrievalService.retrieveDocuments(query, options);
      
      if (documents.length === 0) {
        this.logger.debug(`No relevant context found for query: ${query.substring(0, 30)}...`);
        // Create empty context if no documents found
        return {
          ...state,
          retrievedContext: {
            query,
            documents: [],
            timestamp: new Date().toISOString(),
          }
        };
      }
      
      // Add retrieved context to state
      const retrievedContext: RetrievedContext = {
        query,
        documents,
        timestamp: new Date().toISOString(),
      };
      
      // Create a new state with the retrieved context
      return {
        ...state,
        retrievedContext,
      };
    } catch (error) {
      this.logger.error(`Error enhancing state with context: ${error.message}`);
      // Return state with empty context on error
      return {
        ...state,
        retrievedContext: {
          query,
          documents: [],
          timestamp: new Date().toISOString(),
        }
      };
    }
  }

  /**
   * Create a RAG node for LangGraph
   */
  createRagRetrievalNode<T extends Record<string, any>>(
    queryExtractor: (state: T) => string,
    options: RetrievalOptions = {},
  ): (state: T) => Promise<Partial<T>> {
    return async (state: T): Promise<Partial<T>> => {
      try {
        // Extract query from state
        const query = queryExtractor(state);
        
        if (!query) {
          this.logger.warn('No query extracted from state');
          return {};
        }
        
        // Retrieve context
        const documents = await this.retrievalService.retrieveDocuments(query, options);
        
        // Create retrieved context
        const retrievedContext: RetrievedContext = {
          query,
          documents,
          timestamp: new Date().toISOString(),
        };
        
        // The type assertion is necessary here because we can't statically ensure
        // that retrievedContext is a valid key of T
        return { retrievedContext } as unknown as Partial<T>;
      } catch (error) {
        this.logger.error(`Error in RAG retrieval node: ${error.message}`);
        return {};
      }
    };
  }

  /**
   * Add RAG capabilities to a LangGraph flow
   */
  addRagToGraph(graph: any, options: RetrievalOptions = {}): void {
    // Add RAG node
    graph.addNode('rag_retrieval', this.createRagRetrievalNode(
      (state) => {
        // Default query extractor uses transcript
        return state.transcript || '';
      },
      options,
    ));
    
    // Modify graph edges - should be called after initial graph setup
    // but before compilation
    graph.addEdge('rag_retrieval', 'topic_extraction');
    
    // Move the start edge to point to RAG retrieval
    // This requires replacing the existing START -> topic_extraction edge
    const edges = graph['edges'];
    const startEdges = edges.filter(e => e.source === '__start__');
    
    for (const edge of startEdges) {
      if (edge.target === 'topic_extraction') {
        // Remove the original edge
        graph['edges'] = edges.filter(e => e !== edge);
        
        // Add the new edge
        graph.addEdge('__start__', 'rag_retrieval');
        break;
      }
    }
  }

  /**
   * Helper method to store a vector in Pinecone
   * This is needed because the RetrievalService doesn't expose this directly
   */
  private async storeVectorInPinecone(
    indexName: string,
    id: string,
    vector: number[],
    metadata: Record<string, any>,
    namespace?: string
  ): Promise<void> {
    // Use the injected services directly
    const pineconeService = Reflect.get(this.embeddingService, 'pineconeService');
    if (!pineconeService) {
      throw new Error('Cannot access pineconeService. Service structure may have changed.');
    }
    
    return pineconeService.storeVector(indexName, id, vector, metadata, namespace);
  }
} 