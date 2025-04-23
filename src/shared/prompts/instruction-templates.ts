import type { InstructionTemplate } from './prompt-types';

export enum InstructionTemplateNameEnum {
  TICKET_GENERATION = 'TICKET_GENERATION',
  MEETING_CHUNK_SUMMARY = 'MEETING_CHUNK_SUMMARY',
  FINAL_MEETING_SUMMARY = 'FINAL_MEETING_SUMMARY',
  MEETING_ANALYSIS_CHUNK = 'MEETING_ANALYSIS_CHUNK',
  CUSTOM = 'CUSTOM',
  DEFAULT_CLASSIFIER = 'DEFAULT_CLASSIFIER',
  FOLLOWUP_CLASSIFIER = 'FOLLOWUP_CLASSIFIER',
  SPECIALIZED_CLASSIFIER = 'SPECIALIZED_CLASSIFIER',
}
export type InstructionTemplateName =
  | InstructionTemplateNameEnum.TICKET_GENERATION
  | InstructionTemplateNameEnum.MEETING_CHUNK_SUMMARY
  | InstructionTemplateNameEnum.FINAL_MEETING_SUMMARY
  | InstructionTemplateNameEnum.MEETING_ANALYSIS_CHUNK
  | InstructionTemplateNameEnum.CUSTOM
  | InstructionTemplateNameEnum.DEFAULT_CLASSIFIER
  | InstructionTemplateNameEnum.FOLLOWUP_CLASSIFIER
  | InstructionTemplateNameEnum.SPECIALIZED_CLASSIFIER;

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
      'The output should be only be a valid json object',
      'The output should not include any other text or formatting',
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
      'The output should be only be a valid json object',
      'The output should not include any other text or formatting',
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
  DEFAULT_CLASSIFIER: {
    format: {
      requiredSections: ['selectedAgentId', 'confidence', 'reasoning', 'isFollowUp', 'entities', 'intent'],
      outputFormat: 'json_object',
      jsonSchema: {
        properties: {
          selectedAgentId: {
            type: 'string',
            description: 'ID of the selected agent or null if none matched',
          },
          confidence: {
            type: 'number',
            description: 'Confidence score between 0-1',
          },
          reasoning: {
            type: 'string',
            description: 'Brief explanation of why this agent was selected',
          },
          isFollowUp: {
            type: 'boolean',
            description: 'Whether this is a follow-up to a previous conversation',
          },
          entities: {
            type: 'array',
            description: 'Key entities mentioned in the query',
          },
          intent: {
            type: 'string',
            description: 'User\'s primary intent',
          },
        },
      },
    },
    rules: [
      'Choose the most appropriate agent based on the nature of the query',
      'For follow-up responses, use the same agent as the previous interaction',
      'Provide a confidence score between 0-1, with 1 being absolute certainty',
      'Explain your decision process briefly',
      'Identify if the input appears to be a follow-up to a previous conversation',
      'Extract important entities mentioned in the query',
      'Categorize the overall intent of the user\'s request',
    ],
    outputRequirements: [
      'Valid JSON object with all required fields',
      'No preamble or additional text, only the JSON response',
      'Confidence score must be between 0 and 1',
    ],
    promptTemplate: `
You are AgentMatcher, an intelligent assistant designed to analyze user queries and match them with the most suitable agent. Your task is to understand the user's request, identify key entities and intents, and determine which agent would be best equipped to handle the query.

Important: The user's input may be a follow-up response to a previous interaction. The conversation history, including the name of the previously selected agent, is provided. If the user's input appears to be a continuation of the previous conversation (e.g., "yes", "ok", "I want to know more", "1"), select the same agent as before.

Analyze the user's input and categorize it into one of the following agent types:
<agents>
{{AGENT_DESCRIPTIONS}}
</agents>

Guidelines for classification:
1. Agent Selection: Choose the most appropriate agent based on the nature of the query. For follow-up responses, use the same agent as the previous interaction.
2. Confidence: Provide a confidence score between 0-1, with 1 being absolute certainty.
3. Reasoning: Explain your decision process briefly.
4. Identify follow-ups: If the input appears to be a follow-up to a previous conversation, note this in your response.
5. Extract key entities: Identify important entities mentioned in the query.
6. Determine intent: Categorize the overall intent of the user's request.

Here is the conversation history that you need to take into account before answering:
<history>
{{CONVERSATION_HISTORY}}
</history>

Respond in the following JSON format:
{
  "selectedAgentId": "agent-id-here-or-null-if-none-matched",
  "confidence": 0.95,
  "reasoning": "Brief explanation of why this agent was selected",
  "isFollowUp": true/false,
  "entities": ["entity1", "entity2"],
  "intent": "user's primary intent"
}

Skip any preamble and provide only the JSON response.
`,
  },
  FOLLOWUP_CLASSIFIER: {
    format: {
      requiredSections: ['isFollowUp', 'confidence', 'reasoning', 'selectedAgentId'],
      outputFormat: 'json_object',
      jsonSchema: {
        properties: {
          isFollowUp: {
            type: 'boolean',
            description: 'Whether this is a follow-up to a previous conversation',
          },
          confidence: {
            type: 'number',
            description: 'Confidence score between 0-1',
          },
          reasoning: {
            type: 'string',
            description: 'Brief explanation of why this is or isn\'t a follow-up',
          },
          selectedAgentId: {
            type: 'string',
            description: 'ID of the previously selected agent or null',
          },
        },
      },
    },
    rules: [
      'Determine if the current message is a continuation of a previous conversation',
      'Look for indicators like short responses, references to previous content, or requests for clarification',
      'Provide a confidence score between 0-1',
      'Explain your decision process briefly',
    ],
    outputRequirements: [
      'Valid JSON object with all required fields',
      'No preamble or additional text, only the JSON response',
      'Confidence score must be between 0 and 1',
    ],
    promptTemplate: `
You are a Follow-up Detector, an expert at analyzing whether a user's message is a continuation of a previous conversation thread. Your job is to determine if the current message should be handled by the same agent that responded last.

Analyze the following input and determine if it's a follow-up message. Consider these indicators of follow-ups:
- Short responses like "yes", "no", "okay", "tell me more"
- Questions about something just mentioned by the assistant
- References to previous content without full context
- Requests for clarification, elaboration, or examples
- Numeric responses that might be selecting an option

Here is the recent conversation history:
<history>
{{CONVERSATION_HISTORY}}
</history>

The current user input is: "{{USER_INPUT}}"

The most recent agent who responded was: "{{PREVIOUS_AGENT}}"

Respond in the following JSON format:
{
  "isFollowUp": true/false,
  "confidence": 0.95,
  "reasoning": "Brief explanation of why this is or isn't a follow-up",
  "selectedAgentId": "{{PREVIOUS_AGENT}}" or null
}

Skip any preamble and provide only the JSON response.
`,
  },
  SPECIALIZED_CLASSIFIER: {
    format: {
      requiredSections: ['selectedCapability', 'confidence', 'reasoning', 'entities', 'intent'],
      outputFormat: 'json_object',
      jsonSchema: {
        properties: {
          selectedCapability: {
            type: 'string',
            description: 'ID of the selected capability',
          },
          confidence: {
            type: 'number',
            description: 'Confidence score between 0-1',
          },
          reasoning: {
            type: 'string',
            description: 'Brief explanation of classification decision',
          },
          entities: {
            type: 'array',
            description: 'Specific domain entities mentioned',
          },
          intent: {
            type: 'string',
            description: 'Specific user intent',
          },
        },
      },
    },
    rules: [
      'Identify the exact specialized capability required',
      'Extract specific domain entities mentioned',
      'Determine user\'s intent within the specialized domain',
      'Provide a confidence score between 0-1',
      'Explain your decision process briefly',
    ],
    outputRequirements: [
      'Valid JSON object with all required fields',
      'No preamble or additional text, only the JSON response',
      'Confidence score must be between 0 and 1',
    ],
    promptTemplate: `
You are a specialized classifier focusing on correctly identifying the specific intent and entities within {{DOMAIN}} domain queries. 

Analyze the user's input and determine the following:
1. The exact specialized capability required
2. Specific domain entities mentioned
3. User's intent within this specialized domain

User input to classify:
"{{USER_INPUT}}"

Previous conversation context:
<history>
{{CONVERSATION_HISTORY}}
</history>

Available specialized capabilities:
<capabilities>
{{CAPABILITY_DESCRIPTIONS}}
</capabilities>

Respond in the following JSON format:
{
  "selectedCapability": "capability-id-here",
  "confidence": 0.95,
  "reasoning": "Brief explanation of classification decision",
  "entities": ["entity1", "entity2"],
  "intent": "specific user intent"
}

Skip any preamble and provide only the JSON response.
`,
  },
};
