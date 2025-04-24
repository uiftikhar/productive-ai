import OpenAI from 'openai';

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
  fn: (item: any, index: number) => Promise<T>
): Promise<T[]> {
  const results: T[] = [];
  let running = 0;
  let index = 0;
  
  return new Promise((resolve) => {
    function startNext() {
      if (index >= items.length && running === 0) {
        resolve(results);
        return;
      }
      
      while (running < concurrency && index < items.length) {
        const i = index++;
        running++;
        
        fn(items[i], i)
          .then(result => {
            results[i] = result;
          })
          .catch(err => {
            console.error(`Error processing item ${i}:`, err);
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
 * Processes all transcript chunks concurrently.
 * @param chunks - Array of transcript chunks.
 * @param client - The OpenAI client instance.
 * @returns A promise that resolves to an array of summaries.
 */
export async function processAllChunks(
  chunks: string[],
  client: OpenAI,
  role: SystemRole,
  templateName: InstructionTemplateName,
  userContext?: string,
  model = 'gpt-4',
  max_tokens = 700,
  temperature = 0,
  otherParams?: any,
): Promise<string[]> {
  // Using 5 as the concurrency limit
  return processChunksWithLimit(5, chunks, (chunk, index) => 
    processChunk(
      index,
      client,
      chunk,
      role,
      templateName,
      userContext,
      model,
      max_tokens,
      temperature,
      otherParams,
    )
  );
}
