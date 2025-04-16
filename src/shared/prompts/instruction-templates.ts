import type { InstructionTemplate } from './prompt-types';

export enum InstructionTemplateNameEnum {
  TICKET_GENERATION = 'TICKET_GENERATION',
  MEETING_CHUNK_SUMMARY = 'MEETING_CHUNK_SUMMARY',
  FINAL_MEETING_SUMMARY = 'FINAL_MEETING_SUMMARY',
  MEETING_ANALYSIS_CHUNK = 'MEETING_ANALYSIS_CHUNK',
  CUSTOM = 'CUSTOM',
}
export type InstructionTemplateName =
  | InstructionTemplateNameEnum.TICKET_GENERATION
  | InstructionTemplateNameEnum.MEETING_CHUNK_SUMMARY
  | InstructionTemplateNameEnum.FINAL_MEETING_SUMMARY
  | InstructionTemplateNameEnum.MEETING_ANALYSIS_CHUNK
  | InstructionTemplateNameEnum.CUSTOM;

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
      outputFormat: 'json_array',
    },
    rules: [
      `
        - Clearly define Ticket Types: Epic | Story | Task | Sub-task | Spike | Bug.
        - Summarize the purpose concisely and clearly.
        - Provide detailed descriptions including technical details, UX/UI requirements, expectations, and relevant context.
        - Define clear Acceptance Criteria in bullet-point form.
        - Explicitly list Dependencies when applicable, clearly identifying dependent tickets or tasks.
        - Suggest meaningful labels relevant to the ticket 
          (frontend, backend, UX, urgent, payments, elasticsearch, wishlist, performance, synchronization, etc.).
        - Clearly differentiate between frontend, backend, UX/UI, and integration tasks.
        - Identify spikes separately from actionable tasks.
        - Explicitly highlight performance, scalability, or UX issues mentioned.
        - Document any scope reduction, iterative approaches, or key technical solutions 
          agreed upon (e.g., Elasticsearch integration, idempotency keys, wishlist syncing).
        - Prioritize urgent or critical issues explicitly (e.g., duplicate payments), including interim and long-term solutions.
      `,
    ],
    outputRequirements: [
      `
        - There is no limit on the response
        - All sections must be complete and detailed
        - Each object in the Output Array is a complete valid object.
        - If an item is not a fully valid JSON Object, remove it from the output array. 
        - Make sure you perform this JSON Object validation check on each and every object.
        - If there are no tickets to generate, you return an empty array.
        - Never truncate JSON objects or arrays.  
      `,
    ],
  },
  MEETING_CHUNK_SUMMARY: {
    format: {
      requiredSections: ['meeting title', 'summary', 'decisions'],
      outputFormat: 'json_object',
      jsonSchema: {
        properties: {
          summary: {
            type: 'string',
            description:
              'A thorough recap emphasizing main objectives and outcomes',
          },
          meetingTitle: {
            type: 'string',
            description: 'The title of the meeting',
          },
          decisionPoints: {
            type: 'array',
            description: 'Decisions made and action items with assignees',
          },
        },
      },
    },
    rules: [
      'Identify meeting type and objectives',
      'Extract key discussion points',
      'List all decisions made',
      'Document action items with assignees',
      'For each speaker, identify:',
      '- 1. Their role in the team',
      '- 2. Topics or rollout they presented',
      '- 3. Concerns, questions, or suggestions they raised',
      '- 4. Contributions to key discussion themes, decisions, and action items',
    ],
    outputRequirements: [
      'There is no limit on the response',
      'All sections must be complete and detailed',
    ],
  },
  MEETING_ANALYSIS_CHUNK: {
    format: {
      requiredSections: [
        'action items',
        'decisions',
        'questions',
        'key topics',
      ],
      outputFormat: 'json_object',
      jsonSchema: {
        properties: {
          actionItems: {
            type: 'array',
            description: 'Action items with assignees and due dates',
          },
          decisions: {
            type: 'array',
            description: 'Key decisions made in the meeting',
          },
          questions: {
            type: 'array',
            description:
              'Questions asked during the meeting, marked if answered',
          },
          keyTopics: {
            type: 'array',
            description: 'Main topics discussed in the meeting',
          },
        },
      },
    },
    rules: [
      'Extract all action items with assignees and any mentioned due dates',
      'Identify all decisions made during the discussion',
      'Capture all questions and mark whether they were answered',
      'List all key topics that were discussed',
      'Maintain the original context and meaning',
      'Format output in structured JSON format',
    ],
    outputRequirements: [
      'Complete structured data in JSON format',
      'Include all identified elements for comprehensive analysis',
      'Ensure proper attribution for action items',
    ],
  },
  FINAL_MEETING_SUMMARY: {
    format: {
      requiredSections: ['Meeting Title', 'Summary', 'Decisions'],
      outputFormat: 'json_object',
      jsonSchema: {
        properties: {
          meetingTitle: {
            type: 'string',
            description: 'A concise, descriptive title for the meeting',
          },
          summary: {
            type: 'string',
            description:
              'Comprehensive meeting summary with speaker details and discussion flow',
          },
          decisions: {
            type: 'array',
            description:
              'Array of decisions, each with title and detailed content',
          },
        },
      },
    },
    rules: [
      'Combine partial summaries into a cohesive final summary',
      'Include meeting type and objectives',
      'Highlight recurring themes and critical issues',
      'Each decision must include context and contributors',
      'Ensure speaker-specific details are integrated',
    ],
    outputRequirements: [
      'No word limit constraints',
      'At least 3 key decisions, each explained in 3+ sentences',
      'Complete JSON object with all required fields',
      'Decisions must include title and detailed content',
    ],
  },
  CUSTOM: {
    format: {
      requiredSections: ['content'],
      outputFormat: 'json_object',
      jsonSchema: {
        properties: {
          content: {
            type: 'string',
            description:
              'Custom formatted content based on the specific request',
          },
        },
      },
    },
    rules: [
      'Follow the specific instructions provided for this custom template',
      'Adapt output format to the task requirements',
    ],
    outputRequirements: [
      'Follows specific formatting requirements as instructed',
      'Complete and detailed output as required by the task',
    ],
  },
};
