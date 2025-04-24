// src/shared/config/services/pinecone-config.service.ts
import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';
dotenv.config();

export class PineconeConfig {
  private static instance: Pinecone;

  /**
   * Get or create the Pinecone client instance (Singleton pattern)
   */
  static getInstance(): Pinecone {
    // For tests, return the mocked instance
    if (process.env.NODE_ENV === 'test') {
      if (!PineconeConfig.instance) {
        PineconeConfig.instance = new Pinecone({
          apiKey: 'test-api-key',
        });
      }
      return PineconeConfig.instance;
    }

    // For normal operation
    if (!PineconeConfig.instance) {
      const apiKey = process.env.PINECONE_API_KEY;

      if (!apiKey) {
        throw new Error('PINECONE_API_KEY environment variable is not set');
      }

      // Configure Pinecone client with new SDK format
      PineconeConfig.instance = new Pinecone({
        apiKey,
        // New format for controllers - if you have environment and region, use this
        ...(process.env.PINECONE_ENVIRONMENT &&
          process.env.PINECONE_REGION && {
            controllerHostUrl: `https://controller.${process.env.PINECONE_REGION}.pinecone.io`,
          }),
        // For direct serverUrl specification (new gcp/aws/azure clusters)
        ...(process.env.PINECONE_SERVER_URL && {
          controllerHostUrl: process.env.PINECONE_SERVER_URL,
        }),
      });
    }

    return PineconeConfig.instance;
  }
}
