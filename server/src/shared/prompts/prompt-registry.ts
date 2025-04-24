import { PromptLibrary } from './prompt-library';

/**
 * SystemRole enum defines the available system roles
 */
export enum SystemRoleEnum {
  AGILE_COACH = 'AGILE_COACH',
  MEETING_CHUNK_SUMMARIZER = 'MEETING_CHUNK_SUMMARIZER',
  FINAL_SUMMARY_GENERATOR = 'FINAL_SUMMARY_GENERATOR',
  MEETING_ANALYST = 'MEETING_ANALYST',
  ASSISTANT = 'ASSISTANT',
}

/**
 * Union type of available system roles
 */
export type SystemRole = keyof typeof SystemRoleEnum;

/**
 * Instruction template names
 */
export enum InstructionTemplateEnum {
  TICKET_GENERATION = 'TICKET_GENERATION',
  MEETING_CHUNK_SUMMARY = 'MEETING_CHUNK_SUMMARY',
  FINAL_MEETING_SUMMARY = 'FINAL_MEETING_SUMMARY',
  MEETING_ANALYSIS_CHUNK = 'MEETING_ANALYSIS_CHUNK',
  CUSTOM = 'CUSTOM',
}

/**
 * Union type of available instruction templates
 */
export type InstructionTemplate = keyof typeof InstructionTemplateEnum;

/**
 * Format types for instruction templates
 */
export type TicketFormat = {
  ticketType: string[];
  requiredFields: string[];
  emptyFields?: string[];
  outputFormat: 'json_array' | 'json_object';
};

export type MeetingSummaryFormat = {
  requiredSections: string[];
  outputFormat: 'json_object';
  jsonSchema: {
    properties: Record<
      string,
      {
        type: string;
        description: string;
      }
    >;
  };
};

/**
 * System message definition
 */
export type SystemMessage = {
  role: 'system';
  content: string;
};

/**
 * Prompt template definition
 */
export interface PromptTemplate {
  id: string;
  version: string;
  description: string;
  components: string[];
  defaultReplacements?: Record<string, string>;
  metadata?: {
    author?: string;
    createdAt?: number;
    updatedAt?: number;
    tags?: string[];
    modelCompatibility?: string[];
  };
}

/**
 * Template definition with format, rules, and output requirements
 */
export type InstructionTemplateDefinition<
  T = TicketFormat | MeetingSummaryFormat,
> = {
  format: T;
  rules: string[];
  outputRequirements?: string[];
};

/**
 * PromptRegistry - A consolidated registry for all prompt-related definitions
 */
export class PromptRegistry {
  // System role definitions
  private static systemPrompts: Record<SystemRole, SystemMessage> = {
    AGILE_COACH: {
      role: 'system',
      content: `You are an expert Agile Coach and Scrum Master with deep expertise in Agile methodologies, 
      Scrum practices, Jira ticket creation, and project management for technical development teams. You 
      have detailed knowledge of Jira's capabilities, workflows, and best practices for structuring 
      tickets clearly and comprehensively. You also understand technical refinements and how to convert
      discussions into clearly defined tasks, user stories, spikes, bugs, and epics.
      `,
    },
    MEETING_CHUNK_SUMMARIZER: {
      role: 'system',
      content: `You are a seasoned Agile Coach and SCRUM Master with expert-level knowledge in agile methodologies.
      You specialize in producing detailed and context-aware summaries of SCRUM meetings, identifying key 
      discussion points, decisions, and action items. You have industry expertise to identify and elaborate on the meeting type 
      (e.g., Planning, Grooming, Handover, Technical Refinement) and its objectives. 
      `,
    },
    MEETING_ANALYST: {
      role: 'system',
      content: `You are a meeting analysis specialist with expertise in extracting structured information from meeting transcripts.
      Your task is to analyze meeting content and identify key components including action items, decisions made, questions 
      raised (both answered and unanswered), and main topics discussed. You're skilled at recognizing 
      assignments of responsibility, identifying deadlines, and distinguishing between different types of decisions.
      You format your output in structured JSON with clear organization and attribution. Your analysis maintains fidelity 
      to the original transcript while providing a structured representation that enhances accessibility and follow-up.
      `,
    },
    FINAL_SUMMARY_GENERATOR: {
      role: 'system',
      content: `Role: 
      You are a seasoned Agile Coach and SCRUM Master with expert-level knowledge in agile methodologies.
      You specialize in producing detailed and context-aware summaries of SCRUM meetings, identifying key 
      discussion points, decisions, and action items. You have industry expertise to identify and elaborate on the meeting type 
      (e.g., Planning, Grooming, Handover, Technical Refinement) and its objectives. You are an also expert in extracting detailed information and
      creating precise meeting summaries. Your task is to generate a final, cohesive meeting summary by combining the provided partial summaries. 
      Task: 
      Analyze the provided technical refinement meeting transcript carefully and generate clearly 
      structured Jira tickets in the JSON format specified below.. Each ticket must clearly state 
      the ticket type (Story, Task, Sub-task, Spike, Bug), include a clear and concise summary, detailed
      description, acceptance criteria, dependencies (if applicable), assignee(s), labels, and estimate 
      placeholders. Each ticket generated should precisely follow the defined structure and requirements.
      `,
    },
    ASSISTANT: {
      role: 'system',
      content: `You are a helpful, intelligent assistant specialized in analyzing and processing information.
      You provide concise, accurate responses based on the context provided. Your responses are well-structured,
      factual, and directly address the query or task at hand. You can process various types of information
      including documents, conversations, and structured data, and present insights in a clear, organized manner.
      `,
    },
  };

