/**
 * Mock implementation of the SemanticChunkingService
 * 
 * This mock implementation avoids embedding service issues in tests
 * by providing consistent, deterministic results without needing
 * actual embedding calculations.
 */

import { v4 as uuidv4 } from 'uuid';
import { ConsoleLogger } from '../../../../shared/logger/console-logger';
import { Logger } from '../../../../shared/logger/logger.interface';
import { 
  ChunkMetadata, 
  ContentCharacteristics, 
  SemanticChunkingConfig
} from '../../../agentic-meeting-analysis/team-formation/semantic-chunking.service';

/**
 * Configuration for mock chunking service
 */
export interface MockSemanticChunkingConfig extends SemanticChunkingConfig {
  /**
   * Predefined chunks to return for any transcript
   */
  predefinedChunks?: ChunkMetadata[];
  
  /**
   * Default content characteristics to return
   */
  defaultContentCharacteristics?: ContentCharacteristics;
}

/**
 * Mock implementation of the SemanticChunkingService for testing
 */
export class MockSemanticChunkingService {
  private logger: Logger;
  private predefinedChunks: ChunkMetadata[] | undefined;
  private defaultContentCharacteristics: ContentCharacteristics;
  
  /**
   * Create a new mock semantic chunking service
   */
  constructor(config: MockSemanticChunkingConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();
    this.predefinedChunks = config.predefinedChunks;
    this.defaultContentCharacteristics = config.defaultContentCharacteristics || {
      technicalComplexity: 0.65,
      domainSpecificity: 0.7,
      controversyLevel: 0.3,
      decisionDensity: 0.6,
      informationDensity: 0.8,
      participantInteractions: 0.5,
      topicDiversity: 0.7
    };
    
    this.logger.info('Initialized MockSemanticChunkingService');
  }
  
  /**
   * Mock implementation of chunkTranscript that returns consistent results
   */
  async chunkTranscript(transcript: string): Promise<ChunkMetadata[]> {
    this.logger.info('Using mock chunking for transcript');
    
    // If predefined chunks were provided, return those
    if (this.predefinedChunks) {
      return this.predefinedChunks;
    }
    
    // Generate some mock chunks based on transcript length
    const basicSentences = transcript.split(/[.!?]\s+/);
    const numChunks = Math.max(2, Math.ceil(basicSentences.length / 10));
    const chunks: ChunkMetadata[] = [];
    
    // Create evenly sized chunks
    const chunkSize = Math.ceil(basicSentences.length / numChunks);
    
    for (let i = 0; i < numChunks; i++) {
      const start = i * chunkSize;
      const end = Math.min((i + 1) * chunkSize, basicSentences.length);
      const text = basicSentences.slice(start, end).join('. ') + '.';
      
      // Add chunk with standard metadata
      chunks.push({
        id: `chunk-${uuidv4()}`,
        startIndex: start,
        endIndex: end - 1,
        text,
        semanticScore: 0.7 + (Math.random() * 0.3), // Random score between 0.7 and 1.0
        topicRelevance: {
          'topic1': 0.8,
          'topic2': 0.6
        },
        speakers: ['Alice', 'Bob'],
        keywords: ['key1', 'key2', 'key3'],
        timestamp: Date.now() - (i * 60000) // Spaced 1 minute apart
      });
    }
    
    return chunks;
  }
  
  /**
   * Mock implementation of analyzeContentCharacteristics that returns consistent results
   */
  async analyzeContentCharacteristics(chunks: ChunkMetadata[]): Promise<ContentCharacteristics> {
    this.logger.info('Using mock analysis for content characteristics');
    
    // Return the default content characteristics
    return this.defaultContentCharacteristics;
  }
  
  /**
   * Update the predefined chunks for deterministic testing
   */
  setPredefinedChunks(chunks: ChunkMetadata[]): void {
    this.predefinedChunks = chunks;
  }
  
  /**
   * Update the default content characteristics
   */
  setContentCharacteristics(characteristics: Partial<ContentCharacteristics>): void {
    this.defaultContentCharacteristics = {
      ...this.defaultContentCharacteristics,
      ...characteristics
    };
  }
}

/**
 * Creates a new MockSemanticChunkingService
 */
export function createMockSemanticChunkingService(
  config: MockSemanticChunkingConfig = {}
): MockSemanticChunkingService {
  return new MockSemanticChunkingService(config);
} 