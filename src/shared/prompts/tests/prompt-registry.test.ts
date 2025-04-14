import {
  InstructionTemplateEnum,
  PromptRegistry,
  SystemRoleEnum,
} from '../prompt-registry.ts';
import { PromptLibrary } from '../prompt-library.ts';

describe('PromptRegistry', () => {
  beforeAll(() => {
    // Ensure registry is initialized
    PromptRegistry.initialize();
  });

  beforeEach(() => {
    // Register test components in PromptLibrary
    PromptLibrary.registerComponent(
      'system.test',
      'You are a test assistant specialized in testing.',
      '1.0',
      {
        description: 'Test system component',
        tags: ['test', 'system'],
      },
    );

    PromptLibrary.registerComponent(
      'instruction.test',
      'Process the following content according to these rules:\n- Be concise\n- Be accurate\n- Include examples\n\nContent: {{QUERY}}',
      '1.0',
      {
        description: 'Test instruction component',
        tags: ['test', 'instruction'],
      },
    );

    // Register test templates in PromptRegistry
    PromptRegistry.registerPromptTemplate({
      id: 'test-template',
      version: '1.0',
      description: 'Template for testing',
      components: ['system.test', 'instruction.test'],
      metadata: {
        author: 'test',
        createdAt: Date.now(),
        tags: ['test'],
        modelCompatibility: ['gpt-4'],
      },
    });

    PromptRegistry.registerPromptTemplate({
      id: 'replacement-template',
      version: '1.0',
      description: 'Template with replacements',
      components: ['system.test', 'instruction.test'],
      defaultReplacements: {
        ROLE: 'tester',
      },
      metadata: {
        author: 'test',
        createdAt: Date.now(),
        tags: ['test'],
        modelCompatibility: ['gpt-4'],
      },
    });
  });

  describe('getSystemPrompt', () => {
    it('should return the correct system prompt for a valid role', () => {
      const prompt = PromptRegistry.getSystemPrompt(
        SystemRoleEnum.MEETING_ANALYST,
      );
      expect(prompt.role).toBe('system');
      expect(prompt.content).toBeTruthy();
      expect(prompt.content.length).toBeGreaterThan(0);
    });

    it('should throw an error for an invalid role', () => {
      expect(() => {
        // @ts-ignore Testing invalid input
        PromptRegistry.getSystemPrompt('INVALID_ROLE');
      }).toThrow();
    });
  });

  describe('getInstructionTemplate', () => {
    it('should return the correct instruction template for a valid template name', () => {
      const template = PromptRegistry.getInstructionTemplate(
        InstructionTemplateEnum.TICKET_GENERATION,
      );
      expect(template).toBeTruthy();
      expect(template.format).toBeTruthy();
      expect(template.rules).toBeInstanceOf(Array);
      expect(template.rules.length).toBeGreaterThan(0);
    });

    it('should return undefined for an invalid template name', () => {
      // @ts-ignore Testing invalid input
      const template =
        PromptRegistry.getInstructionTemplate('INVALID_TEMPLATE');
      expect(template).toBeUndefined();
    });
  });

  describe('createPrompt', () => {
    it('should create a valid prompt with system and user messages', () => {
      const result = PromptRegistry.createPrompt(
        SystemRoleEnum.MEETING_ANALYST,
        InstructionTemplateEnum.MEETING_ANALYSIS_CHUNK,
        'This is a test meeting transcript.',
      );

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[1].role).toBe('user');
      expect(result.messages[1].content).toContain('Format Requirements:');
      expect(result.messages[1].content).toContain('Content to Process:');
      expect(result.messages[1].content).toContain(
        'This is a test meeting transcript.',
      );
    });

    it('should include user context when provided', () => {
      const result = PromptRegistry.createPrompt(
        SystemRoleEnum.AGILE_COACH,
        InstructionTemplateEnum.TICKET_GENERATION,
        'Feature request: Add dark mode',
        'User is a developer with high priority tasks.',
      );

      expect(result.messages).toHaveLength(2);
      expect(result.messages[1].content).toContain('User Context:');
      expect(result.messages[1].content).toContain(
        'User is a developer with high priority tasks.',
      );
      expect(result.messages[1].content).toContain(
        'Feature request: Add dark mode',
      );
    });

    it('should throw an error for invalid template name', () => {
      expect(() => {
        // @ts-ignore Testing invalid input
        PromptRegistry.createPrompt(
          SystemRoleEnum.MEETING_ANALYST,
          'INVALID_TEMPLATE',
          'test',
        );
      }).toThrow('Invalid template name: INVALID_TEMPLATE');
    });
  });

  describe('createPromptFromTemplate', () => {
    it('should create a prompt from a template with registered components', () => {
      const result = PromptRegistry.createPromptFromTemplate(
        'test-template',
        'This is a test query',
      );

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].role).toBe('system');
      expect(result.messages[0].content).toContain(
        'test assistant specialized in testing',
      );
      expect(result.messages[1].role).toBe('user');
      expect(result.messages[1].content).toBe('This is a test query');
    });

    it('should create a prompt with default replacements', () => {
      const result = PromptRegistry.createPromptFromTemplate(
        'replacement-template',
        'Test query',
      );

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toContain(
        'test assistant specialized in testing',
      );
      expect(result.messages[0].content).toContain(
        'Process the following content according to these rules',
      );
      expect(result.messages[1].content).toBe('Test query');
    });

    it('should override default replacements with provided ones', () => {
      const result = PromptRegistry.createPromptFromTemplate(
        'replacement-template',
        'Test query',
        { ROLE: 'custom-tester' },
      );

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0].content).toContain(
        'test assistant specialized in testing',
      );
      expect(result.messages[1].content).toBe('Test query');
    });

    it('should throw error for non-existent template', () => {
      expect(() => {
        PromptRegistry.createPromptFromTemplate('non-existent', 'test');
      }).toThrow("Template 'non-existent' not found");
    });
  });

  describe('formatTemplateRequirements', () => {
    it('should format ticket template requirements correctly', () => {
      const template = PromptRegistry.getInstructionTemplate(
        InstructionTemplateEnum.TICKET_GENERATION,
      );
      // @ts-ignore Accessing private method for testing
      const formatted = PromptRegistry.formatTemplateRequirements(template);

      expect(formatted).toContain('Format Requirements:');
      expect(formatted).toContain('Valid types:');
      expect(formatted).toContain('Required fields:');
      expect(formatted).toContain('Rules:');
    });

    it('should format meeting summary template requirements correctly', () => {
      const template = PromptRegistry.getInstructionTemplate(
        InstructionTemplateEnum.MEETING_CHUNK_SUMMARY,
      );
      // @ts-ignore Accessing private method for testing
      const formatted = PromptRegistry.formatTemplateRequirements(template);

      expect(formatted).toContain('Format Requirements:');
      expect(formatted).toContain('Required sections:');
      expect(formatted).toContain('JSON Schema:');
      expect(formatted).toContain('Rules:');
    });
  });
});