  // Instruction template definitions
  private static instructionTemplates: Record<
    InstructionTemplate,
    InstructionTemplateDefinition
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

  // Prompt templates
  private static promptTemplates: Map<string, PromptTemplate> = new Map();

  /**
   * Initialize the registry
   */
  static initialize(): void {
    this.registerDefaultPromptTemplates();

    Object.entries(this.systemPrompts).forEach(([role, message]) => {
      PromptLibrary.registerComponent(
        `system.${role.toLowerCase()}`,
        message.content,
        '1.0',
        {
          description: `System prompt for ${role}`,
          tags: ['system', role.toLowerCase()],
        },
      );
    });

    Object.entries(this.instructionTemplates).forEach(([name, template]) => {
      const rulesContent = template.rules.join('\n\n');
      const requirementsContent = template.outputRequirements
        ? template.outputRequirements.join('\n\n')
        : '';

      PromptLibrary.registerComponent(
        `instruction.${name.toLowerCase()}`,
        `${rulesContent}\n\n${requirementsContent}`,
        '1.0',
        {
          description: `Instruction template for ${name}`,
          tags: ['instruction', name.toLowerCase()],
        },
      );
    });
  }

  /**
   * Get a system prompt by role
   */
  static getSystemPrompt(role: SystemRole): SystemMessage {
    const prompt = this.systemPrompts[role];
    if (!prompt) {
      throw new Error(`Invalid system role: ${role}`);
    }
    return prompt;
  }

  /**
   * Get an instruction template by name
   */
  static getInstructionTemplate(
    name: InstructionTemplate,
  ): InstructionTemplateDefinition {
    return this.instructionTemplates[name];
  }

  /**
   * Register a prompt template
   */
  static registerPromptTemplate(template: PromptTemplate): void {
    this.promptTemplates.set(template.id, template);
  }

  /**
   * Get a prompt template by ID
   */
  static getPromptTemplate(id: string): PromptTemplate | undefined {
    return this.promptTemplates.get(id);
  }

  /**
   * List all available prompt templates
   */
  static listPromptTemplates(): PromptTemplate[] {
    return Array.from(this.promptTemplates.values());
  }

  /**
   * Register default prompt templates
   */
  private static registerDefaultPromptTemplates(): void {
    const defaultTemplates: PromptTemplate[] = [
      {
        id: 'concise-qa',
        version: '1.0',
        description: 'Concise question answering template',
        components: ['system.assistant', 'instruction.custom'],
        metadata: {
          author: 'system',
          createdAt: Date.now(),
          tags: ['qa', 'concise'],
          modelCompatibility: ['gpt-3.5-turbo', 'gpt-4'],
        },
      },
      {
        id: 'detailed-analysis',
        version: '1.0',
        description: 'Detailed analysis of complex topics',
        components: ['system.assistant', 'instruction.custom'],
        metadata: {
          author: 'system',
          createdAt: Date.now(),
          tags: ['analysis', 'detailed'],
          modelCompatibility: ['gpt-4', 'claude-2'],
        },
      },
      {
        id: 'meeting-analysis',
        version: '1.0',
        description: 'Meeting analysis template',
        components: [
          'system.meeting_analyst',
          'instruction.meeting_analysis_chunk',
        ],
        metadata: {
          author: 'system',
          createdAt: Date.now(),
          tags: ['meeting', 'analysis'],
          modelCompatibility: ['gpt-4'],
        },
      },
      {
        id: 'meeting-summary',
        version: '1.0',
        description: 'Meeting summary template',
        components: [
          'system.meeting_chunk_summarizer',
          'instruction.final_meeting_summary',
        ],
        metadata: {
          author: 'system',
          createdAt: Date.now(),
          tags: ['meeting', 'summary'],
          modelCompatibility: ['gpt-4'],
        },
      },
    ];

    defaultTemplates.forEach((template) =>
      this.registerPromptTemplate(template),
    );
  }

