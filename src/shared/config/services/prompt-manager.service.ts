import {
  InstructionTemplateName,
  InstructionTemplates,
} from '../prompts/instruction-templates.ts';
import type {
  InstructionTemplate,
  MeetingSummaryFormat,
  SystemMessage,
  SystemRole,
  TicketFormat,
} from '../prompts/prompt-types.ts';
import { SystemPrompts } from '../prompts/system-prompts.ts';

export class PromptManager {
  static getSystemMessage(role: SystemRole): SystemMessage {
    const message = SystemPrompts[role];
    if (!message) {
      throw new Error(`Invalid system role: ${role}`);
    }
    return message;
  }

  static createPrompt(
    role: SystemRole,
    templateName: InstructionTemplateName,
    content: string,
    userContext?: string,
  ): { messages: Array<{ role: string; content: string }> } {
    const template = InstructionTemplates[templateName];
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
        this.getSystemMessage(role),
        { role: 'user', content: userPrompt },
      ],
    };
  }

  private static formatTemplateRequirements(
    template: InstructionTemplate,
  ): string {
    // Check if it's a ticket-type template or meeting-summary-type template
    if ('ticketType' in template.format) {
      return this.formatTicketTemplateRequirements(
        template as InstructionTemplate<TicketFormat>,
      );
    } else {
      return this.formatMeetingSummaryTemplateRequirements(
        template as InstructionTemplate<MeetingSummaryFormat>,
      );
    }
  }

  private static formatTicketTemplateRequirements(
    template: InstructionTemplate<TicketFormat>,
  ): string {
    return `Format Requirements:
${template.format.ticketType.length > 0 ? `- Valid types: ${template.format.ticketType.join(' | ')}` : ''}
- Required fields: ${template.format.requiredFields.join(', ')}
${template.format.emptyFields.length > 0 ? `- Empty fields: ${template.format.emptyFields.join(', ')}` : ''}
- Output format: ${template.format.outputFormat}

Rules:
${template.rules.map((rule) => `- ${rule}`).join('\n')}

${
  template.outputRequirements && template.outputRequirements.length > 0
    ? `Output Requirements:\n${template.outputRequirements.map((req) => `- ${req}`).join('\n')}`
    : ''
}`;
  }

  private static formatMeetingSummaryTemplateRequirements(
    template: InstructionTemplate<MeetingSummaryFormat>,
  ): string {
    return `Format Requirements:
- Required sections: ${template.format.requiredSections.join(', ')}
- Output format: ${template.format.outputFormat}
- JSON Schema:
${Object.entries(template.format.jsonSchema.properties)
  .map(
    ([key, value]: [string, any]) =>
      `  ${key}: ${value.type} - ${value.description}`,
  )
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
