/**
 * Pinecone Knowledge Base Connector
 * 
 * This connector adapts the PineconeConnector to the KnowledgeBaseConnector interface
 * for use with the meeting analysis RAG system.
 */
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { PineconeConnector } from '../../../connectors/pinecone-connector';
import { v4 as uuidv4 } from 'uuid';

import {
  KnowledgeBaseConnector,
  KnowledgeBaseConnectorConfig,
  KnowledgeDocument,
  KnowledgeCollection,
  SearchResult
} from '../../core/integration/connectors/knowledge-base-connector.base';
import { IntegrationErrorType, IntegrationError } from '../../core/integration/integration-framework';

/**
 * Configuration for Pinecone Knowledge Base Connector
 */
export interface PineconeKnowledgeConnectorConfig extends KnowledgeBaseConnectorConfig {
  /**
   * Underlying Pinecone connector
   */
  pineconeConnector?: PineconeConnector;
  
  /**
   * Primary index to use
   */
  primaryIndex?: string;
  
  /**
   * Whether to create missing collections automatically
   */
  autoCreateCollections?: boolean;
}

/**
 * Pinecone Knowledge Base Connector implementation
 */
export class PineconeKnowledgeConnector extends KnowledgeBaseConnector {
  private pineconeConnector: PineconeConnector;
  private primaryIndex: string;
  private autoCreateCollections: boolean;
  protected logger: Logger;
  private collectionCache: Map<string, KnowledgeCollection> = new Map();
  
  /**
   * Create a new Pinecone Knowledge Base Connector
   */
  constructor(config: PineconeKnowledgeConnectorConfig) {
    super(config);
    
    this.logger = config.logger || new ConsoleLogger();
    this.pineconeConnector = config.pineconeConnector || new PineconeConnector({
      logger: this.logger,
      defaultNamespace: config.defaultCollection
    });
    this.primaryIndex = config.primaryIndex || 'meeting-analysis';
    this.autoCreateCollections = config.autoCreateCollections ?? true;
  }
  
  /**
   * Get the connector version
   */
  protected getVersion(): string {
    return '1.0.0';
  }
  
  /**
   * Implement the connection logic
   */
  protected async performConnect(): Promise<void> {
    await this.pineconeConnector.initialize();
    
    // Verify connection by attempting to check if a namespace exists
    try {
      await this.pineconeConnector.namespaceExists(
        this.primaryIndex,
        this.defaultCollection || 'default'
      );
    } catch (error) {
      throw new IntegrationError(
        `Failed to connect to Pinecone: ${error instanceof Error ? error.message : String(error)}`,
        IntegrationErrorType.CONNECTION_FAILED
      );
    }
  }
  
  /**
   * Implement the disconnection logic
   */
  protected async performDisconnect(): Promise<void> {
    // Nothing specific to do here as Pinecone handles connection pooling
    return Promise.resolve();
  }
  
  /**
   * Implement the health check logic
   */
  protected async performHealthCheck(): Promise<Record<string, any>> {
    const stats = this.pineconeConnector.getStats();
    
    try {
      // Verify connection by checking a namespace
      const exists = await this.pineconeConnector.namespaceExists(
        this.primaryIndex,
        this.defaultCollection || 'default'
      );
      
      return {
        connected: true,
        collectionExists: exists,
        stats
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : String(error),
        stats
      };
    }
  }
  
