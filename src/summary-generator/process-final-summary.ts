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
  //  TODO get meeting title from the transcript
  const meetingTitle = 'CPL+ Handover';

  const finalPrompt = `
You are a seasoned Agile Coach and SCRUM Master. You are an also expert in extracting detailed information and
creating precise meeting summaries. Your task is to generate a final, 
cohesive meeting summary by combining the provided partial summaries. 

Your final output must include two distinct sections with the following exact titles:

Meeting Title:
${meetingTitle}

Summary:
Provide a comprehensive overall recap of the meeting that integrates speaker-specific 
details and ensures a coherent flow of discussion points. 
Include the meeting type and objectives, and highlight any recurring themes
or critical issues discussed

..... Here is the final generated summary .....

Decisions:
For each decision made during the meeting, provide:
  - A key title summarizing the decision.
  - A detailed explanation of the decision, including the context in which it was made.
  - Who made the decision and any contributors to the discussion.
  - Derived action items with assigned responsible parties and due dates.

Ensure that:
  - The “Summary” section gives a thorough overview of the meeting, capturing 
    the essence of the discussions and main outcomes. It should also include information about the meeting, 
    using the meeting title and the transcript for deriving that information.
  - The “Decisions” section lists at least 3 key decisions made, each explained in at least 3 sentences.
  - The decisions are context-aware, incorporating relevant background and details from the summaries.
  - The final summary is context-aware and integrates speaker-specific details.
  - The output is complete and the entire response is completely generated.
  - The output is free of any word limit constraints, ensuring completeness.
  - The output should be given as a JSON Object which just formats the generated response data.
  - The format of the JSON object should be the following:
    {
      "meetingTitle": <string>,        // A concise, descriptive title for the meeting. If not provided, generate one based on the discussion.
      "summary": <string>,             // The generated summary .
      "decisions": [                   // An array of key decisions made during the meeting.
        {
          "title": <string>,           // A short, clear title summarizing the decision.
          "content": <string>          // The content of the decision made
        },
        ... (include at least 2 decisions, each with 3 or more sentences of explanation)
      ]
    }
    

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
        max_tokens: 1500, // increased from 500 to 1500 tokens
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
