// src/agents/specialized/retrieval-agent.ts

import { BaseAgent } from '../base/base-agent.ts';
import { AgentRequest, AgentResponse } from '../interfaces/agent.interface.ts';
import { OpenAIAdapter } from '../adapters/openai-adapter.ts';
import { PineconeAdapter } from '../adapters/pinecone-adapter.ts';
import { Logger } from '../../shared/logger/logger.interface.ts';

/**
 * Abstract retrieval agent that provides common retrieval functionality
 * Specialized retrieval agents should extend this class
 */
export abstract class RetrievalAgent extends BaseAgent {
  protected indexName: string;
  protected namespace: string;
  protected similarityThreshold: number;
  protected maxResults: number;
  
  constructor(
    name: string,
    description: string,
    options: {
      id?: string;
      logger?: Logger;
      openaiAdapter?: OpenAIAdapter;
      pineconeAdapter?: PineconeAdapter;
      indexName?: string;
      namespace?: string;
      similarityThreshold?: number;
      maxResults?: number;
    } = {}
  ) {
    super(name, description, {
      id: options.id,
      logger: options.logger,
      openaiAdapter: options.openaiAdapter,
      pineconeAdapter: options.pineconeAdapter
    });
    
    this.indexName = options.indexName || 'default-index';
    this.namespace = options.namespace || 'default-namespace';
    this.similarityThreshold = options.similarityThreshold || 0.7;
    this.maxResults = options.maxResults || 5;
    
    // Register common retrieval capabilities
    this.registerCapability({
      name: 'retrieve',
      description: 'Retrieve relevant information based on a query',
      parameters: {
        query: 'The query to search for',
        maxResults: 'Maximum number of results to return (optional)'
      }
    });
    
    this.registerCapability({
      name: 'store',
      description: 'Store information for later retrieval',
      parameters: {
        content: 'The content to store',
        metadata: 'Additional metadata to store with the content (optional)'
      }
    });
  }
  
  /**
   * Generate embeddings for text using the OpenAI adapter
   */
  protected async generateEmbeddings(text: string): Promise<number[]> {
    if (!this.openaiAdapter) {
      throw new Error('OpenAI adapter is required for embedding generation');
    }
    
    try {
      return await this.openaiAdapter.generateEmbeddings(text);
    } catch (error) {
      this.logger.error('Error generating embeddings', {
        error: error instanceof Error ? error.message : String(error),
        text: text.substring(0, 100) + (text.length > 100 ? '...' : '')
      });
      throw error;
    }
  }
  
  /**
   * Retrieve similar documents from Pinecone
   */
  protected async retrieveSimilar<T extends Record<string, any> = Record<string, any>>(
    queryText: string,
    options: {
      filter?: Record<string, any>;
      maxResults?: number;
      minScore?: number;
      includeVectors?: boolean;
      namespace?: string;
    } = {}
  ): Promise<Array<{
    id: string;
    score: number;
    metadata: T;
    values?: number[];
  }>> {
    if (!this.pineconeAdapter) {
      throw new Error('Pinecone adapter is required for retrieval operations');
    }
    
    try {
      // Generate embeddings for the query
      const queryVector = await this.generateEmbeddings(queryText);
      
      // Set up query options
      const queryOptions = {
        topK: options.maxResults || this.maxResults,
        filter: options.filter,
        includeValues: options.includeVectors || false,
        minScore: options.minScore || this.similarityThreshold
      };
      
      // Perform the query
      const namespace = options.namespace || this.namespace;
      const results = await this.pineconeAdapter.querySimilar<T>(
        this.indexName,
        queryVector,
        queryOptions,
        namespace
      );
      
      return results;
    } catch (error) {
      this.logger.error('Error retrieving similar documents', {
        error: error instanceof Error ? error.message : String(error),
        queryText: queryText.substring(0, 100) + (queryText.length > 100 ? '...' : '')
      });
      throw error;
    }
  }
  
  /**
   * Store a document in Pinecone
   */
  protected async storeDocument<T extends Record<string, any> = Record<string, any>>(
    id: string,
    content: string,
    metadata: T,
    namespace?: string
  ): Promise<void> {
    if (!this.pineconeAdapter) {
      throw new Error('Pinecone adapter is required for storage operations');
    }
    
    try {
      // Generate embeddings for the content
      const vector = await this.generateEmbeddings(content);
      
      // Store the document
      await this.pineconeAdapter.storeVector(
        this.indexName,
        id,
        vector,
        {
          ...metadata,
          text: content,
          timestamp: Date.now()
        },
        namespace || this.namespace
      );
    } catch (error) {
      this.logger.error('Error storing document', {
        error: error instanceof Error ? error.message : String(error),
        id,
        contentLength: content.length
      });
      throw error;
    }
  }
  
  /**
   * Delete documents from Pinecone
   */
  protected async deleteDocuments(
    ids: string[],
    namespace?: string
  ): Promise<void> {
    if (!this.pineconeAdapter) {
      throw new Error('Pinecone adapter is required for deletion operations');
    }
    
    try {
      await this.pineconeAdapter.deleteVectors(
        this.indexName,
        ids,
        namespace || this.namespace
      );
    } catch (error) {
      this.logger.error('Error deleting documents', {
        error: error instanceof Error ? error.message : String(error),
        ids
      });
      throw error;
    }
  }
}

