import { InstructionTemplates } from '../prompts/instruction-templates.ts';
import type {
  InstructionTemplate,
  SystemMessage,
  SystemRole,
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
    templateName: string,
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
    return `Format Requirements:
${template.format.ticketType.length > 0 ? `- Valid types: ${template.format.ticketType.join(' | ')}` : ''}
- Required fields: ${template.format.requiredFields.join(', ')}
${template.format.emptyFields.length > 0 ? `- Empty fields: ${template.format.emptyFields.join(', ')}` : ''}
- Output format: ${template.format.outputFormat}

Rules:
${template.rules.map((rule) => `- ${rule}`).join('\n')}

${
  template.outputRequirements && template.outputRequirements.length > 0
    ? `Output Requirements: ${template.outputRequirements.join('\n')}`
    : ''
}
`;
  }
}
