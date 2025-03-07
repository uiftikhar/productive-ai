import OpenAI from 'openai';

/**
 * Processes all transcript chunks concurrently.
 * @param chunks - Array of transcript chunks.
 * @param client - The OpenAI client instance.
 * @returns A promise that resolves to an array of summaries.
 */
export async function processAllChunks(chunks: string[], client: OpenAI): Promise<string[]> {
  return await Promise.all(chunks.map((chunk, index) => processChunk(chunk, index, client)));
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