import type { InstructionTemplate } from './prompt-types.ts';

export type InstructionTemplateName =
  | 'TICKET_GENERATION'
  | 'MEETING_CHUNK_SUMMARY'
  | 'FINAL_MEETING_SUMMARY';

export const InstructionTemplates: Record<
  InstructionTemplateName,
  InstructionTemplate
> = {
  TICKET_GENERATION: {
    format: {
      ticketType: ['Epic', 'Story', 'Task', 'Sub-task', 'Spike', 'Bug'],
      requiredFields: [
        'summary',
        'description',
        'acceptanceCriteria',
        'dependencies',
        'labels',
      ],
      emptyFields: ['assignees', 'estimate'],
      outputFormat: 'json_array',
    },
    rules: [
      'Generate only developer-focused tickets',
      'Include technical details and UX/UI requirements',
      'Use bullet-points for acceptance criteria',
      'Maximum 5 tickets per response',
    ],
  },
  MEETING_CHUNK_SUMMARY: {
    // Todo. This should not be mandatory. This is not a ticket generation prompt.
    format: {
      ticketType: [],
      requiredFields: ['summary', 'decisions', 'actionItems'],
      emptyFields: [],
      outputFormat: 'json_object',
    },
    rules: [
      'Identify meeting type and objectives',
      'Extract key discussion points',
      'List all decisions made',
      'Document action items with assignees',
      'For each speaker, identify:',
      '- 1. Their role in the team (e.g., Product Owner, Developer, Tester, Stakeholder, etc).',
      '- 2. Topics or rollout they presented.',
      '- 3. Concerns, questions, or suggestions they raised.',
      '- 4. Contributions to key discussion themes, decisions, and action items.',
    ],
    outputRequirements: [
      `Your output should include the following sections
        - 1. Overall Summary: A thorough recap of this transcript portion emphasizing the main objectives and outcomes of the meeting.
        - 2. Speaker Details: Specific contributions and roles of each speaker.
        - 3. Key Discussion Points: Highlight the central themes, any significant discussions, and their context within the broader project.
        - 4. Decisions and Action Items: Clearly list any decisions made, action items assigned, and their respective due dates or responsible parties.
        - 5. Meeting Context: Briefly outline the context of this discussion within the ongoing sprint or project milestone.
      There is no limit on the response.`,
    ],
  },
  FINAL_MEETING_SUMMARY: {
    // Todo. This should not be mandatory. This is not a ticket generation prompt.
    format: {
      ticketType: [],
      requiredFields: ['summary', 'decisions', 'actionItems'],
      emptyFields: [],
      outputFormat: 'json_object',
    },
    rules: [
      `Combine the partial summaries into a cohesive final summary.
       Generate three distinct sections with the following exact titles:
          Meeting Title: 
            - The title of the meeting.
          Summary:
            - Provide a comprehensive overall recap of the meeting that integrates speaker-specific 
              details and ensures a coherent flow of discussion points. 
            - Include the meeting type and objectives, and highlight any recurring themes
              or critical issues discussed.
          Decisions:
            For each decision made during the meeting, provide:
              - A key title summarizing the decision.
              - A detailed explanation of the decision, including the context in which it was made.
              - Who made the decision and any contributors to the discussion.
              - Derived action items with assigned responsible parties and due dates.

      Ensure:
        - A coherent flow of the output.
        - The “Summary” section gives a thorough overview of the meeting, capturing 
          the essence of the discussions and main outcomes. It should also include 
          information about the meeting, using the meeting title and the 
          transcript for deriving that information.
        - The decisions are context-aware, incorporating relevant background 
          and details from the summaries.
        - The final summary is context-aware and integrates speaker-specific details.
        - The output is complete and the entire response is completely generated.
        `,
    ],
    outputRequirements: [
      'The output is complete and the entire response is completely generated.',
      'The output is free of any word limit constraints, ensuring completeness.',
      'The output should be given as a JSON Object which just formats the generated response data.',
      'The “Decisions” section lists at least 3 key decisions made, each explained in at least 3 sentences.',
      `The format of the JSON object should be the following:
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
          }`,
    ],
  },
};
