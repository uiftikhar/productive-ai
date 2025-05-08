import { ChatApiAdapter } from '../chat-api-adapter';
import { ChatAgentInterface, ChatResponse, ChatSession } from '../../core/chat/chat-agent-interface';

// Mock chat agent
class MockChatAgent implements Partial<ChatAgentInterface> {
  async handleUserMessage(session: ChatSession, message: any): Promise<ChatResponse> {
    return {
      id: 'mock-response',
      content: `Response to: ${message.content}`,
      type: 'text',
      timestamp: Date.now()
    };
  }
  
  async uploadTranscript(session: ChatSession, transcript: string, meetingId?: string): Promise<ChatResponse> {
    // Set the meeting ID in the session
    session.currentMeetingId = meetingId || `meeting-${Date.now()}`;
    
    return {
      id: 'mock-transcript-response',
      content: 'Transcript processed successfully',
      type: 'analysis',
      timestamp: Date.now()
    };
  }
}

// Mock auth service
class MockAuthService {
  validateToken(token: string, userId: string): Promise<void> {
    if (token === 'valid-token') {
      return Promise.resolve();
    } else {
      return Promise.reject(new Error('Invalid token'));
    }
  }
}

describe('ChatApiAdapter', () => {
  let chatApiAdapter: ChatApiAdapter;
  let mockChatAgent: MockChatAgent;
  let mockAuthService: MockAuthService;
  
  beforeEach(() => {
    mockChatAgent = new MockChatAgent();
    mockAuthService = new MockAuthService();
    
    chatApiAdapter = new ChatApiAdapter({
      chatAgent: mockChatAgent as ChatAgentInterface,
      authService: mockAuthService,
      sessionTimeoutMs: 3600000 // 1 hour
    });
  });
  
  describe('processMessage', () => {
    it('should process a message and return a response', async () => {
      const result = await chatApiAdapter.processMessage({
        userId: 'user123',
        message: 'Hello, world!',
        authToken: 'valid-token'
      });
      
      expect(result.sessionId).toBeDefined();
      expect(result.response.content).toBe('Response to: Hello, world!');
      expect(result.response.type).toBe('text');
    });
    
    it('should use an existing session if provided', async () => {
      // Create a session first
      const initialResult = await chatApiAdapter.processMessage({
        userId: 'user123',
        message: 'First message',
        authToken: 'valid-token'
      });
      
      // Use the same session for a second message
      const result = await chatApiAdapter.processMessage({
        sessionId: initialResult.sessionId,
        userId: 'user123',
        message: 'Second message',
        authToken: 'valid-token'
      });
      
      expect(result.sessionId).toBe(initialResult.sessionId);
      expect(result.response.content).toBe('Response to: Second message');
    });
    
    it('should return an error response if authentication fails', async () => {
      const result = await chatApiAdapter.processMessage({
        userId: 'user123',
        message: 'Hello, world!',
        authToken: 'invalid-token'
      });
      
      expect(result.response.type).toBe('error');
      expect(result.response.error?.code).toBe('processing_error');
      expect(result.response.content).toContain('Authentication failed');
    });
    
    it('should return an error response if message processing fails', async () => {
      // Mock the handleUserMessage method to throw an error
      jest.spyOn(mockChatAgent, 'handleUserMessage').mockImplementation(() => {
        throw new Error('Processing error');
      });
      
      const result = await chatApiAdapter.processMessage({
        userId: 'user123',
        message: 'Hello, world!',
        authToken: 'valid-token'
      });
      
      expect(result.response.type).toBe('error');
      expect(result.response.error?.code).toBe('processing_error');
      expect(result.response.content).toContain('Processing error');
    });
  });
  
  describe('uploadTranscript', () => {
    it('should upload a transcript and return a response', async () => {
      const result = await chatApiAdapter.uploadTranscript({
        userId: 'user123',
        transcript: 'This is a test transcript',
        meetingId: 'test-meeting',
        authToken: 'valid-token'
      });
      
      expect(result.sessionId).toBeDefined();
      expect(result.response.content).toBe('Transcript processed successfully');
      expect(result.response.type).toBe('analysis');
    });
    
    it('should return an error response if authentication fails', async () => {
      const result = await chatApiAdapter.uploadTranscript({
        userId: 'user123',
        transcript: 'This is a test transcript',
        authToken: 'invalid-token'
      });
      
      expect(result.response.type).toBe('error');
      expect(result.response.error?.code).toBe('transcript_processing_error');
      expect(result.response.content).toContain('Authentication failed');
    });
  });
  
  describe('session management', () => {
    it('should create a new session when none exists', async () => {
      const result = await chatApiAdapter.processMessage({
        userId: 'user123',
        message: 'Hello',
        authToken: 'valid-token'
      });
      
      expect(result.sessionId).toBeDefined();
      expect(result.sessionId).toContain('session-');
    });
    
    it('should retrieve an existing session', async () => {
      // Create a session
      const createResult = await chatApiAdapter.processMessage({
        userId: 'user123',
        message: 'Create session',
        authToken: 'valid-token'
      });
      
      // Get the session
      const session = await chatApiAdapter.getSession(
        createResult.sessionId,
        'user123',
        'valid-token'
      );
      
      expect(session.id).toBe(createResult.sessionId);
      expect(session.userId).toBe('user123');
    });
    
    it('should throw an error when retrieving a non-existent session', async () => {
      await expect(
        chatApiAdapter.getSession('non-existent-session', 'user123', 'valid-token')
      ).rejects.toThrow('Session not found');
    });
    
    it('should throw an error when retrieving a session with incorrect user', async () => {
      // Create a session for user123
      const createResult = await chatApiAdapter.processMessage({
        userId: 'user123',
        message: 'Create session',
        authToken: 'valid-token'
      });
      
      // Try to get the session as user456
      await expect(
        chatApiAdapter.getSession(createResult.sessionId, 'user456', 'valid-token')
      ).rejects.toThrow('Unauthorized access to session');
    });
    
    it('should list sessions for a user', async () => {
      // Create two sessions for the same user
      await chatApiAdapter.processMessage({
        userId: 'user123',
        message: 'First session',
        authToken: 'valid-token'
      });
      
      await chatApiAdapter.processMessage({
        userId: 'user123',
        message: 'Second session',
        authToken: 'valid-token'
      });
      
      // List sessions
      const sessions = await chatApiAdapter.listSessions('user123', 'valid-token');
      
      expect(sessions.length).toBe(2);
      expect(sessions[0].userId).toBe('user123');
      expect(sessions[1].userId).toBe('user123');
    });
    
    it('should delete a session', async () => {
      // Create a session
      const createResult = await chatApiAdapter.processMessage({
        userId: 'user123',
        message: 'Create session',
        authToken: 'valid-token'
      });
      
      // Delete the session
      await chatApiAdapter.deleteSession(
        createResult.sessionId,
        'user123',
        'valid-token'
      );
      
      // Try to get the deleted session
      await expect(
        chatApiAdapter.getSession(createResult.sessionId, 'user123', 'valid-token')
      ).rejects.toThrow('Session not found');
    });
    
    it('should reject deleting a session with incorrect user', async () => {
      // Create a session for user123
      const createResult = await chatApiAdapter.processMessage({
        userId: 'user123',
        message: 'Create session',
        authToken: 'valid-token'
      });
      
      // Try to delete the session as user456
      await expect(
        chatApiAdapter.deleteSession(createResult.sessionId, 'user456', 'valid-token')
      ).rejects.toThrow('Unauthorized access to session');
    });
    
    it('should create a new session if the existing one is expired', async () => {
      // Create a custom adapter with a very short timeout
      const shortTimeoutAdapter = new ChatApiAdapter({
        chatAgent: mockChatAgent as ChatAgentInterface,
        sessionTimeoutMs: 10 // 10 ms timeout
      });
      
      // Create an initial session
      const initialResult = await shortTimeoutAdapter.processMessage({
        userId: 'user123',
        message: 'Initial message'
      });
      
      // Wait for the session to expire
      await new Promise(resolve => setTimeout(resolve, 20));
      
      // Send another message with the same session ID
      const result = await shortTimeoutAdapter.processMessage({
        sessionId: initialResult.sessionId,
        userId: 'user123',
        message: 'After timeout'
      });
      
      // Should have created a new session
      expect(result.sessionId).not.toBe(initialResult.sessionId);
    });
  });
}); 