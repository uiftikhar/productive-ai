/**
 * Document Context Service
 * Handles document-specific context operations
 */

import { RecordMetadata } from '@pinecone-database/pinecone';
import { BaseContextService } from './base-context.service.ts';
import { MetadataValidationService } from './metadata-validation.service.ts';
import {
  BaseContextMetadata,
  ContextType,
  USER_CONTEXT_INDEX,
  UserContextValidationError,
} from '../types/context.types.ts';

/**
 * Service for managing document-related context operations
 */
export class DocumentContextService extends BaseContextService {
  private metadataValidator: MetadataValidationService;

  constructor(options: any = {}) {
    super(options);
    this.metadataValidator = new MetadataValidationService();
  }

  /**
   * Store a document or document chunk in the context database
   * @param userId User identifier
   * @param documentId Unique document identifier
   * @param documentTitle Title of the document
   * @param content The document content
   * @param embeddings Vector embeddings for the content
   * @param chunkIndex Index of this chunk within the document
   * @param totalChunks Total number of chunks in the document
   * @param metadata Additional metadata about the document
   * @returns The ID of the stored document chunk
   */
  async storeDocumentChunk(
    userId: string,
    documentId: string,
    documentTitle: string,
    content: string,
    embeddings: number[],
    chunkIndex: number = 0,
    totalChunks: number = 1,
    metadata: Partial<BaseContextMetadata> = {},
  ): Promise<string> {
    if (!documentId) {
      throw new UserContextValidationError('Document ID is required');
    }

    return this.storeUserContext(userId, content, embeddings, {
      contextType: ContextType.DOCUMENT,
      documentId,
      documentTitle,
      chunkIndex,
      totalChunks,
      timestamp: Date.now(),
      ...metadata,
    });
  }

  /**
   * Retrieve all chunks of a specific document
   * @param userId User identifier
   * @param documentId Document identifier
   * @returns Document chunks ordered by chunkIndex
   */
  async getDocumentChunks(userId: string, documentId: string) {
    const filter = {
      contextType: ContextType.DOCUMENT,
      documentId,
    };

    // Use an empty vector for a metadata-only search
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [], // Empty vector for metadata-only query
          {
            topK: 1000, // Assuming no document has more than 1000 chunks
            filter,
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `getDocumentChunks:${userId}:${documentId}`,
    );

    const chunks = result.matches || [];

    // Sort chunks by index
    return chunks.sort((a, b) => {
      const indexA = (a.metadata?.chunkIndex as number) || 0;
      const indexB = (b.metadata?.chunkIndex as number) || 0;
      return indexA - indexB;
    });
  }

  /**
   * Delete a specific document and all its chunks
   * @param userId User identifier
   * @param documentId Document identifier
   * @returns Number of chunks deleted
   */
  async deleteDocument(userId: string, documentId: string): Promise<number> {
    // Find all chunks in this document
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [], // Empty vector for metadata-only query
          {
            topK: 1000,
            filter: {
              contextType: ContextType.DOCUMENT,
              documentId,
            },
            includeValues: false,
            includeMetadata: false,
          },
          userId,
        ),
      `findDocumentChunks:${userId}:${documentId}`,
    );

    if (!result.matches || result.matches.length === 0) {
      return 0;
    }

    // Extract IDs of chunks
    const chunkIds = result.matches.map((match: any) => match.id);

    // Delete the chunks
    await this.executeWithRetry(
      () =>
        this.pineconeService.deleteVectors(
          USER_CONTEXT_INDEX,
          chunkIds,
          userId,
        ),
      `deleteDocumentChunks:${userId}:${documentId}`,
    );

    return chunkIds.length;
  }

  /**
   * Search document content by semantic similarity
   * @param userId User identifier
   * @param queryEmbedding Query embedding vector
   * @param options Search options
   * @returns Matching document chunks
   */
  async searchDocumentContent(
    userId: string,
    queryEmbedding: number[],
    options: {
      documentIds?: string[];
      minRelevanceScore?: number;
      maxResults?: number;
      includeContent?: boolean;
    } = {},
  ) {
    const filter: Record<string, any> = {
      contextType: ContextType.DOCUMENT,
    };

    if (options.documentIds && options.documentIds.length > 0) {
      filter.documentId = { $in: options.documentIds };
    }

    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          queryEmbedding,
          {
            topK: options.maxResults || 10,
            filter,
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `searchDocumentContent:${userId}`,
    );

    let matches = result.matches || [];

    // Filter by minimum score if specified
    if (options.minRelevanceScore !== undefined) {
      matches = matches.filter(
        (match) =>
          match.score !== undefined &&
          match.score >= (options.minRelevanceScore || 0),
      );
    }

    // Format the results
    return matches.map((match) => ({
      id: match.id,
      score: match.score,
      documentId: match.metadata?.documentId,
      documentTitle: match.metadata?.documentTitle,
      chunkIndex: match.metadata?.chunkIndex,
      totalChunks: match.metadata?.totalChunks,
      content: options.includeContent ? match.metadata?.content : undefined,
      metadata: match.metadata,
    }));
  }

  /**
   * Get a list of all documents for a user
   * @param userId User identifier
   * @returns List of document metadata
   */
  async listUserDocuments(userId: string): Promise<
    Array<{
      documentId: string;
      documentTitle: string;
      chunkCount: number;
      lastUpdated: number;
    }>
  > {
    // Get all document chunks
    const result = await this.executeWithRetry(
      () =>
        this.pineconeService.queryVectors<RecordMetadata>(
          USER_CONTEXT_INDEX,
          [],
          {
            topK: 10000,
            filter: {
              contextType: ContextType.DOCUMENT,
            },
            includeValues: false,
            includeMetadata: true,
          },
          userId,
        ),
      `listUserDocuments:${userId}`,
    );

    const chunks = result.matches || [];

    // Group by document ID
    const docMap = new Map<
      string,
      {
        documentId: string;
        documentTitle: string;
        chunkCount: number;
        lastUpdated: number;
      }
    >();

    for (const chunk of chunks) {
      const docId = chunk.metadata?.documentId as string;
      const docTitle = chunk.metadata?.documentTitle as string;
      const timestamp = (chunk.metadata?.timestamp as number) || 0;

      if (docId) {
        const existing = docMap.get(docId);
        if (existing) {
          existing.chunkCount++;
          existing.lastUpdated = Math.max(existing.lastUpdated, timestamp);
        } else {
          docMap.set(docId, {
            documentId: docId,
            documentTitle: docTitle || docId,
            chunkCount: 1,
            lastUpdated: timestamp,
          });
        }
      }
    }

    // Convert map to array
    return Array.from(docMap.values());
  }
}