  /**
   * Search for documents in the knowledge base
   */
  public async search(params: { 
    query: string, 
    collection?: string,
    limit?: number,
    filters?: Record<string, any>
  }): Promise<SearchResult[]> {
    this.ensureConnected();
    
    const collection = this.getCollection(params.collection);
    const limit = params.limit || 10;
    
    try {
      // Convert query to vector (this would normally be done by an embedding service)
      // For now, we'll throw an error since we need embeddings
      throw new IntegrationError(
        'Direct text search not implemented - must use vectorSearch with embeddings',
        IntegrationErrorType.INVALID_REQUEST
      );
    } catch (error) {
      this.logger.error(`Search error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Retrieve a document by ID
   */
  public async retrieveDocument(params: { 
    documentId: string, 
    collection?: string 
  }): Promise<KnowledgeDocument> {
    this.ensureConnected();
    
    const collection = this.getCollection(params.collection);
    
    try {
      const result = await this.pineconeConnector.fetchVectors(
        this.primaryIndex,
        [params.documentId],
        collection
      );
      
      if (!result[params.documentId]) {
        throw new IntegrationError(
          `Document not found: ${params.documentId}`,
          IntegrationErrorType.OPERATION_FAILED,
          { code: 'DOCUMENT_NOT_FOUND' }
        );
      }
      
      const record = result[params.documentId];
      return this.pineconeRecordToDocument(record);
    } catch (error) {
      this.logger.error(`Error retrieving document: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * List documents in a collection
   */
  public async listDocuments(params: { 
    collection?: string, 
    limit?: number,
    offset?: number,
    filters?: Record<string, any>
  }): Promise<KnowledgeDocument[]> {
    throw new IntegrationError(
      'Listing all documents is not supported by Pinecone - use search instead',
      IntegrationErrorType.OPERATION_FAILED,
      { code: 'OPERATION_NOT_SUPPORTED' }
    );
  }
  
  /**
   * Create a new document
   */
  public async createDocument(params: { 
    document: Partial<KnowledgeDocument>, 
    collection?: string 
  }): Promise<KnowledgeDocument> {
    this.ensureConnected();
    
    const collection = this.getCollection(params.collection);
    const doc = params.document;
    
    if (!doc.embedding) {
      throw new IntegrationError(
        'Document must include embedding',
        IntegrationErrorType.INVALID_REQUEST
      );
    }
    
    try {
      // Ensure the document has an ID
      const documentId = doc.id || `doc-${uuidv4()}`;
      const now = new Date();
      
      // Create the complete document
      const completeDoc: KnowledgeDocument = {
        id: documentId,
        title: doc.title || 'Untitled Document',
        content: doc.content || '',
        contentType: doc.contentType || 'text',
        createdAt: doc.createdAt || now,
        updatedAt: doc.updatedAt || now,
        tags: doc.tags || [],
        category: doc.category || 'general',
        collections: doc.collections || [collection],
        metadata: doc.metadata || {},
        embedding: doc.embedding
      };
      
      // Prepare metadata for Pinecone (ensuring it's not undefined)
      const pineconeMetadata: Record<string, any> = {
        title: completeDoc.title,
        content: completeDoc.content,
        contentType: completeDoc.contentType,
        createdAt: completeDoc.createdAt.toISOString(),
        updatedAt: completeDoc.updatedAt.toISOString(),
        tags: completeDoc.tags ? completeDoc.tags.join(',') : '',
        category: completeDoc.category || 'general',
        collections: completeDoc.collections ? completeDoc.collections.join(',') : collection,
        ...completeDoc.metadata
      };
      
      // Store in Pinecone
      await this.pineconeConnector.storeVector(
        this.primaryIndex,
        documentId,
        doc.embedding,
        pineconeMetadata,
        collection
      );
      
      return completeDoc;
    } catch (error) {
      this.logger.error(`Error creating document: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Update an existing document
   */
  public async updateDocument(params: { 
    documentId: string,
    updates: Partial<KnowledgeDocument>, 
    collection?: string 
  }): Promise<KnowledgeDocument> {
    this.ensureConnected();
    
    const collection = this.getCollection(params.collection);
    
    try {
      // Get the existing document
      const existingDoc = await this.retrieveDocument({
        documentId: params.documentId,
        collection
      });
      
      // Merge the updates
      const updatedDoc: KnowledgeDocument = {
        ...existingDoc,
        ...params.updates,
        id: params.documentId, // Ensure ID doesn't change
        updatedAt: new Date(), // Update timestamp
        embedding: params.updates.embedding || existingDoc.embedding // Keep embedding if not provided
      };
      
      // If embedding is not provided, we can't update in Pinecone
      if (!updatedDoc.embedding) {
        throw new IntegrationError(
          'Cannot update document without embedding',
          IntegrationErrorType.INVALID_REQUEST
        );
      }
      
      // Prepare metadata for Pinecone (ensuring it's not undefined)
      const pineconeMetadata: Record<string, any> = {
        title: updatedDoc.title,
        content: updatedDoc.content,
        contentType: updatedDoc.contentType,
        createdAt: updatedDoc.createdAt.toISOString(),
        updatedAt: updatedDoc.updatedAt.toISOString(),
        tags: updatedDoc.tags ? updatedDoc.tags.join(',') : '',
        category: updatedDoc.category || 'general',
        collections: updatedDoc.collections ? updatedDoc.collections.join(',') : collection,
        ...updatedDoc.metadata
      };
      
      // Store in Pinecone
      await this.pineconeConnector.storeVector(
        this.primaryIndex,
        params.documentId,
        updatedDoc.embedding,
        pineconeMetadata,
        collection
      );
      
      return updatedDoc;
    } catch (error) {
      this.logger.error(`Error updating document: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Delete a document
   */
  public async deleteDocument(params: { 
    documentId: string, 
    collection?: string 
  }): Promise<boolean> {
    this.ensureConnected();
    
    const collection = this.getCollection(params.collection);
    
    try {
      await this.pineconeConnector.deleteVectors(
        this.primaryIndex,
        [params.documentId],
        collection
      );
      
      return true;
    } catch (error) {
      this.logger.error(`Error deleting document: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * List available collections
   */
  public async listCollections(): Promise<KnowledgeCollection[]> {
    this.ensureConnected();
    
    // Pinecone doesn't have a native "list namespaces" functionality
    // If we have a cache, use it
    if (this.collectionCache.size > 0) {
      return Array.from(this.collectionCache.values());
    }
    
    // Otherwise return the default collection
    const defaultCollection: KnowledgeCollection = {
      id: this.defaultCollection || 'default',
      name: this.defaultCollection || 'Default Collection',
      description: 'Default knowledge collection',
      documentCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    this.collectionCache.set(defaultCollection.id, defaultCollection);
    
    return [defaultCollection];
  }
  
  /**
   * Search using vector embeddings
   */
  public async vectorSearch(params: { 
    embedding: number[], 
    collection?: string,
    limit?: number,
    filters?: Record<string, any>
  }): Promise<SearchResult[]> {
    this.ensureConnected();
    
    const collection = this.getCollection(params.collection);
    const limit = params.limit || 10;
    
    try {
      const results = await this.pineconeConnector.querySimilar(
        this.primaryIndex,
        params.embedding,
        {
          topK: limit,
          filter: params.filters,
          includeValues: true,
          minScore: 0.1 // Filter very low relevance matches
        },
        collection
      );
      
      // Convert to SearchResult format
      return results.map((result): SearchResult => {
        const document = this.pineconeResultToDocument(result);
        
        return {
          document,
          score: result.score,
          relevance: result.score,
          highlights: []
        };
      });
    } catch (error) {
      this.logger.error(`Vector search error: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Whether this connector supports vector search
   */
  public supportsVectorSearch(): boolean {
    return true;
  }
  
  /**
   * Whether this connector supports hybrid search (keyword + vector)
   */
  public supportsHybridSearch(): boolean {
    return false;
  }
  
  /**
   * Convert a Pinecone record to a Knowledge Document
   */
  private pineconeRecordToDocument(record: any): KnowledgeDocument {
    const metadata = { ...record.metadata };
    
    // Extract known metadata fields
    const createdAt = metadata.createdAt ? new Date(metadata.createdAt) : new Date();
    const updatedAt = metadata.updatedAt ? new Date(metadata.updatedAt) : new Date();
    const title = metadata.title || 'Untitled';
    const content = metadata.content || '';
    const contentType = metadata.contentType || 'text';
    const tags = metadata.tags || [];
    const category = metadata.category || 'general';
    const collections = metadata.collections || [];
    
    // Remove extracted fields from the metadata
    delete metadata.createdAt;
    delete metadata.updatedAt;
    delete metadata.title;
    delete metadata.content;
    delete metadata.contentType;
    delete metadata.tags;
    delete metadata.category;
    delete metadata.collections;
    
    return {
      id: record.id,
      title,
      content,
      contentType,
      createdAt,
      updatedAt,
      tags,
      category,
      collections,
      metadata,
      embedding: record.values
    };
  }
  
  /**
   * Convert a Pinecone query result to a Knowledge Document
   */
  private pineconeResultToDocument(result: any): KnowledgeDocument {
    return this.pineconeRecordToDocument({
      id: result.id,
      values: result.values,
      metadata: result.metadata
    });
  }
} 