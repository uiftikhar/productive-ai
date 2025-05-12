/**
 * Interface for chunking services in the RAG framework
 */

export interface ChunkingOptions {
  chunkSize?: number;
  chunkOverlap?: number;
  splitBySection?: boolean;
  preserveParagraphs?: boolean;
  minChunkSize?: number;
  maxChunkSize?: number;
  semanticSplitting?: boolean;
}

export interface ChunkMetadata {
  index: number;
  sourceType: string;
  sourceId: string;
  sectionTitle?: string;
  startPosition?: number;
  endPosition?: number;
  speakers?: string[];
  timestamp?: string;
  [key: string]: any;
}

export interface ContentChunk {
  content: string;
  metadata: ChunkMetadata;
}

export interface ChunkingResult {
  chunks: ContentChunk[];
  totalChunks: number;
  avgChunkSize: number;
  metadata: {
    sourceType: string;
    sourceId: string;
    processingTime: number;
    chunkingStrategy: string;
    [key: string]: any;
  };
}

export interface ChunkingService {
  /**
   * Process content and create optimized chunks
   * @param content The content to chunk
   * @param options Chunking options
   * @returns A chunking result containing the generated chunks and metadata
   */
  chunkContent(content: string | object, options?: ChunkingOptions): Promise<ChunkingResult>;
  
  /**
   * Get the optimal chunk size for a specific content type
   * @param contentType Type of content (e.g., 'transcript', 'document', 'code')
   * @returns Recommended chunk size
   */
  getOptimalChunkSize(contentType: string): number;
  
  /**
   * Merge existing chunks for more semantic coherence
   * @param chunks Chunks to merge
   * @returns Merged chunks
   */
  mergeChunks(chunks: ContentChunk[]): Promise<ContentChunk[]>;
} 