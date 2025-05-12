/**
 * Advanced Chunking Service
 * 
 * Provides intelligent chunking of different content types for optimal RAG retrieval.
 * Supports both basic chunking as well as semantic/intelligent chunking strategies.
 */

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { OpenAIConnector } from '../../connectors/openai-connector';
import { 
  ChunkingService, 
  ChunkingOptions, 
  ChunkingResult, 
  ContentChunk, 
  ChunkMetadata 
} from './chunking.interface';
import { performance } from 'perf_hooks';
import { MessageConfig } from '../../connectors/language-model-provider.interface';

export class AdvancedChunkingService implements ChunkingService {
  private logger: Logger;
  private openAiConnector: OpenAIConnector;
  
  // Default chunking options per content type
  private defaultOptions: Record<string, ChunkingOptions> = {
    transcript: {
      chunkSize: 1000,
      chunkOverlap: 200,
      splitBySection: true,
      preserveParagraphs: true,
      semanticSplitting: true
    },
    document: {
      chunkSize: 1500,
      chunkOverlap: 150,
      splitBySection: true,
      preserveParagraphs: true,
      semanticSplitting: false
    },
    code: {
      chunkSize: 2000,
      chunkOverlap: 100,
      splitBySection: false,
      preserveParagraphs: false,
      semanticSplitting: false
    },
    default: {
      chunkSize: 1000,
      chunkOverlap: 100,
      splitBySection: false,
      preserveParagraphs: true,
      semanticSplitting: false
    }
  };

