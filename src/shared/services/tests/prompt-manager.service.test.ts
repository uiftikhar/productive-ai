import { PromptManager } from '../prompt-manager.service.ts';

describe('PromptManager', () => {
  describe('getSystemMessage', () => {
    it('should return correct system message for AGILE_COACH role', () => {
      const message = PromptManager.getSystemMessage('AGILE_COACH');
      expect(message.role).toBe('system');
      expect(message.content).toContain('Agile Coach');
    });

    it('should throw error for invalid role', () => {
      expect(() => {
        PromptManager.getSystemMessage('INVALID_ROLE' as any);
      }).toThrow('Invalid system role');
    });
  });

  describe('createPrompt', () => {
    it('should create valid prompt with user context', () => {
      const prompt = PromptManager.createPrompt(
        'AGILE_COACH',
        'TICKET_GENERATION',
        'Test content',
        'User prefers detailed tickets',
      );

      expect(prompt.messages).toHaveLength(2);
      expect(prompt.messages[0].role).toBe('system');
      expect(prompt.messages[1].role).toBe('user');
      expect(prompt.messages[1].content).toContain('User Context');
      expect(prompt.messages[1].content).toContain('Test content');
    });
  });
});
