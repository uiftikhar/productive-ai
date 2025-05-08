import { 
  IntegrationType, 
  IntegrationConnectorConfig, 
  IntegrationCapability, 
  IntegrationError,
  IntegrationErrorType
} from '../integration-framework';
import { BaseConnector } from './base-connector';

/**
 * Document representation in knowledge base
 */
export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  contentType: 'text' | 'markdown' | 'html' | 'pdf' | 'json' | 'other';
  url?: string;
  path?: string;
  author?: string;
  createdAt: Date;
  updatedAt: Date;
  tags?: string[];
  category?: string;
  collections?: string[];
  metadata?: Record<string, any>;
  embedding?: number[];
  vector_id?: string;
}

/**
 * Search results interface
 */
export interface SearchResult {
  document: KnowledgeDocument;
  score: number;
  relevance?: number;
  highlights?: {
    field: string;
    snippets: string[];
  }[];
}

/**
 * Collection or namespace in the knowledge base
 */
export interface KnowledgeCollection {
  id: string;
  name: string;
  description?: string;
  documentCount: number;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

/**
 * Common capabilities for knowledge base integrations
 */
export enum KnowledgeBaseCapability {
  SEARCH = 'search',
  RETRIEVE_DOCUMENT = 'retrieve_document',
  LIST_DOCUMENTS = 'list_documents',
  CREATE_DOCUMENT = 'create_document',
  UPDATE_DOCUMENT = 'update_document',
  DELETE_DOCUMENT = 'delete_document',
  LIST_COLLECTIONS = 'list_collections',
  VECTOR_SEARCH = 'vector_search',
  HYBRID_SEARCH = 'hybrid_search',
  CREATE_EMBEDDING = 'create_embedding',
  RETRIEVE_SIMILAR = 'retrieve_similar'
}

/**
 * Configuration for knowledge base connectors
 */
export interface KnowledgeBaseConnectorConfig extends IntegrationConnectorConfig {
  /**
   * Default collection/namespace to use
   */
  defaultCollection?: string;
  
  /**
   * Vector embedding dimensions if applicable
   */
  embeddingDimension?: number;
}

/**
 * Abstract base class for knowledge base integrations
 */
export abstract class KnowledgeBaseConnector extends BaseConnector<IntegrationType.KNOWLEDGE_BASE> {
  protected readonly defaultCollection?: string;
  protected readonly embeddingDimension?: number;
  
  constructor(config: KnowledgeBaseConnectorConfig) {
    super(IntegrationType.KNOWLEDGE_BASE, config);
    this.defaultCollection = config.defaultCollection;
    this.embeddingDimension = config.embeddingDimension;
  }
  
  /**
   * Get common knowledge base capabilities
   */
  public getCapabilities(): IntegrationCapability[] {
    return [
      {
        id: KnowledgeBaseCapability.SEARCH,
        name: 'Search',
        description: 'Search for documents in the knowledge base',
        type: IntegrationType.KNOWLEDGE_BASE
      },
      {
        id: KnowledgeBaseCapability.RETRIEVE_DOCUMENT,
        name: 'Retrieve Document',
        description: 'Get a specific document by ID',
        type: IntegrationType.KNOWLEDGE_BASE
      },
      {
        id: KnowledgeBaseCapability.LIST_DOCUMENTS,
        name: 'List Documents',
        description: 'List documents in a collection',
        type: IntegrationType.KNOWLEDGE_BASE
      },
      {
        id: KnowledgeBaseCapability.CREATE_DOCUMENT,
        name: 'Create Document',
        description: 'Add a new document to the knowledge base',
        type: IntegrationType.KNOWLEDGE_BASE
      },
      {
        id: KnowledgeBaseCapability.LIST_COLLECTIONS,
        name: 'List Collections',
        description: 'List available collections/namespaces',
        type: IntegrationType.KNOWLEDGE_BASE
      }
    ];
  }
  