  constructor(options: {
    logger?: Logger;
    openAiConnector?: OpenAIConnector;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.openAiConnector = options.openAiConnector || new OpenAIConnector({ logger: this.logger });
  }

  /**
   * Process content and create optimized chunks
   * @param content The content to chunk
   * @param options Chunking options
   * @returns Chunks with metadata
   */
  async chunkContent(
    content: string | object,
    options: ChunkingOptions & { contentType?: string; sourceId?: string } = {}
  ): Promise<ChunkingResult> {
    const startTime = performance.now();
    
    // Convert object to string if needed
    const contentStr = typeof content === 'object' ? JSON.stringify(content) : content;
    
    // Determine content type
    const contentType = options.contentType || 'default';
    
    // Get appropriate chunking options by combining defaults with provided options
    const chunkingOptions = {
      ...this.defaultOptions[contentType] || this.defaultOptions.default,
      ...options
    };
    
    this.logger.debug('Chunking content', {
      contentType,
      contentLength: contentStr.length,
      options: chunkingOptions
    });
    
    let result: ChunkingResult;
    
    // Based on options, choose the appropriate chunking strategy
    if (chunkingOptions.semanticSplitting) {
      result = await this.performSemanticChunking(contentStr, chunkingOptions);
    } else if (chunkingOptions.splitBySection) {
      result = this.performSectionBasedChunking(contentStr, chunkingOptions);
    } else {
      result = this.performBasicChunking(contentStr, chunkingOptions);
    }
    
    const endTime = performance.now();
    const processingTime = endTime - startTime;
    
    // Add processing time to metadata
    result.metadata.processingTime = processingTime;
    
    this.logger.info('Content chunking completed', {
      contentType,
      chunkCount: result.chunks.length,
      processingTimeMs: processingTime.toFixed(2),
      chunkingStrategy: result.metadata.chunkingStrategy
    });
    
    return result;
  }

  /**
   * Get the optimal chunk size for a specific content type
   * @param contentType Type of content
   * @returns Recommended chunk size
   */
  getOptimalChunkSize(contentType: string): number {
    const options = this.defaultOptions[contentType] || this.defaultOptions.default;
    return options.chunkSize || 1000;
  }

  /**
   * Merge existing chunks for more semantic coherence
   * @param chunks Chunks to merge
   * @returns Merged chunks
   */
  async mergeChunks(chunks: ContentChunk[]): Promise<ContentChunk[]> {
    if (chunks.length <= 1) {
      return chunks;
    }
    
    this.logger.debug('Merging chunks', { chunkCount: chunks.length });
    
    const mergedChunks: ContentChunk[] = [];
    let currentChunk: ContentChunk | null = null;
    
    for (const chunk of chunks) {
      if (!currentChunk) {
        currentChunk = { ...chunk };
        continue;
      }
      
      // If chunks are from the same source and section, consider merging
      if (
        currentChunk.metadata.sourceId === chunk.metadata.sourceId &&
        currentChunk.metadata.sectionTitle === chunk.metadata.sectionTitle
      ) {
        // Merge if combined length is reasonable
        if ((currentChunk.content.length + chunk.content.length) <= 2000) {
          currentChunk.content = `${currentChunk.content}\n\n${chunk.content}`;
          // Update metadata
          currentChunk.metadata.endPosition = chunk.metadata.endPosition;
        } else {
          // Current chunk is full, add to results and start new chunk
          mergedChunks.push(currentChunk);
          currentChunk = { ...chunk };
        }
      } else {
        // Different source or section, add current and start new
        mergedChunks.push(currentChunk);
        currentChunk = { ...chunk };
      }
    }
    
    // Add the last chunk if present
    if (currentChunk) {
      mergedChunks.push(currentChunk);
    }
    
    this.logger.debug('Chunks merged', { 
      originalCount: chunks.length,
      mergedCount: mergedChunks.length 
    });
    
    return mergedChunks;
  }

  /**
   * Basic chunking strategy that splits content by size
   * @param content Content to chunk
   * @param options Chunking options
   * @returns Chunking result
   */
  private performBasicChunking(
    content: string,
    options: ChunkingOptions & { sourceId?: string; contentType?: string }
  ): ChunkingResult {
    const chunkSize = options.chunkSize || 1000;
    const chunkOverlap = options.chunkOverlap || 100;
    const sourceId = options.sourceId || `src-${Date.now()}`;
    
    this.logger.debug('Performing basic chunking', { chunkSize, chunkOverlap });
    
    const chunks: ContentChunk[] = [];
    const contentLength = content.length;
    let chunkStartPos = 0;
    let chunkIndex = 0;
    
    // Create chunks respecting paragraph boundaries if specified
    while (chunkStartPos < contentLength) {
      let chunkEndPos = chunkStartPos + chunkSize;
      
      // Respect paragraph boundaries if preserveParagraphs is enabled
      if (options.preserveParagraphs && chunkEndPos < contentLength) {
        // Look for a paragraph break
        const nextParagraphBreak = content.indexOf('\n\n', chunkEndPos);
        if (nextParagraphBreak !== -1 && nextParagraphBreak - chunkEndPos < 200) {
          // If a paragraph break is found within a reasonable distance, use it
          chunkEndPos = nextParagraphBreak + 2;
        } else {
          // Otherwise look for the nearest sentence end
          const nextSentenceEnd = this.findNextSentenceEnd(content, chunkEndPos);
          if (nextSentenceEnd !== -1) {
            chunkEndPos = nextSentenceEnd;
          }
        }
      }
      
      // Ensure we don't go past the end of the content
      chunkEndPos = Math.min(chunkEndPos, contentLength);
      
      // Extract the chunk
      const chunkContent = content.substring(chunkStartPos, chunkEndPos);
      
      // Create chunk metadata
      const metadata: ChunkMetadata = {
        index: chunkIndex,
        sourceId,
        sourceType: options.contentType || 'text',
        startPosition: chunkStartPos,
        endPosition: chunkEndPos
      };
      
      // Add chunk
      chunks.push({
        content: chunkContent,
        metadata
      });
      
      // Move to next chunk, accounting for overlap
      chunkStartPos = chunkEndPos - chunkOverlap;
      chunkIndex++;
    }
    
    // Calculate average chunk size
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
    const avgChunkSize = totalSize / chunks.length;
    
    return {
      chunks,
      totalChunks: chunks.length,
      avgChunkSize,
      metadata: {
        sourceId,
        sourceType: options.contentType || 'text',
        processingTime: 0, // This will be set by the calling method
        chunkingStrategy: 'basic'
      }
    };
  }

  /**
   * Find the next sentence end after a given position
   * @param content Content to search in
   * @param startPos Starting position
   * @returns Position of next sentence end, or -1 if not found
   */
  private findNextSentenceEnd(content: string, startPos: number): number {
    const sentenceEndRegex = /[.!?]\s+/g;
    sentenceEndRegex.lastIndex = startPos;
    
    const match = sentenceEndRegex.exec(content);
    return match ? match.index + 1 : -1;
  }

  /**
   * Section-based chunking strategy that respects document structure
   * @param content Content to chunk
   * @param options Chunking options
   * @returns Chunking result
   */
  private performSectionBasedChunking(
    content: string,
    options: ChunkingOptions & { sourceId?: string; contentType?: string }
  ): ChunkingResult {
    const sourceId = options.sourceId || `src-${Date.now()}`;
    
    this.logger.debug('Performing section-based chunking');
    
    // Identify sections in the content
    const sections = this.identifySections(content);
    
    const chunks: ContentChunk[] = [];
    let chunkIndex = 0;
    
    // Process each section
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      
      // For long sections, apply basic chunking
      if (section.content.length > options.chunkSize!) {
        // Use basic chunking for this section
        const sectionChunks = this.chunkSection(section.content, {
          ...options,
          sourceId
        }, chunkIndex, section.title);
        
        chunks.push(...sectionChunks);
        chunkIndex += sectionChunks.length;
      } else {
        // Short enough section, keep as a single chunk
        chunks.push({
          content: section.content,
          metadata: {
            index: chunkIndex,
            sourceId,
            sourceType: options.contentType || 'text',
            sectionTitle: section.title,
            startPosition: section.startPos,
            endPosition: section.endPos
          }
        });
        chunkIndex++;
      }
    }
    
    // Calculate average chunk size
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
    const avgChunkSize = chunks.length > 0 ? totalSize / chunks.length : 0;
    
    return {
      chunks,
      totalChunks: chunks.length,
      avgChunkSize,
      metadata: {
        sourceId,
        sourceType: options.contentType || 'text',
        processingTime: 0, // This will be set by the calling method
        chunkingStrategy: 'section-based',
        sectionCount: sections.length
      }
    };
  }

