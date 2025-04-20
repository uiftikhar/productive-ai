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
 * Splits the transcript into overlapping chunks to preserve context.
 *
 * This function divides a transcript into chunks based on token count,
 * maintaining some overlap between chunks to preserve context. It's
 * particularly useful for processing long transcripts that exceed model
 * context windows.
 *
 * @note This implementation uses a basic line-based splitting algorithm.
 * Future improvements could include:
 * - Speaker-aware splitting (keeping same speaker in same chunk when possible)
 * - Topic-based splitting using semantic similarity
 * - Intelligent overlap that ensures complete thoughts are preserved
 * - Adaptive chunk sizing based on content complexity
 *
 * @param transcript - Full transcript text
 * @param maxTokens - Maximum token count per chunk (default: 2000)
 * @param overlapLines - Number of overlapping lines between chunks (default: 3)
 * @returns An array of transcript chunks
 */
export function splitTranscript(
  transcript: string,
  maxTokens = 2000,
  overlapLines = 3,
): string[] {
  const lines = transcript.split('\n').filter((line) => line.trim().length > 0);
  const chunks: string[] = [];
  let currentChunk: string[] = [];
  let currentTokens = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tokens = countTokens(line);
    if (currentTokens + tokens > maxTokens && currentChunk.length > 0) {
      chunks.push(currentChunk.join('\n'));
      const overlap = currentChunk.slice(-overlapLines);
      currentChunk = [...overlap];
      currentTokens = countTokens(currentChunk.join(' '));
    }
    currentChunk.push(line);
    currentTokens += tokens;
  }
  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join('\n'));
  }
  return chunks;
}