  /**
   * Execute a knowledge base capability
   */
  public async executeCapability<TParams = any, TResult = any>(
    capabilityId: string,
    params: TParams
  ): Promise<TResult> {
    this.ensureConnected();
    
    switch (capabilityId) {
      case KnowledgeBaseCapability.SEARCH:
        return this.search(params as unknown as { 
          query: string, 
          collection?: string,
          limit?: number,
          filters?: Record<string, any>
        }) as unknown as TResult;
        
      case KnowledgeBaseCapability.RETRIEVE_DOCUMENT:
        return this.retrieveDocument(params as unknown as { 
          documentId: string, 
          collection?: string 
        }) as unknown as TResult;
        
      case KnowledgeBaseCapability.LIST_DOCUMENTS:
        return this.listDocuments(params as unknown as { 
          collection?: string, 
          limit?: number,
          offset?: number,
          filters?: Record<string, any>
        }) as unknown as TResult;
        
      case KnowledgeBaseCapability.CREATE_DOCUMENT:
        return this.createDocument(params as unknown as { 
          document: Partial<KnowledgeDocument>, 
          collection?: string 
        }) as unknown as TResult;
        
      case KnowledgeBaseCapability.UPDATE_DOCUMENT:
        return this.updateDocument(params as unknown as { 
          documentId: string,
          updates: Partial<KnowledgeDocument>, 
          collection?: string 
        }) as unknown as TResult;
        
      case KnowledgeBaseCapability.DELETE_DOCUMENT:
        return this.deleteDocument(params as unknown as { 
          documentId: string, 
          collection?: string 
        }) as unknown as TResult;
        
      case KnowledgeBaseCapability.LIST_COLLECTIONS:
        return this.listCollections() as unknown as TResult;
        
      case KnowledgeBaseCapability.VECTOR_SEARCH:
        return this.vectorSearch(params as unknown as { 
          embedding: number[], 
          collection?: string,
          limit?: number,
          filters?: Record<string, any>
        }) as unknown as TResult;
        
      default:
        throw new IntegrationError(
          `Capability not supported: ${capabilityId}`,
          IntegrationErrorType.INVALID_REQUEST,
          {
            context: {
              capabilityId,
              availableCapabilities: this.getCapabilities().map(c => c.id)
            }
          }
        );
    }
  }
  
  /**
   * Get collection name, using default if not provided
   */
  protected getCollection(collection?: string): string {
    return collection || this.defaultCollection || 'default';
  }
  
  /**
   * Search for documents in the knowledge base
   */
  public abstract search(params: { 
    query: string, 
    collection?: string,
    limit?: number,
    filters?: Record<string, any>
  }): Promise<SearchResult[]>;
  
  /**
   * Retrieve a document by ID
   */
  public abstract retrieveDocument(params: { 
    documentId: string, 
    collection?: string 
  }): Promise<KnowledgeDocument>;
  
  /**
   * List documents in a collection
   */
  public abstract listDocuments(params: { 
    collection?: string, 
    limit?: number,
    offset?: number,
    filters?: Record<string, any>
  }): Promise<KnowledgeDocument[]>;
  
  /**
   * Create a new document
   */
  public abstract createDocument(params: { 
    document: Partial<KnowledgeDocument>, 
    collection?: string 
  }): Promise<KnowledgeDocument>;
  
  /**
   * Update an existing document
   */
  public abstract updateDocument(params: { 
    documentId: string,
    updates: Partial<KnowledgeDocument>, 
    collection?: string 
  }): Promise<KnowledgeDocument>;
  
  /**
   * Delete a document
   */
  public abstract deleteDocument(params: { 
    documentId: string, 
    collection?: string 
  }): Promise<boolean>;
  
  /**
   * List available collections
   */
  public abstract listCollections(): Promise<KnowledgeCollection[]>;
  
  /**
   * Search using vector embeddings
   */
  public abstract vectorSearch(params: { 
    embedding: number[], 
    collection?: string,
    limit?: number,
    filters?: Record<string, any>
  }): Promise<SearchResult[]>;
  
  /**
   * Whether this connector supports vector search
   */
  public supportsVectorSearch(): boolean {
    return false;
  }
  
  /**
   * Whether this connector supports hybrid search (keyword + vector)
   */
  public supportsHybridSearch(): boolean {
    return false;
  }
} 