/**
 * Transcript Processing Utilities
 *
 * Functions for handling and processing meeting transcripts.
 *
 * @status STABLE
 */

/**
 * Approximates token count using a simple word-count heuristic.
 * This is faster than precise tokenization but less accurate.
 *
 * @param text - The text to estimate token count
 * @returns Estimated number of tokens
 */
function countTokens(text: string): number {
  return text.split(/\s+/).length;
}

/**
 * Estimates content complexity based on various factors
 *
 * @param text - Text to analyze for complexity
 * @returns Complexity score (0-1) where higher means more complex
 */
function estimateContentComplexity(text: string): number {
  if (!text || text.length === 0) return 0;

  // Factors that indicate complexity
  const avgWordLength =
    text.split(/\s+/).reduce((sum, word) => sum + word.length, 0) /
    (text.split(/\s+/).length || 1);

  const technicalTerms = [
    'algorithm',
    'implementation',
    'architecture',
    'infrastructure',
    'deployment',
    'integration',
    'scalability',
    'performance',
    'optimization',
    'framework',
    'methodology',
    'protocol',
    'middleware',
    'interface',
  ];

  const termCount = technicalTerms.reduce((count, term) => {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    return count + (text.match(regex)?.length || 0);
  }, 0);

  // Sentence length as complexity indicator
  const sentences = text.split(/[.!?]+/);
  const avgSentenceLength =
    sentences.reduce((sum, sentence) => sum + countTokens(sentence), 0) /
    (sentences.length || 1);

  // Calculate complexity score (normalize between 0-1)
  let complexityScore = 0;
  complexityScore += Math.min(avgWordLength / 10, 0.3); // Word length contribution (max 0.3)
  complexityScore += Math.min(termCount / 20, 0.3); // Technical terms contribution (max 0.3)
  complexityScore += Math.min(avgSentenceLength / 40, 0.4); // Sentence length contribution (max 0.4)

  return Math.min(complexityScore, 1);
}

/**
 * Identifies potential speaker changes in transcript
 *
 * @param lines - Array of transcript lines
 * @returns Array of indices where speaker likely changes
 */
function identifySpeakerChanges(lines: string[]): number[] {
  const speakerChanges: number[] = [];

  // Common speaker patterns in transcripts
  const speakerPatterns = [
    /^([A-Z][a-z]+):/, // Simple "Name:" format
    /^([A-Z][a-z]+ [A-Z][a-z]+):/, // "First Last:" format
    /^\[([^\]]+)\]/, // [Speaker] format
    /^<([^>]+)>/, // <Speaker> format
    /^([A-Z][a-z]+ [A-Z]\.):/, // "First L.:" format
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if line starts with speaker pattern
    const isSpeakerLine = speakerPatterns.some((pattern) => pattern.test(line));

    if (isSpeakerLine) {
      speakerChanges.push(i);
    }
  }

  return speakerChanges;
}

/**
 * Finds optimal chunk boundaries based on speaker changes and semantic boundaries
 *
 * @param lines - Array of transcript lines
 * @param speakerChanges - Array of indices where speakers change
 * @param maxTokens - Maximum tokens per chunk
 * @returns Array of optimal split indices
 */
function findOptimalChunkBoundaries(
  lines: string[],
  speakerChanges: number[],
  maxTokens: number,
): number[] {
  const boundaries: number[] = [0]; // Start with beginning of transcript
  let currentTokens = 0;
  let lastSpeakerChange = 0;

  for (let i = 0; i < lines.length; i++) {
    currentTokens += countTokens(lines[i]);

    // Check if we're approaching max tokens
    if (currentTokens > maxTokens * 0.8) {
      // Find the best boundary - prefer speaker changes
      const nearestSpeakerChange = speakerChanges.find(
        (idx) => idx > lastSpeakerChange && idx < i,
      );

      if (nearestSpeakerChange && i - nearestSpeakerChange < maxTokens * 0.3) {
        // If there's a speaker change within 30% of current position, use it
        boundaries.push(nearestSpeakerChange);
        lastSpeakerChange = nearestSpeakerChange;
        currentTokens = lines
          .slice(nearestSpeakerChange, i + 1)
          .reduce((sum, line) => sum + countTokens(line), 0);
      } else if (currentTokens >= maxTokens) {
        // Otherwise split at current position if we've reached max tokens
        boundaries.push(i);
        lastSpeakerChange = i;
        currentTokens = 0;
      }
    }
  }

  // Add end boundary if not already present
  if (boundaries[boundaries.length - 1] !== lines.length - 1) {
    boundaries.push(lines.length - 1);
  }

  return boundaries;
}

/**
 * Splits the transcript into overlapping chunks with adaptive sizing based on content complexity.
 *
 * Enhanced implementation that supports:
 * - Adaptive chunk sizing based on content complexity
 * - Speaker-aware splitting to maintain speaker context
 * - Intelligent boundary detection to preserve complete thoughts
 * - Optimized overlap to ensure context preservation
 *
 * @param transcript - Full transcript text
 * @param maxTokens - Maximum token count per chunk (default: 2000)
 * @param overlapTokens - Number of overlap tokens between chunks (default: 200)
 * @returns An array of transcript chunks
 */
export function splitTranscript(
  transcript: string,
  maxTokens = 2000,
  overlapTokens = 200,
): string[] {
  // Handle empty or tiny transcripts
  if (!transcript || transcript.length === 0) {
    return [];
  }
  if (countTokens(transcript) <= maxTokens) {
    return [transcript];
  }

  const lines = transcript.split('\n').filter((line) => line.trim().length > 0);

  // Analyze content complexity to adapt chunk size
  const complexity = estimateContentComplexity(transcript);
  const adaptedMaxTokens = Math.floor(maxTokens * (1 - complexity * 0.3)); // Reduce size for complex content
  const adaptedOverlapTokens = Math.floor(
    overlapTokens * (1 + complexity * 0.5),
  ); // Increase overlap for complex content

  // Find speaker changes to improve chunk boundaries
  const speakerChanges = identifySpeakerChanges(lines);

  // Find optimal chunk boundaries
  const boundaries = findOptimalChunkBoundaries(
    lines,
    speakerChanges,
    adaptedMaxTokens,
  );

  // Create chunks based on boundaries with proper overlap
  const chunks: string[] = [];

  for (let i = 0; i < boundaries.length - 1; i++) {
    const startIdx = boundaries[i];
    const endIdx = boundaries[i + 1];

    // Calculate overlap with previous chunk
    let overlapStart = startIdx;
    if (i > 0) {
      let overlapTokenCount = 0;
      let idx = startIdx;
      while (
        idx > boundaries[i - 1] &&
        overlapTokenCount < adaptedOverlapTokens
      ) {
        idx--;
        overlapTokenCount += countTokens(lines[idx]);
      }
      overlapStart = idx;
    }

    // Calculate overlap with next chunk (for end boundary)
    let overlapEnd = endIdx;
    if (i < boundaries.length - 2) {
      let overlapTokenCount = 0;
      let idx = endIdx;
      while (
        idx < lines.length - 1 &&
        overlapTokenCount < adaptedOverlapTokens
      ) {
        idx++;
        overlapTokenCount += countTokens(lines[idx]);
      }
      overlapEnd = idx;
    }

    // Create chunk with overlaps
    const chunkLines = lines.slice(overlapStart, overlapEnd + 1);
    chunks.push(chunkLines.join('\n'));
  }

  return chunks;
}
