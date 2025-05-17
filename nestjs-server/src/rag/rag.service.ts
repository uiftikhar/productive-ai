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
import { PineconeService } from '../pinecone/pinecone.service';
import { PINECONE_SERVICE } from '../pinecone/constants/injection-tokens';
import { DimensionAdapterService } from '../embedding/dimension-adapter.service';

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
    @Inject(PINECONE_SERVICE) private readonly pineconeService: PineconeService,
    private readonly dimensionAdapter: DimensionAdapterService,
  ) {
    this.logger.log('RAG Service initialized');
  }

  /**
   * Get relevant context for a query
   */
  async getContext(
    query: string,
    options: RetrievalOptions = {},
  ): Promise<RetrievedDocument[]> {
    this.logger.log(`Getting context for query: "${query.substring(0, 50)}..."`);
    this.logger.debug(`Retrieval options: ${JSON.stringify(options)}`);
    
    try {
      const documents = await this.retrievalService.retrieveDocuments(query, options);
      this.logger.log(`Retrieved ${documents.length} documents for context`);
      this.logger.debug(`First document sample: ${JSON.stringify(documents[0]?.metadata || {})}`);
      return documents;
    } catch (error) {
      this.logger.error(`Error retrieving context: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Simple text chunking method
   * TODO: Use a more sophisticated semantic and adaptiv chunking method
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
    
    this.logger.debug(`Chunking text of length ${text.length} with chunkSize=${chunkSize}, overlap=${chunkOverlap}`);
    
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
    
    this.logger.debug(`Created ${chunks.length} chunks from text`);
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
    
    this.logger.log(`Processing ${documents.length} documents for RAG storage`);
    this.logger.debug(`Using index "${indexName}" and namespace "${namespace}"`);
    
    try {
      // Process each document
      const processedDocIds: string[] = [];
      
      for (const doc of documents) {
        this.logger.debug(`Processing document: ${doc.id}, content length: ${doc.content.length}`);
        this.logger.debug(`Document metadata: ${JSON.stringify(doc.metadata || {})}`);
        
        const chunks = this.chunkText(doc.content, {
          chunkSize: 1000,
          chunkOverlap: 200,
        });
        
        this.logger.log(`Generated ${chunks.length} chunks for document ${doc.id}`);
        
        const processedChunks = await Promise.all(
          chunks.map(async (chunk, idx) => {
            const chunkId = `${doc.id}-chunk-${idx}`;
            this.logger.debug(`Generating embedding for chunk ${chunkId}`);
            
            try {
              // Generate embedding
              const originalEmbedding = await this.embeddingService.generateEmbedding(chunk);
              this.logger.debug(`Generated embedding of length ${originalEmbedding.length} for chunk ${chunkId}`);
              
              // Check if dimension adaptation is needed
              let embeddingToStore = originalEmbedding;
              const targetDimension = this.dimensionAdapter.getTargetDimension();
              
              if (this.dimensionAdapter.needsAdaptation(originalEmbedding.length)) {
                this.logger.debug(`Adapting embedding dimension from ${originalEmbedding.length} to ${targetDimension}`);
                embeddingToStore = this.dimensionAdapter.adaptDimension(originalEmbedding);
                this.logger.debug(`Adapted embedding has length ${embeddingToStore.length}`);
              }
              
              // Store in Pinecone
              const metadata = {
                content: chunk,
                document_id: doc.id,
                chunk_index: idx,
                chunk_count: chunks.length,
                ...doc.metadata,
              };
              
              this.logger.debug(`Storing vector in Pinecone for chunk ${chunkId}`);
              this.logger.debug(`Vector dimensions: ${embeddingToStore.length}, target dimensions: ${targetDimension}`);
              
              await this.storeVectorInPinecone(
                indexName,
                chunkId,
                embeddingToStore,
                metadata,
                namespace,
              );
              
              this.logger.debug(`Successfully stored vector for chunk ${chunkId}`);
              return chunkId;
            } catch (chunkError) {
              this.logger.error(`Error processing chunk ${idx} of document ${doc.id}: ${chunkError.message}`, chunkError.stack);
              throw chunkError;
            }
          }),
        );
        
        this.logger.log(`Successfully processed all chunks for document ${doc.id}`);
        processedDocIds.push(doc.id);
      }
      
      this.logger.log(`Completed processing documents for RAG: ${processedDocIds.join(', ')}`);
      return processedDocIds;
    } catch (error) {
      this.logger.error(`Error processing documents for RAG: ${error.message}`, error.stack);
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
    this.logger.log(`Enhancing state with RAG context for query: "${query.substring(0, 50)}..."`);
    
    try {
      // Retrieve context
      this.logger.debug(`Retrieving documents with options: ${JSON.stringify(options)}`);
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
      
      this.logger.log(`Retrieved ${documents.length} documents for context enhancement`);
      this.logger.debug(`Document samples: ${JSON.stringify(documents.slice(0, 2).map(d => d.metadata))}`);
      
      // Add retrieved context to state
      const retrievedContext: RetrievedContext = {
        query,
        documents,
        timestamp: new Date().toISOString(),
      };
      
      // Create a new state with the retrieved context
      this.logger.debug(`Enhancing state with ${documents.length} context documents`);
      return {
        ...state,
        retrievedContext,
      };
    } catch (error) {
      this.logger.error(`Error enhancing state with context: ${error.message}`, error.stack);
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
    this.logger.log('Creating RAG retrieval node for LangGraph');
    this.logger.debug(`Retrieval options: ${JSON.stringify(options)}`);
    
    return async (state: T): Promise<Partial<T>> => {
      try {
        // Extract query from state
        const query = queryExtractor(state);
        
        this.logger.log(`RAG node executing with query: "${query?.substring(0, 30)}..."`);
        this.logger.debug(`Full state keys: ${Object.keys(state).join(', ')}`);
        
        if (!query) {
          this.logger.warn('No query extracted from state');
          return {};
        }
        
        // Retrieve context
        this.logger.debug(`Retrieving documents for query: "${query.substring(0, 30)}..."`);
        const documents = await this.retrievalService.retrieveDocuments(query, options);
        
        this.logger.log(`RAG node retrieved ${documents.length} documents`);
        
        // Create retrieved context
        const retrievedContext: RetrievedContext = {
          query,
          documents,
          timestamp: new Date().toISOString(),
        };
        
        this.logger.debug(`RAG node returning context with ${documents.length} documents`);
        // The type assertion is necessary here because we can't statically ensure
        // that retrievedContext is a valid key of T
        return { retrievedContext } as unknown as Partial<T>;
      } catch (error) {
        this.logger.error(`Error in RAG retrieval node: ${error.message}`, error.stack);
        return {};
      }
    };
  }

  /**
   * Add RAG capabilities to a LangGraph flow
   */
  addRagToGraph(graph: any, options: RetrievalOptions = {}): void {
    this.logger.log('Adding RAG node to graph flow');
    
    // Add RAG node
    graph.addNode('rag_retrieval', this.createRagRetrievalNode(
      (state) => {
        // Default query extractor uses transcript
        const query = state.transcript || '';
        this.logger.debug(`Extracted query from transcript: "${query.substring(0, 30)}..."`);
        return query;
      },
      options,
    ));
    
    this.logger.log('Modifying graph edges to include RAG node');
    
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
        this.logger.log('Updated graph flow: __start__ -> rag_retrieval -> topic_extraction');
        break;
      }
    }
    
    this.logger.log('Successfully added RAG capabilities to graph');
  }

  /**
   * Helper method to store a vector in Pinecone
   */
  private async storeVectorInPinecone(
    indexName: string,
    id: string,
    vector: number[],
    metadata: Record<string, any>,
    namespace?: string
  ): Promise<void> {
    this.logger.debug(`Storing vector in Pinecone: index=${indexName}, id=${id}, namespace=${namespace || 'default'}`);
    this.logger.debug(`Vector length: ${vector.length}, metadata keys: ${Object.keys(metadata).join(', ')}`);
    
    try {
      // Use directly injected pineconeService instead of trying to access it through embeddingService
      await this.pineconeService.storeVector(indexName, id, vector, metadata, namespace);
      this.logger.debug(`Successfully stored vector ${id} in Pinecone`);
    } catch (error) {
      this.logger.error(`Error storing vector in Pinecone: ${error.message}`, error.stack);
      throw error;
    }
  }
} 