import OpenAI from 'openai';

/**
 * Generates a final, cohesive summary by combining partial summaries from transcript chunks.
 * The final output includes two sections: "Summary:" and "Decisions:".
 * @param partialSummaries - Array of chunk-level summaries.
 * @param client - The OpenAI client instance.
 * @returns A promise that resolves to the final detailed summary.
 */
export async function processFinalSummary(
  combinedSummaries: string,
  client: OpenAI,
): Promise<string> {
  const finalPrompt = `
You are a seasoned Agile Coach and SCRUM Master. Combine the following partial summaries from a SCRUM meeting transcript into a final, cohesive summary.
Your final output must include two distinct sections with the following exact titles:

Summary:
..... Here is the final summary generated .....

Decisions:
(A key title for the decision that was made): A detailed summary of the decision including the context, who made it and what action item can be derived from this

Ensure that:
  - The "Summary:" section provides a comprehensive overall recap of the meeting.
  - The "Decisions:" section lists each decision made during the meeting along with detailed explanations. The minimum length for decisions needs to be at least 3 sentences,
  - The "Decisions" section contains at least 3 key decisions made. Generate as many context aware decisions as you dem necessary
  - The final summary is context-aware and integrates speaker-specific details.
  - The output has no word limit.

Partial Summaries:
\`\`\`
${combinedSummaries}
\`\`\`
  `;

  const { data: finalCompletion, response: finalResponse } =
    await client.chat.completions
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

  console.log(
    'Final Summary Headers:',
    Object.fromEntries(finalResponse.headers.entries()),
  );
  const finalSummary = finalCompletion.choices[0].message?.content?.trim();
  if (!finalSummary) {
    throw new Error('Received empty final summary');
  }

  console.log('FINAL SUMMARY:', finalSummary);
  return finalSummary;
}
