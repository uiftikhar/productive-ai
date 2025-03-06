import fs from 'fs/promises'; // or 'fs' with promises
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

import { processChunk } from './process-chunk.ts';
import { processFinalSummary } from './process-final-summary.ts';
import { splitTranscript } from './split-transcript.ts';

/**
 * Generates a summary for a SCRUM meeting transcript.
 *
 * The transcript is assumed to be a meeting among SCRUM team members (e.g. planning,
 * grooming, handover, or technical refinement). The prompt instructs the model to:
 *  1. Identify the meeting type.
 *  2. Extract key discussion points.
 *  3. Highlight decisions and action items.
 *  4. Present the summary in a structured format with:
 *       - Summary
 *       - Meeting Type
 *       - Key Discussion Points
 *       - Key Decisions
 *       - Action Items
 *  The final summary should be concise (around 150-250 words) and written at an expert level.
 *
 * @returns {Promise<string>} The generated summary.
 */
export async function generateSummary(): Promise<string> {
  try {
    // Read transcript from file

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    // TODO: This should be an input from the user, ideally coming from a front end network request
    const transcriptPath = path.resolve(__dirname, '../data/Transcript-CPL-BTO-Tech-Handover.txt');
    const transcript = await fs.readFile(transcriptPath, 'utf8');

    const chunks = splitTranscript(transcript, 2000, 3);
    const client = new OpenAI();

    const partialSummaries: string[] = [];
    for (const [index, chunk] of chunks.entries()) {
      const summary = await processChunk(chunk, index, client);
      partialSummaries.push(summary);
    }

    const finalSummary = await processFinalSummary(partialSummaries, client);
    return finalSummary;
  
  } catch (error) {
    console.error('Error in generateSummary:', error);
    throw error;
  }
}
