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
  chunkPrompt: string,
  model = 'gpt-4',
  max_tokens = 700,
  temperature = 0,
  otherParams?: any,
): Promise<string[]> {
  const limit = pLimit(5);

  const getChunkPrompt = (chunk: string) => {
    return `
      ${chunkPrompt}

      Transcript:
\`\`\`
${chunk}
\`\`\`
    `;
  };

  const promises = chunks.map((chunk, index) =>
    limit(() =>
      processChunk(
        index,
        client,
        getChunkPrompt(chunk),
        model,
        max_tokens,
        temperature,
        otherParams,
      ),
    ),
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
  index: number,
  client: OpenAI,
  chunkPrompt: string,
  model = 'gpt-4',
  max_tokens = 700,
  temperature = 0,
  otherParams?: any,
): Promise<string> {
  const { data: completion, response } = await client.chat.completions
    .create({
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: chunkPrompt },
      ],
      model,
      max_tokens,
      temperature,
      ...otherParams,
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
