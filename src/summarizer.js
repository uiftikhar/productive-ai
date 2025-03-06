import fs from 'fs/promises'; // or 'fs' with promises
import OpenAI from 'openai';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Approximates the number of tokens in a text.
 * Here we use a simple word count heuristic.
 *
 * @param {string} text
 * @returns {number}
 */
function countTokens(text) {
  return text.split(/\s+/).length;
}

/**
 * Splits the transcript into chunks, each up to a maximum number of tokens.
 * Uses overlapping lines to preserve context between chunks.
 *
 * @param {string} transcript - The full transcript text.
 * @param {number} maxTokens - Maximum tokens per chunk.
 * @param {number} overlapLines - Number of lines to include as overlap.
 * @returns {string[]} Array of transcript chunks.
 */
function splitTranscript(transcript, maxTokens = 2000, overlapLines = 3) {
  // Split transcript into non-empty lines.
  const lines = transcript.split('\n').filter(line => line.trim().length > 0);
  const chunks = [];
  let currentChunk = [];
  let currentTokens = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tokens = countTokens(line);
    // If adding the next line exceeds our token limit and we already have some lines, create a new chunk.
    if (currentTokens + tokens > maxTokens && currentChunk.length > 0) {
      // Push the current chunk as a single string.
      chunks.push(currentChunk.join('\n'));
      // Start new chunk with overlap from the end of the current chunk.
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
export async function generateSummary() {
  try {
    // Read transcript from file

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);

    const transcriptPath = path.resolve(__dirname, '../data/Transcript-CPL-BTO-Tech-Handover.txt');
    const transcript = await fs.readFile(transcriptPath, 'utf8');

    const chunks = splitTranscript(transcript, 2000, 3);

   // Create an OpenAI client instance (API key is read automatically from process.env).
   const client = new OpenAI();

   const partialSummaries = [];
    // Engineered prompt with clear instructions, delimiters, and a specified format.
    
    for (const [index, chunk] of chunks.entries()) {

      const prompt = `
You are a seasoned Agile Coach and SCRUM Master with expert-level knowledge in agile methodologies.
Your task is to produce a detailed and context-aware summary for the following portion of a SCRUM meeting transcript.
For each speaker, identify:
- Who presented a topic or rollout.
- Who raised concerns or questions.
- Key discussion themes, decisions, and action items.
Include speaker-specific details such as "Person A presented the rollout on [topic]" and "Person B raised concerns regarding [issue]".
Provide a clear overall summary and include the following sections:
   - Overall Summary
   - Speaker Details and Their Contributions
   - Key Discussion Points
   - Decisions and Action Items
Keep the summary between 150-250 words.

Transcript:
\`\`\`
${chunk}
\`\`\`
      `;

      const { data: completion, response } = await client.chat.completions
        .create({
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: prompt },
          ],
          model: 'gpt-4', // or use a different chat model if desired
          max_tokens: 500,
          temperature: 0.2,
        })
        .withResponse();

      // Optional: Log headers (e.g., rate-limit information)
      console.log(`Chunk ${index + 1} Headers:`, Object.fromEntries(response.headers.entries()));
      partialSummaries.push(completion.choices[0].message.content.trim());
    }

    const combinedPartialSummaries = partialSummaries.join('\n\n');

  const finalPrompt = `
You are a seasoned Agile Coach and SCRUM Master. Combine the following partial summaries from a SCRUM meeting transcript into a final, cohesive summary.
Ensure your final summary is detailed and context-aware, including:
- A clear overall summary.
- Specific speaker contributions (e.g., "Person A presented...", "Person B raised concerns...").
- Grouped key discussion points.
- Decisions made and action items.
The final summary should be between 150-250 words.

Partial Summaries:
\`\`\`
${combinedPartialSummaries}
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
      return finalCompletion.choices[0].message.content.trim();
  
  } catch (error) {
    console.error('Error in generateSummary:', error);
    throw error;
  }
}
