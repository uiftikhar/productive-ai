import OpenAI from 'openai';
import pLimit from 'p-limit';

import type { InstructionTemplateName } from '../prompts/instruction-templates';
import type { SystemRole } from '../prompts/prompt-types';
import { PromptManager } from '../services/prompt-manager.service';

async function processChunk(
  index: number,
  client: OpenAI,
  content: string,
  role: SystemRole,
  templateName: InstructionTemplateName,
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

  const { data: completion, response } = await client.chat.completions
    .create({
      messages: prompt.messages,
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

/**
 * Simple function to process chunks with concurrency limit
 */
async function processChunksWithLimit<T>(
  concurrency: number,
  items: any[],
  fn: (item: any, index: number) => Promise<T>,
): Promise<T[]> {
  const results: T[] = [];
  let running = 0;
  let index = 0;
  let hasError = false;
  let firstError: Error | null = null;

  return new Promise((resolve, reject) => {
    function startNext() {
      // If we've encountered an error, don't start any more tasks
      if (hasError) {
        if (running === 0) {
          reject(firstError);
        }
        return;
      }

      // If all tasks are done, resolve with results
      if (index >= items.length && running === 0) {
        resolve(results);
        return;
      }

      while (running < concurrency && index < items.length && !hasError) {
        const i = index++;
        running++;

        fn(items[i], i)
          .then((result) => {
            results[i] = result;
          })
          .catch((err) => {
            console.error(`Error processing item ${i}:`, err);
            
            // Track error and immediately set hasError flag
            hasError = true;
            firstError = err;
            
            results[i] = null as any;
          })
          .finally(() => {
            running--;
            startNext();
          });
      }
    }

    startNext();
  });
}

/**
 * Process all chunks concurrently with specified concurrency limit
 */
export async function processAllChunks(
  chunks: string[],
  client: OpenAI,
  role: SystemRole,
  templateName: InstructionTemplateName,
  userContext?: string,
  model: string = 'gpt-4',
  maxTokens: number = 700,
  temperature: number = 0,
  otherParams: any = {},
): Promise<string[]> {
  // Create a concurrency limit of 5 by default
  const limit = pLimit(5);

  // Map chunks to concurrent processing tasks
  const promises = chunks.map((chunk, i) => {
    return limit(() => processChunk(
      i,
      client,
      chunk,
      role,
      templateName,
      userContext,
      model,
      maxTokens,
      temperature,
      otherParams,
    ));
  });

  // Wait for all chunks to be processed
  return Promise.all(promises);
}