  /**
   * Identify sections in content
   * @param content Content to analyze
   * @returns Array of sections with position information
   */
  private identifySections(content: string): Array<{
    title: string;
    content: string;
    startPos: number;
    endPos: number;
  }> {
    // Look for section headers (e.g., Markdown-style headers, numbered sections)
    const sectionHeaderRegex = /(?:^|\n)(#{1,6} .+|\d+\.\s+.+)(?:\n|$)/g;
    const sections: Array<{
      title: string;
      content: string;
      startPos: number;
      endPos: number;
    }> = [];
    
    let lastIndex = 0;
    let lastTitle = 'Introduction';
    let match;
    
    // Find all section headers
    while ((match = sectionHeaderRegex.exec(content)) !== null) {
      const headerStart = match.index;
      const headerText = match[1].trim();
      
      // If we have content before this header, add it as a section
      if (headerStart > lastIndex) {
        const sectionContent = content.substring(lastIndex, headerStart).trim();
        if (sectionContent) {
          sections.push({
            title: lastTitle,
            content: sectionContent,
            startPos: lastIndex,
            endPos: headerStart
          });
        }
      }
      
      lastIndex = headerStart + match[0].length;
      lastTitle = headerText;
    }
    
    // Add the final section if there's content remaining
    if (lastIndex < content.length) {
      const sectionContent = content.substring(lastIndex).trim();
      if (sectionContent) {
        sections.push({
          title: lastTitle,
          content: sectionContent,
          startPos: lastIndex,
          endPos: content.length
        });
      }
    }
    
    // If no sections were found, treat the entire content as one section
    if (sections.length === 0) {
      sections.push({
        title: 'Content',
        content,
        startPos: 0,
        endPos: content.length
      });
    }
    
    return sections;
  }

  /**
   * Chunk a section using basic chunking
   * @param sectionContent Section content
   * @param options Chunking options
   * @param startIndex Starting chunk index
   * @param sectionTitle Section title
   * @returns Array of content chunks
   */
  private chunkSection(
    sectionContent: string,
    options: ChunkingOptions & { sourceId?: string; contentType?: string },
    startIndex: number,
    sectionTitle?: string
  ): ContentChunk[] {
    const chunkSize = options.chunkSize || 1000;
    const chunkOverlap = options.chunkOverlap || 100;
    const sourceId = options.sourceId || `src-${Date.now()}`;
    
    const chunks: ContentChunk[] = [];
    const contentLength = sectionContent.length;
    let chunkStartPos = 0;
    let chunkIndex = startIndex;
    
    while (chunkStartPos < contentLength) {
      let chunkEndPos = chunkStartPos + chunkSize;
      
      // Respect paragraph boundaries if enabled
      if (options.preserveParagraphs && chunkEndPos < contentLength) {
        const nextParagraphBreak = sectionContent.indexOf('\n\n', chunkEndPos);
        if (nextParagraphBreak !== -1 && nextParagraphBreak - chunkEndPos < 200) {
          chunkEndPos = nextParagraphBreak + 2;
        } else {
          const nextSentenceEnd = this.findNextSentenceEnd(sectionContent, chunkEndPos);
          if (nextSentenceEnd !== -1) {
            chunkEndPos = nextSentenceEnd;
          }
        }
      }
      
      // Ensure we don't go past the end of the content
      chunkEndPos = Math.min(chunkEndPos, contentLength);
      
      // Extract the chunk
      const chunkContent = sectionContent.substring(chunkStartPos, chunkEndPos);
      
      // Create chunk metadata
      const metadata: ChunkMetadata = {
        index: chunkIndex,
        sourceId,
        sourceType: options.contentType || 'text',
        sectionTitle,
        startPosition: chunkStartPos,
        endPosition: chunkEndPos
      };
      
      // Add chunk
      chunks.push({
        content: chunkContent,
        metadata
      });
      
      // Move to next chunk, accounting for overlap
      chunkStartPos = chunkEndPos - chunkOverlap;
      chunkIndex++;
    }
    
    return chunks;
  }

  /**
   * Semantic chunking using LLM to identify logical chunks
   * @param content Content to chunk
   * @param options Chunking options
   * @returns Chunking result
   */
  private async performSemanticChunking(
    content: string,
    options: ChunkingOptions & { sourceId?: string; contentType?: string }
  ): Promise<ChunkingResult> {
    const sourceId = options.sourceId || `src-${Date.now()}`;
    const contentType = options.contentType || 'text';
    
    this.logger.debug('Performing semantic chunking', { contentType });
    
    try {
      // If content is very long, first divide it into smaller pieces
      if (content.length > 30000) {
        return this.performHybridChunking(content, options);
      }
      
      // Create semantic chunks using the LLM
      const chunks = await this.createSemanticChunks(content, options);
      
      // Calculate average chunk size
      const totalSize = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
      const avgChunkSize = chunks.length > 0 ? totalSize / chunks.length : 0;
      
      return {
        chunks,
        totalChunks: chunks.length,
        avgChunkSize,
        metadata: {
          sourceId,
          sourceType: contentType,
          processingTime: 0, // This will be set by the calling method
          chunkingStrategy: 'semantic'
        }
      };
    } catch (error) {
      // If semantic chunking fails, fall back to section-based chunking
      this.logger.warn('Semantic chunking failed, falling back to section-based chunking', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return this.performSectionBasedChunking(content, options);
    }
  }

  /**
   * Hybrid chunking for long content
   * @param content Long content to chunk
   * @param options Chunking options
   * @returns Chunking result
   */
  private async performHybridChunking(
    content: string,
    options: ChunkingOptions & { sourceId?: string; contentType?: string }
  ): Promise<ChunkingResult> {
    const sourceId = options.sourceId || `src-${Date.now()}`;
    const contentType = options.contentType || 'text';
    
    this.logger.debug('Performing hybrid chunking for long content');
    
    // First break down by sections
    const sections = this.identifySections(content);
    const chunks: ContentChunk[] = [];
    let chunkIndex = 0;
    
    // Process each section
    for (const section of sections) {
      // For large sections, apply semantic chunking
      if (section.content.length > 10000) {
        // Break large sections into subsections
        const subsections = this.splitIntoSubsections(section.content);
        
        // Apply semantic chunking to each subsection
        for (const subsection of subsections) {
          try {
            const semanticChunks = await this.createSemanticChunks(
              subsection.content,
              options,
              chunkIndex,
              `${section.title} - ${subsection.title}`
            );
            
            chunks.push(...semanticChunks);
            chunkIndex += semanticChunks.length;
          } catch (error) {
            // If semantic chunking fails, fall back to basic chunking
            const basicChunks = this.chunkSection(
              subsection.content,
              options,
              chunkIndex,
              `${section.title} - ${subsection.title}`
            );
            
            chunks.push(...basicChunks);
            chunkIndex += basicChunks.length;
          }
        }
      } else {
        // For smaller sections, just use semantic chunking
        try {
          const semanticChunks = await this.createSemanticChunks(
            section.content,
            options,
            chunkIndex,
            section.title
          );
          
          chunks.push(...semanticChunks);
          chunkIndex += semanticChunks.length;
        } catch (error) {
          // Fall back to section-based chunking if needed
          const sectionChunks = this.chunkSection(
            section.content,
            options,
            chunkIndex,
            section.title
          );
          
          chunks.push(...sectionChunks);
          chunkIndex += sectionChunks.length;
        }
      }
    }
    
    // Calculate average chunk size
    const totalSize = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);
    const avgChunkSize = chunks.length > 0 ? totalSize / chunks.length : 0;
    
    return {
      chunks,
      totalChunks: chunks.length,
      avgChunkSize,
      metadata: {
        sourceId,
        sourceType: contentType,
        processingTime: 0, // This will be set by the calling method
        chunkingStrategy: 'hybrid',
        sectionCount: sections.length
      }
    };
  }

  /**
   * Split a large section into smaller subsections
   * @param sectionContent Section content to split
   * @returns Array of subsections
   */
  private splitIntoSubsections(sectionContent: string): Array<{
    title: string;
    content: string;
  }> {
    // Split by paragraph breaks or other natural divisions
    const paragraphs = sectionContent.split(/\n\n+/);
    const subsections: Array<{ title: string; content: string }> = [];
    
    // Group paragraphs into reasonably sized subsections
    let currentSubsection: string[] = [];
    let currentSize = 0;
    const maxSubsectionSize = 7000; // Target size for subsections
    
    for (const paragraph of paragraphs) {
      if (currentSize + paragraph.length > maxSubsectionSize && currentSubsection.length > 0) {
        // Current subsection is full, start a new one
        const content = currentSubsection.join('\n\n');
        const title = this.generateSubsectionTitle(content);
        subsections.push({ title, content });
        
        // Reset for next subsection
        currentSubsection = [paragraph];
        currentSize = paragraph.length;
      } else {
        // Add to current subsection
        currentSubsection.push(paragraph);
        currentSize += paragraph.length;
      }
    }
    
    // Add the last subsection if not empty
    if (currentSubsection.length > 0) {
      const content = currentSubsection.join('\n\n');
      const title = this.generateSubsectionTitle(content);
      subsections.push({ title, content });
    }
    
    return subsections;
  }

  /**
   * Generate a title for a subsection based on its content
   * @param content Subsection content
   * @returns Generated title
   */
  private generateSubsectionTitle(content: string): string {
    // Simple heuristic: use the first line if it's short enough
    const firstLine = content.split('\n')[0].trim();
    if (firstLine.length <= 50) {
      return firstLine;
    }
    
    // Otherwise, create a generic subsection title
    return 'Subsection';
  }

  /**
   * Create semantic chunks using the LLM
   * @param content Content to chunk
   * @param options Chunking options
   * @param startIndex Starting chunk index
   * @param sectionTitle Section title
   * @returns Array of semantic chunks
   */
  private async createSemanticChunks(
    content: string,
    options: ChunkingOptions & { sourceId?: string; contentType?: string },
    startIndex: number = 0,
    sectionTitle?: string
  ): Promise<ContentChunk[]> {
    const sourceId = options.sourceId || `src-${Date.now()}`;
    const contentType = options.contentType || 'text';
    const targetChunkSize = options.chunkSize || 1000;
    const maxChunks = Math.ceil(content.length / (targetChunkSize / 2));
    
    // Prepare the content for the LLM
    const contentPreview = content.length > 8000 
      ? content.substring(0, 8000) + '...' 
      : content;
    
    // Create prompt for semantic chunking
    const chunkingPrompt = `
    I have a ${contentType} that I need to divide into semantically meaningful chunks for retrieval. 
    Each chunk should be approximately ${targetChunkSize} characters but can vary based on natural semantic boundaries.
    
    The content is${sectionTitle ? ` from the section "${sectionTitle}"` : ''}:
    
    ${contentPreview}
    
    Please divide this into ${Math.min(maxChunks, 10)} coherent chunks based on semantic meaning and topical cohesion.
    For each chunk, provide:
    1. The chunk text
    2. A brief 1-5 word description/title for the chunk
    
    Format your response as JSON:
    {
      "chunks": [
        {
          "content": "...",
          "title": "..."
        },
        ...
      ]
    }
    `;
    
    try {
      const messages: MessageConfig[] = [
        { 
          role: 'system', 
          content: 'You are a content analysis assistant that helps divide text into semantically meaningful chunks for retrieval.' 
        },
        { role: 'user', content: chunkingPrompt }
      ];
      
      const response = await this.openAiConnector.generateResponse(messages, {
        temperature: 0.2,
        maxTokens: 4000
      });
      
      // Parse JSON response
      const responseText = String(response);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('Failed to parse semantic chunking response');
      }
      
      const result = JSON.parse(jsonMatch[0]);
      
      if (!result.chunks || !Array.isArray(result.chunks)) {
        throw new Error('Invalid semantic chunks format');
      }
      
      // Convert to ContentChunk format
      return result.chunks.map((chunk: { content: string; title: string }, index: number) => ({
        content: chunk.content,
        metadata: {
          index: startIndex + index,
          sourceId,
          sourceType: contentType,
          sectionTitle: sectionTitle || chunk.title,
          // We don't have exact positions for semantic chunks
          startPosition: 0,
          endPosition: 0
        }
      }));
    } catch (error) {
      this.logger.error('Error in semantic chunking', {
        error: error instanceof Error ? error.message : String(error),
        contentLength: content.length
      });
      throw error;
    }
  }
}