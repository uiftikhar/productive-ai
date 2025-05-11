import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { 
  chunkTranscriptAdaptively, 
  AdaptiveChunkingConfig, 
  TranscriptSegment,
  TranscriptSegmentType
} from '../../../shared/utils/adaptive-chunking';
import { OpenAIConnector } from '../../../connectors/openai-connector';
import { RawTranscript, TranscriptEntry } from '../../../langgraph/core/transcript/enhanced-transcript-processor';

/**
 * Configuration for semantic chunking
 */
export interface SemanticChunkingConfig {
  minChunkSize: number;
  maxChunkSize: number;
  overlapRatio: number;
  preserveActionItems: boolean;
  preserveDecisions: boolean;
  preserveSpeakerTurns: boolean;
  contentImportanceStrategy: 'standard' | 'conservative' | 'aggressive';
  detectTopicTransitions: boolean;
  llmTopicDetection: boolean;
}

/**
 * Default configuration for semantic chunking
 */
const DEFAULT_CONFIG: SemanticChunkingConfig = {
  minChunkSize: 800,
  maxChunkSize: 3500,
  overlapRatio: 0.1,
  preserveActionItems: true,
  preserveDecisions: true,
  preserveSpeakerTurns: true,
  contentImportanceStrategy: 'standard',
  detectTopicTransitions: true,
  llmTopicDetection: false,
};

/**
 * Semantic chunking service for intelligent transcript chunking
 * This service uses pattern recognition and optional LLM assistance
 * to break transcripts into meaningful, context-preserving chunks
 */
export class SemanticChunkingService {
  private logger: Logger;
  private openAiConnector?: OpenAIConnector;
  private config: SemanticChunkingConfig;

  /**
   * Create a new semantic chunking service
   */
  constructor(options: {
    logger?: Logger;
    openAiConnector?: OpenAIConnector;
    config?: Partial<SemanticChunkingConfig>;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.openAiConnector = options.openAiConnector;
    this.config = { ...DEFAULT_CONFIG, ...(options.config || {}) };
  }

  /**
   * Chunk a transcript adaptively
   * @param transcript Raw transcript text
   * @returns Array of chunked segments
   */
  async chunkTranscript(transcript: string): Promise<string[]> {
    this.logger.info('Chunking transcript adaptively', { 
      textLength: transcript.length,
      config: {
        minChunkSize: this.config.minChunkSize,
        maxChunkSize: this.config.maxChunkSize,
        contentImportanceStrategy: this.config.contentImportanceStrategy,
      }
    });

    // Map our service config to adaptive chunking config
    const adaptiveConfig: AdaptiveChunkingConfig = {
      baseChunkSize: Math.round((this.config.minChunkSize + this.config.maxChunkSize) / 2),
      minChunkSize: this.config.minChunkSize,
      maxChunkSize: this.config.maxChunkSize,
      overlapSize: Math.round(this.config.minChunkSize * this.config.overlapRatio),
      preserveParagraphs: true,
      preserveSpeakerTurns: this.config.preserveSpeakerTurns,
      importantContentMultiplier: this.getImportanceMultiplier(),
      chunkImportantContentSeparately: this.config.preserveActionItems || this.config.preserveDecisions,
      contentTypes: {
        // Adjust importance weights based on strategy
        [TranscriptSegmentType.ACTION_ITEMS]: {
          importance: this.config.preserveActionItems ? 1.0 : 0.7,
          chunkSizeMultiplier: 0.6,
        },
        [TranscriptSegmentType.DECISIONS]: {
          importance: this.config.preserveDecisions ? 1.0 : 0.7,
          chunkSizeMultiplier: 0.6,
        },
        [TranscriptSegmentType.TOPIC_TRANSITION]: {
          importance: this.config.detectTopicTransitions ? 0.9 : 0.5,
          chunkSizeMultiplier: 0.7,
        },
      }
    };

    // Process with adaptive chunking
    const chunks = chunkTranscriptAdaptively(transcript, adaptiveConfig);
    
    this.logger.info('Transcript chunking complete', { 
      chunkCount: chunks.length,
      averageChunkSize: this.calculateAverageLength(chunks),
    });

    // Optionally enhance chunks with LLM topic detection
    if (this.config.llmTopicDetection && this.openAiConnector) {
      return await this.enhanceChunksWithLLM(chunks);
    }

    return chunks;
  }

  /**
   * Process a structured transcript into chunks
   */
  async chunkStructuredTranscript(transcript: RawTranscript): Promise<string[]> {
    // Convert structured transcript to text
    const transcriptText = this.convertStructuredTranscriptToText(transcript);
    return await this.chunkTranscript(transcriptText);
  }

  /**
   * Convert structured transcript to text format
   */
  private convertStructuredTranscriptToText(transcript: RawTranscript): string {
    return transcript.entries.map((entry: TranscriptEntry) => {
      return `${entry.speakerName}: ${entry.content}`;
    }).join('\n\n');
  }

  /**
   * Get importance multiplier based on strategy
   */
  private getImportanceMultiplier(): number {
    switch (this.config.contentImportanceStrategy) {
      case 'aggressive':
        return 0.8; // More weight to important content
      case 'conservative':
        return 0.4; // Less weight to important content
      case 'standard':
      default:
        return 0.6; // Balanced approach
    }
  }

  /**
   * Calculate average length of chunks
   */
  private calculateAverageLength(chunks: string[]): number {
    if (chunks.length === 0) return 0;
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    return Math.round(totalLength / chunks.length);
  }

  /**
   * Enhance chunks with LLM topic detection
   * Adds a topic header to each chunk for better context
   */
  private async enhanceChunksWithLLM(chunks: string[]): Promise<string[]> {
    if (!this.openAiConnector) {
      this.logger.warn('LLM topic detection requested but no OpenAI connector provided');
      return chunks;
    }

    this.logger.info('Enhancing chunks with LLM topic detection', { chunkCount: chunks.length });
    
    const enhancedChunks: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      try {
        const chunk = chunks[i];
        const topic = await this.detectTopicWithLLM(chunk);
        
        if (topic) {
          enhancedChunks.push(`TOPIC: ${topic}\n\n${chunk}`);
        } else {
          enhancedChunks.push(chunk);
        }
      } catch (error) {
        this.logger.error('Error detecting topic for chunk', { 
          chunkIndex: i, 
          error: error instanceof Error ? error.message : String(error) 
        });
        enhancedChunks.push(chunks[i]);
      }
    }

    return enhancedChunks;
  }

  /**
   * Detect the main topic of a chunk using LLM
   */
  private async detectTopicWithLLM(chunk: string): Promise<string | null> {
    try {
      const instruction = 'Extract the main topic from this transcript segment in 5-7 words. Be concise and specific.';
      const response = await this.openAiConnector!.generateResponse(
        [
          { role: 'system', content: 'You extract concise topic summaries from transcript segments.' },
          { role: 'user', content: `${instruction}\n\nTRANSCRIPT SEGMENT:\n${chunk.substring(0, 1500)}` }
        ],
        {
          temperature: 0.2,
          maxTokens: 20,
        }
      );

      return response.content;
    } catch (error) {
      this.logger.error('LLM topic detection failed', { 
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
} 