/**
 * Document retrieval agent for working with documents
 */
export class DocumentRetrievalAgent extends RetrievalAgent {
  constructor(options: {
    name?: string;
    description?: string;
    id?: string;
    logger?: Logger;
    openaiAdapter?: OpenAIAdapter;
    pineconeAdapter?: PineconeAdapter;
    indexName?: string;
    namespace?: string;
  } = {}) {
    super(
      options.name || 'Document Retrieval Agent',
      options.description || 'Agent for retrieving and storing documents',
      {
        ...options,
        indexName: options.indexName || 'documents',
        namespace: options.namespace || 'documents'
      }
    );
    
    // Register additional capabilities
    this.registerCapability({
      name: 'searchDocuments',
      description: 'Search for documents based on a query',
      parameters: {
        query: 'The search query',
        filters: 'Optional filters to apply (JSON format)'
      }
    });
    
    this.registerCapability({
      name: 'storeDocument',
      description: 'Store a document for later retrieval',
      parameters: {
        title: 'Document title',
        content: 'Document content',
        category: 'Document category (optional)',
        tags: 'Document tags (comma-separated)'
      }
    });
  }
  
  /**
   * Implementation of abstract execute method
   */
  protected async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    let tokenUsage = 0;
    
    // Extract input
    const input = typeof request.input === 'string'
      ? request.input
      : request.input.map(msg => msg.content).join('\n');
    
    try {
      // Handle based on capability
      switch (request.capability) {
        case 'retrieve':
        case 'searchDocuments':
          return await this.handleSearch(request, input);
          
        case 'store':
        case 'storeDocument':
          return await this.handleStore(request, input);
          
        default:
          // Default to search behavior
          return await this.handleSearch(request, input);
      }
    } catch (error) {
      this.logger.error('Error executing document retrieval agent', {
        error: error instanceof Error ? error.message : String(error),
        capability: request.capability
      });
      
      return {
        output: `Error executing document retrieval: ${error instanceof Error ? error.message : String(error)}`,
        metrics: {
          executionTimeMs: Date.now() - startTime,
          tokensUsed: tokenUsage
        }
      };
    }
  }
  
  /**
   * Handle search requests
   */
  private async handleSearch(request: AgentRequest, input: string): Promise<AgentResponse> {
    const startTime = Date.now();
    
    // Get query from input or parameters
    const query = request.parameters?.query || input;
    
    // Parse filters if provided
    let filters: Record<string, any> | undefined = undefined;
    if (request.parameters?.filters) {
      try {
        filters = typeof request.parameters.filters === 'string'
          ? JSON.parse(request.parameters.filters)
          : request.parameters.filters;
      } catch (error) {
        this.logger.warn('Invalid filters format', {
          filters: request.parameters.filters
        });
      }
    }
    
    // Get max results
    const maxResults = request.parameters?.maxResults
      ? Number(request.parameters.maxResults)
      : this.maxResults;
    
    // Retrieve documents
    const results = await this.retrieveSimilar(query, {
      filter: filters,
      maxResults,
      includeVectors: false
    });
    
    // Format results
    const formattedResults = results.map(r => ({
      id: r.id,
      score: r.score,
      title: r.metadata.title || 'Untitled Document',
      category: r.metadata.category || 'Uncategorized',
      text: r.metadata.text || '',
      tags: r.metadata.tags || []
    }));
    
    // Create a response summarizing the results
    const response = `Found ${results.length} document(s) matching "${query}":
${formattedResults.map((r, i) => `${i + 1}. ${r.title} (${Math.round(r.score * 100)}% match)
   Category: ${r.category}
   Tags: ${Array.isArray(r.tags) ? r.tags.join(', ') : r.tags}
   ${r.text.substring(0, 150)}${r.text.length > 150 ? '...' : ''}`).join('\n\n')}`;
    
    // Calculate tokens used (very rough estimate)
    const tokensUsed = Math.round((query.length + response.length) / 4);
    
    return {
      output: response,
      artifacts: {
        results: formattedResults,
        query,
        filters
      },
      metrics: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed
      }
    };
  }
  
  /**
   * Handle store requests
   */
  private async handleStore(request: AgentRequest, input: string): Promise<AgentResponse> {
    const startTime = Date.now();
    
    // Get content from parameters or input
    const content = request.parameters?.content || input;
    const title = request.parameters?.title || 'Untitled Document';
    const category = request.parameters?.category || 'Uncategorized';
    
    // Process tags
    let tags: string[] = [];
    if (request.parameters?.tags) {
      tags = typeof request.parameters.tags === 'string'
        ? request.parameters.tags.split(',').map(t => t.trim())
        : request.parameters.tags;
    }
    
    // Generate ID for the document
    const id = `doc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    // Store the document
    await this.storeDocument(
      id,
      content,
      {
        title,
        category,
        tags,
        userId: request.context?.userId,
        timestamp: Date.now()
      }
    );
    
    // Calculate tokens used (very rough estimate)
    const tokensUsed = Math.round(content.length / 4);
    
    return {
      output: `Document "${title}" has been stored successfully.`,
      artifacts: {
        documentId: id,
        title,
        category,
        tags,
        contentLength: content.length
      },
      metrics: {
        executionTimeMs: Date.now() - startTime,
        tokensUsed
      }
    };
  }
} 