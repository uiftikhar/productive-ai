import OpenAI from 'openai';
import pLimit from 'p-limit';

import type { SystemRole } from './config/prompts/prompt-types.ts';
import { PromptManager } from './config/services/prompt-manager.service.ts';

async function processChunk(
  index: number,
  client: OpenAI,
  content: string,
  role: SystemRole,
  templateName: string,
  userContext?: string,
  model = 'gpt-4',
  max_tokens = 700,
  temperature = 0,
  otherParams?: any,
): Promise<string> {
  const prompt = PromptManager.createPrompt(
    role,
    templateName,
    content,
    userContext,
  );

  console.log('Prompt:', prompt.messages);

  return '';
  // const { data: completion, response } = await client.chat.completions
  //   .create({
  //     messages: prompt.messages,
  //     model,
  //     max_tokens,
  //     temperature,
  //     ...otherParams,
  //   })
  //   .withResponse();

  // const headers = Object.fromEntries(response.headers.entries());
  // console.log(`Chunk ${index + 1} Headers:`, headers);

  // const chunkSummary = completion.choices[0].message?.content?.trim();
  // if (!chunkSummary) {
  //   throw new Error(`Received empty summary for chunk ${index + 1}`);
  // }
  // return chunkSummary;
}

/**
 * Processes all transcript chunks concurrently.
 * @param chunks - Array of transcript chunks.
 * @param client - The OpenAI client instance.
 * @returns A promise that resolves to an array of summaries.
 */
export async function processAllChunks(
  chunks: string[],
  client: OpenAI,
  role: SystemRole, // Changed from chunkPrompt: string
  templateName: string, // Added this parameter
  userContext?: string, // Changed from model parameter
  model = 'gpt-4', // Made this a default parameter
  max_tokens = 700,
  temperature = 0,
  otherParams?: any,
): Promise<string[]> {
  const limit = pLimit(5);

  const promises = chunks.map((chunk, index) =>
    limit(() =>
      processChunk(
        index,
        client,
        chunk, // Pass the chunk directly
        role,
        templateName,
        userContext,
        model,
        max_tokens,
        temperature,
        otherParams,
      ),
    ),
  );

  return await Promise.all(promises);
}
