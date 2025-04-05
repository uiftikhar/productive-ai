import OpenAI from 'openai';

import { PromptManager } from '../shared/services/prompt-manager.service.ts';

export async function processFinalSummary(
  combinedSummaries: string,
  client: OpenAI,
): Promise<string> {
  const prompt = PromptManager.createPrompt(
    'MEETING_CHUNK_SUMMARIZER',
    'FINAL_MEETING_SUMMARY',
    combinedSummaries,
  );

  const { data: finalCompletion, response: finalResponse } =
    await client.chat.completions
      .create({
        messages: prompt.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        model: 'gpt-4',
        max_tokens: 1500,
        temperature: 0.2,
      })
      .withResponse();

  console.log(
    'Final Summary Headers:',
    Object.fromEntries(finalResponse.headers.entries()),
  );

  const finalSummary = finalCompletion.choices[0].message?.content?.trim();
  if (!finalSummary) {
    throw new Error('Received empty final summary');
  }

  console.log('RESPONSE:\n', finalSummary);
  let response;
  try {
    response = JSON.parse(finalSummary);
  } catch (error) {
    throw new Error('Error generating and formatting the summary.');
  }

  return response;
}
