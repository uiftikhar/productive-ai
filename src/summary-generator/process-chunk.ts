import OpenAI from 'openai';
import pLimit from 'p-limit';

/**
 * Processes all transcript chunks concurrently.
 * @param chunks - Array of transcript chunks.
 * @param client - The OpenAI client instance.
 * @returns A promise that resolves to an array of summaries.
 */
export async function processAllChunks(
  chunks: string[],
  client: OpenAI,
): Promise<string[]> {
  const limit = pLimit(5);

  const promises = chunks.map((chunk, index) =>
    limit(() => processChunk(chunk, index, client)),
  );

  return await Promise.all(promises);
}

/**
 * Processes each transcript chunk with an optimized prompt to extract detailed, context-aware summaries.
 * @param chunk - A portion of the transcript.
 * @param index - The chunk index (for reference in the prompt).
 * @param client - The OpenAI client instance.
 * @returns A promise that resolves to the detailed summary for the chunk.
 */
async function processChunk(
  chunk: string,
  index: number,
  client: OpenAI,
): Promise<string> {
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

There is no limit on the response
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