  /**
   * Creates a prompt using a system role and instruction template
   * @param role The system role to use
   * @param templateName The instruction template to use
   * @param content The content to process
   * @param userContext Optional user context to include
   * @returns A formatted prompt with messages ready for LLM consumption
   */
  static createPrompt(
    role: SystemRole,
    templateName: InstructionTemplate,
    content: string,
    userContext?: string,
  ): { messages: Array<{ role: string; content: string }> } {
    const template = this.getInstructionTemplate(templateName);
    if (!template) {
      throw new Error(`Invalid template name: ${templateName}`);
    }

    const formatRequirements = this.formatTemplateRequirements(template);
    const userPrompt = `
${formatRequirements}
${userContext ? `\nUser Context:\n${userContext}\n` : ''}
Content to Process:
${content}`;

    return {
      messages: [
        this.getSystemPrompt(role),
        { role: 'user', content: userPrompt },
      ],
    };
  }

  /**
   * Creates a prompt using a predefined prompt template
   * @param templateId The ID of the template to use
   * @param content The content to process
   * @param replacements Optional variable replacements
   * @returns A formatted prompt with messages ready for LLM consumption
   */
  static createPromptFromTemplate(
    templateId: string,
    content: string,
    replacements: Record<string, string> = {},
  ): { messages: Array<{ role: string; content: string }> } {
    const template = this.getPromptTemplate(templateId);
    if (!template) {
      throw new Error(`Template '${templateId}' not found`);
    }

    // Combine replacements with default template replacements
    const combinedReplacements = {
      ...template.defaultReplacements,
      ...replacements,
      QUERY: content,
    };

    // Use the PromptLibrary to build the prompt from components
    const { prompt: systemPrompt } =
      PromptLibrary.createVersionedCompositePrompt(template.components, {
        replacements: combinedReplacements,
        includeDescriptions: false,
      });

    // Format messages for LLM
    return {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content },
      ],
    };
  }

  /**
   * Format instruction template requirements for prompt inclusion
   */
  private static formatTemplateRequirements(
    template: InstructionTemplateDefinition,
  ): string {
    // Check if it's a ticket-type template or meeting-summary-type template
    if ('ticketType' in template.format) {
      return this.formatTicketTemplateRequirements(
        template as InstructionTemplateDefinition<TicketFormat>,
      );
    } else {
      return this.formatMeetingSummaryTemplateRequirements(
        template as InstructionTemplateDefinition<MeetingSummaryFormat>,
      );
    }
  }

  /**
   * Format ticket template requirements
   */
  private static formatTicketTemplateRequirements(
    template: InstructionTemplateDefinition<TicketFormat>,
  ): string {
    return `Format Requirements:
${template.format.ticketType.length > 0 ? `- Valid types: ${template.format.ticketType.join(' | ')}` : ''}
- Required fields: ${template.format.requiredFields.join(', ')}
${template.format.emptyFields && template.format.emptyFields.length > 0 ? `- Empty fields: ${template.format.emptyFields.join(', ')}` : ''}
- Output format: ${template.format.outputFormat}

Rules:
${template.rules.map((rule) => `- ${rule}`).join('\n')}

${
  template.outputRequirements && template.outputRequirements.length > 0
    ? `Output Requirements:\n${template.outputRequirements.map((req) => `- ${req}`).join('\n')}`
    : ''
}`;
  }

  /**
   * Format meeting summary template requirements
   */
  private static formatMeetingSummaryTemplateRequirements(
    template: InstructionTemplateDefinition<MeetingSummaryFormat>,
  ): string {
    return `Format Requirements:
- Required sections: ${template.format.requiredSections.join(', ')}
- Output format: ${template.format.outputFormat}
- JSON Schema:
${Object.entries(template.format.jsonSchema.properties)
  .map(([key, value]) => `  ${key}: ${value.type} - ${value.description}`)
  .join('\n')}

Rules:
${template.rules.map((rule) => `- ${rule}`).join('\n')}

${
  template.outputRequirements && template.outputRequirements.length > 0
    ? `Output Requirements:\n${template.outputRequirements.map((req) => `- ${req}`).join('\n')}`
    : ''
}`;
  }
}
