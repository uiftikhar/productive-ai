// src/shared/config/services/pinecone-index.service.ts
import {
  Pinecone,
  Index,
  ServerlessSpec,
  IndexList,
  ServerlessSpecCloudEnum,
} from '@pinecone-database/pinecone';
import { PineconeConfig } from './pincone-config.service';

export enum VectorIndexes {
  USER_CONTEXT = 'user-context',
  USER_FEEDBACK = 'user-feedback',
  TRANSCRIPT_EMBEDDINGS = 'transcript-embeddings',
}

export interface IndexConfig {
  dimension: number;
  metric?: 'cosine' | 'euclidean' | 'dotproduct';
  serverless: boolean;
  cloud: string; // e.g., 'aws' or 'gcp'
  region: string; // e.g., 'us-west-1'
  embeddingModel?:
    | 'multilingual-e5-large'
    | 'pinecone-sparse-english-v0'
    | 'text-embedding-3-large'
    | 'text-embedding-ada-002';
  tags?: Record<string, string>;
}

export class PineconeIndexService {
  private pinecone: Pinecone;

  constructor() {
    this.pinecone = PineconeConfig.getInstance();
  }

  /**
   * List all indexes in the Pinecone project
   */
  async listIndexes(): Promise<IndexList> {
    return this.pinecone.listIndexes();
  }

  /**
   * Checks if an index exists
   */
  async indexExists(indexName: string): Promise<boolean> {
    const indexList = await this.listIndexes();
    return (
      indexList.indexes?.some((index) => index.name === indexName) || false
    );
  }

  /**
   * Creates an index if it doesn't exist
   */
  async ensureIndexExists(
    indexName: VectorIndexes | string,
    config: IndexConfig,
  ): Promise<void> {
    const exists = await this.indexExists(indexName);

    if (!exists) {
      console.log(`Creating Pinecone index: ${indexName}`);
      console.log(`Using configuration: dimensions=${config.dimension}, metric=${config.metric}, cloud=${config.cloud}, region=${config.region}`);

      // Use standard createIndex instead of createIndexForModel
      try {
        await this.pinecone.createIndex({
          name: indexName,
          dimension: config.dimension,  // Explicitly set dimension from config
          metric: config.metric || 'cosine',
          spec: {
            serverless: {
              cloud: config.cloud as ServerlessSpecCloudEnum,
              region: config.region
            }
          },
          waitUntilReady: true,
          tags: {
            'model-dimensions': `${config.dimension}`,
            'created-by': 'productive-ai',
            ...(config.tags || {})
          },
        });
        console.log(`Index ${indexName} created and ready.`);
      } catch (error) {
        console.error(`Error creating index ${indexName}:`, error);
        throw error;
      }
    } else {
      console.log(`Index ${indexName} already exists.`);
    }
  }

  /**
   * Gets an index instance
   */
  getIndex(indexName: VectorIndexes | string): Index {
    return this.pinecone.index(indexName);
  }

  /**
   * Deletes an index
   */
  async deleteIndex(indexName: VectorIndexes | string): Promise<void> {
    const exists = await this.indexExists(indexName);

    if (exists) {
      await this.pinecone.deleteIndex(indexName);
      console.log(`Index ${indexName} deleted.`);
    } else {
      console.log(`Index ${indexName} does not exist, nothing to delete.`);
    }
  }

  /**
   * Gets index statistics
   */
  async describeIndex(indexName: VectorIndexes | string): Promise<any> {
    return this.pinecone.describeIndex(indexName);
  }
}
