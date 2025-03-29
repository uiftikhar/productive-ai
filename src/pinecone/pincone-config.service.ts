// src/shared/config/services/pinecone-config.service.ts
import { Pinecone } from '@pinecone-database/pinecone';

export class PineconeConfig {
  private static instance: Pinecone;

  /**
   * Get or create the Pinecone client instance (Singleton pattern)
   */
  static getInstance(): Pinecone {
    if (!PineconeConfig.instance) {
      const apiKey = process.env.PINECONE_API_KEY;

      if (!apiKey) {
        throw new Error('PINECONE_API_KEY environment variable is not set');
      }

      PineconeConfig.instance = new Pinecone({
        apiKey,
        // Optional environment for older Pinecone accounts
        ...(process.env.PINECONE_ENVIRONMENT && {
          environment: process.env.PINECONE_ENVIRONMENT,
        }),
      });
    }

    return PineconeConfig.instance;
  }
}
