import OpenAI from 'openai';

import { processAllChunks } from '../shared/utils/process-chunk.ts';
import { splitTranscript } from '../shared/utils/split-transcript.ts';
import { processFinalSummary } from './process-final-summary.ts';

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
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const chunks = splitTranscript(transcript, 2000, 3);
    const chunkPrompt = `
You are a seasoned Agile Coach and SCRUM Master with expert-level knowledge in agile methodologies.
Your task is to produce a detailed and context-aware summary for the following portion of a SCRUM meeting transcript.
For each speaker, identify:
  - 1. Their role in the team (e.g., Product Owner, Developer, Tester, Stakeholder, etc).
  - 2. Topics or rollouts they presented.
  - 3. Concerns, questions, or suggestions they raised.
  - 4. Contributions to key discussion themes, decisions, and action items.
Also, identify and elaborate on the meeting type (e.g., Planning, Grooming, Handover, Technical Refinement)
and its objectives. Your output should include the following sections
  - 1. Overall Summary: A thorough recap of this transcript portion emphasizing the main objectives and outcomes of the meeting.
  - 2. Speaker Details: Specific contributions and roles of each speaker.
  - 3. Key Discussion Points: Highlight the central themes, any significant discussions, and their context within the broader project.
  - 4. Decisions and Action Items: Clearly list any decisions made, action items assigned, and their respective due dates or responsible parties.
  - 5. Meeting Context: Briefly outline the context of this discussion within the ongoing sprint or project milestone.

There is no limit on the response.\n
  `;

    const partialSummaries = await processAllChunks(
      chunks,
      client,
      chunkPrompt,
    );

    const combinedSummaries = partialSummaries.join('\n\n');

    const finalSummary = await processFinalSummary(combinedSummaries, client);
    return finalSummary;
  } catch (error) {
    console.error('Error in generateSummary:', error);
    throw error;
  }
}
