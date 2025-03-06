import OpenAI from 'openai';

/**
 * Generates a final, cohesive summary by combining partial summaries from transcript chunks.
 * The final output includes two sections: "Summary:" and "Decisions:".
 * @param partialSummaries - Array of chunk-level summaries.
 * @param client - The OpenAI client instance.
 * @returns A promise that resolves to the final detailed summary.
 */
export async function processFinalSummary(partialSummaries: string[], client: OpenAI): Promise<string> {
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