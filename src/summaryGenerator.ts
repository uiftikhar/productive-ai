import fs from 'fs/promises'; // or 'fs' with promises
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

interface ChunkResponse {
  content: string;
}
/**
 * Approximates token count using a simple word-count heuristic.
 * @param text - The text to estimate token count.
 * @returns number of tokens.
 */
function countTokens(text: string): number {
  return text.split(/\s+/).length;
}
/**
 * Splits the transcript into overlapping chunks to preserve context.
 * @param transcript - Full transcript text.
 * @param maxTokens - Maximum token count per chunk.
 * @param overlapLines - Number of overlapping lines between chunks.
 * @returns An array of transcript chunks.
 */
function splitTranscript(transcript: string, maxTokens = 2000, overlapLines = 3): string[] {
  const lines = transcript.split('\n').filter(line => line.trim().length > 0);
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

/**
 * Processes each transcript chunk with an optimized prompt to extract detailed, context-aware summaries.
 * @param chunk - A portion of the transcript.
 * @param index - The chunk index (for reference in the prompt).
 * @param client - The OpenAI client instance.
 * @returns A promise that resolves to the detailed summary for the chunk.
 */
async function processChunk(chunk: string, index: number, client: OpenAI): Promise<string> {
  const chunkPrompt = `
You are a seasoned Agile Coach and SCRUM Master with expert-level knowledge in agile methodologies.
Your task is to produce a detailed and context-aware summary for the following portion of a SCRUM meeting transcript.
For each speaker, identify:
  - Who presented a topic or rollout.
  - Who raised concerns or questions.
  - Key discussion themes, decisions, and action items.
Also indicate the meeting type (e.g., Planning, Grooming, Handover, Technical Refinement).
Your output should include the following sections:
  - Overall Summary: A detailed recap of this transcript portion.
  - Speaker Details: Specific contributions by each speaker.
  - Key Discussion Points.
  - Decisions and Action Items.
Ensure the response is between 150-250 words.
Transcript:
\`\`\`
${chunk}
\`\`\`
  `;
  const { data: completion, response } = await client.chat.completions
    .create({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: chunkPrompt },
      ],
      model: 'gpt-4',
      max_tokens: 500,
      temperature: 0.2,
    })
    .withResponse();

  const headers = Object.fromEntries(response.headers.entries());
  console.log(`Chunk ${index + 1} Headers:`, headers);

  const chunkSummary = completion.choices[0].message?.content?.trim();
  if (!chunkSummary) {
    throw new Error(`Received empty summary for chunk ${index + 1}`);
  }
  return chunkSummary;
}

/**
 * Generates a final, cohesive summary by combining partial summaries from transcript chunks.
 * The final output includes two sections: "Summary:" and "Decisions:".
 * @param partialSummaries - Array of chunk-level summaries.
 * @param client - The OpenAI client instance.
 * @returns A promise that resolves to the final detailed summary.
 */
async function processFinalSummary(partialSummaries: string[], client: OpenAI): Promise<string> {
  const combinedSummaries = partialSummaries.join('\n\n');

  const finalPrompt = `
You are a seasoned Agile Coach and SCRUM Master. Combine the following partial summaries from a SCRUM meeting transcript into a final, cohesive summary.
Your final output must include two distinct sections with the following exact titles:

Summary:
..... Here is the final summary generated .....

Decisions:
Decision made: A detailed summary of the decision

Ensure that:
  - The "Summary:" section provides a comprehensive overall recap of the meeting.
  - The "Decisions:" section lists each decision made during the meeting along with detailed explanations.
  - The final summary is context-aware and integrates speaker-specific details.
  - The output is between 150-250 words.

Partial Summaries:
\`\`\`
${combinedSummaries}
\`\`\`
  `;

  const { data: finalCompletion, response: finalResponse } = await client.chat.completions
    .create({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: finalPrompt },
      ],
      model: 'gpt-4',
      max_tokens: 500,
      temperature: 0.2,
    })
    .withResponse();

  console.log('Final Summary Headers:', Object.fromEntries(finalResponse.headers.entries()));
  const finalSummary = finalCompletion.choices[0].message?.content?.trim();
  if (!finalSummary) {
    throw new Error('Received empty final summary');
  }

  console.log("FINAL SUMMARY:", finalSummary);
  return finalSummary;
}

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
