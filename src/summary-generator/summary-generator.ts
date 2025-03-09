import OpenAI from 'openai';

import { processAllChunks } from './process-chunk.ts';
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
export async function generateSummary(transcript: string): Promise<string> {
  try {
    const chunks = splitTranscript(transcript, 2000, 3);
    const client = new OpenAI();

    const partialSummaries = await processAllChunks(chunks, client);
    const combinedSummaries = partialSummaries.join('\n\n');

    const finalSummary = await processFinalSummary(combinedSummaries, client);
    return finalSummary;
  } catch (error) {
    console.error('Error in generateSummary:', error);
    throw error;
  }
}
