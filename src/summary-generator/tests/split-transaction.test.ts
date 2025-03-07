import { splitTranscript } from '../split-transcript.ts';

describe('splitTranscript (real implementation)', () => {
  it('should return a single chunk for a short transcript', () => {
    const transcript = 'line one\nline two\nline three';
    // With high maxTokens, no split occurs.
    const chunks = splitTranscript(transcript, 100, 1);
    // Expect one chunk equal to the trimmed transcript.
    expect(chunks).toEqual([transcript.trim()]);
  });

  it('should split transcript into multiple chunks when exceeding maxTokens', () => {
    const transcript =
      'one two three\nfour five six\nseven eight nine\nten eleven twelve';
    // With maxTokens=6, expect a split.
    const chunks = splitTranscript(transcript, 6, 1);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should include overlapLines in subsequent chunks', () => {
    const transcript = 'line1\nline2\nline3\nline4';
    // Use maxTokens=3 and overlapLines=2:
    // Expected: first chunk = "line1\nline2\nline3", second chunk = "line2\nline3\nline4"
    const chunks = splitTranscript(transcript, 3, 2);
    expect(chunks.length).toBe(2);
    const firstChunkLines = chunks[0].split('\n');
    const secondChunkLines = chunks[1].split('\n');
    expect(secondChunkLines.slice(0, 2)).toEqual(firstChunkLines.slice(-2));
  });
});
