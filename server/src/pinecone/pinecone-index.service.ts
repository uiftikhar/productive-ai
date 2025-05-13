// src/shared/config/services/pinecone-index.service.ts
import {
  Pinecone,
  Index,
  ServerlessSpec,
  IndexList,
  ServerlessSpecCloudEnum,
} from '@pinecone-database/pinecone';
import { PineconeConfig } from './pincone-config.service';
import { Logger } from '../shared/logger/logger.interface';
import { ConsoleLogger } from '../shared/logger/console-logger';

export enum VectorIndexes {
  USER_CONTEXT = 'user-context',
  USER_FEEDBACK = 'user-feedback',
  TRANSCRIPT_EMBEDDINGS = 'transcript-embeddings',
  MEETING_ANALYSIS = 'meeting-analysis',
}

export interface IndexConfig {
  dimension?: number;
  metric?: 'cosine' | 'euclidean' | 'dotproduct';
  serverless: boolean;
  cloud: string; // e.g., 'aws' or 'gcp'
  region: string; // e.g., 'us-west-1'
  embeddingModel?:
    | 'multilingual-e5-large'
    | 'pinecone-sparse-english-v0'
    | 'text-embedding-3-large'
    | 'text-embedding-ada-002'
    | 'llama-text-embed-v2';
  tags?: Record<string, string>;
}

export class PineconeIndexService {
  private pinecone: Pinecone;
  private logger: Logger;

  constructor(options: { logger?: Logger } = {}) {
    this.pinecone = PineconeConfig.getInstance();
    this.logger = options.logger || new ConsoleLogger();
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
      this.logger.info(`Creating Pinecone index: ${indexName}`);


      await this.pinecone.createIndexForModel({
        name: indexName,
        cloud: config.cloud as ServerlessSpecCloudEnum,
        region: config.region,
        embed: {
          model: config.embeddingModel || 'multilingual-e5-large',
          metric: config.metric || 'cosine',
          fieldMap: {
            text: 'text',
          },
        },
        waitUntilReady: true,
        tags: config.tags || { project: 'transcript-analysis' },
      });

      this.logger.info(`Index ${indexName} created and ready.`);
    } else {
      this.logger.info(`Index ${indexName} already exists.`);
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
      this.logger.info(`Index ${indexName} deleted.`);
    } else {
      this.logger.info(`Index ${indexName} does not exist, nothing to delete.`);
    }
  }

  /**
   * Gets index statistics
   */
  async describeIndex(indexName: VectorIndexes | string): Promise<any> {
    return this.pinecone.describeIndex(indexName);
  }
}
