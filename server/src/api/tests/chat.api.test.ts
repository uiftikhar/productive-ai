/**
 * Chat API Integration Tests
 */

import request from 'supertest';
import express, { Express } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ChatService } from '../../chat/chat.service';
import { ChatController } from '../controllers/chat.controller';
import { createChatRouter } from '../routes/chat.routes';
import { ChatMessage, MessageGenerationResult } from '../../chat/chat.types';
import { ChatServiceError, ChatErrorType } from '../../chat/chat.types';

// Create mocks
const mockChatService = {
  createSession: jest.fn(),
  getSession: jest.fn(),
  deleteSession: jest.fn(),
  getUserSessions: jest.fn(),
  sendMessage: jest.fn(),
  getSessionHistory: jest.fn(),
} as unknown as jest.Mocked<ChatService>;

// Create test app
function setupTestApp(): Express {
  const app = express();
  app.use(express.json());
  
  const chatController = new ChatController(mockChatService);
  const chatRouter = createChatRouter(chatController);
  
  app.use('/api/chat', chatRouter);
  
  return app;
}

describe('Chat API Integration Tests', () => {
  let app: Express;
  // Save original environment
  const originalEnv = process.env.TEST_MODE;
  
  beforeAll(() => {
    // Enable test mode to bypass authentication
    process.env.TEST_MODE = 'true';
  });
  
  afterAll(() => {
    // Restore original environment
    process.env.TEST_MODE = originalEnv;
  });
  
  beforeEach(() => {
    app = setupTestApp();
    jest.clearAllMocks();
  });
  
  describe('POST /api/chat/sessions', () => {
    it('should create a new session', async () => {
      // Setup mock
      const mockSession = {
        sessionId: uuidv4(),
        userId: 'test-user-123',
        conversationId: uuidv4(),
        createdAt: new Date(),
        lastActive: new Date(),
        metadata: { source: 'web' }
      };
      
      mockChatService.createSession.mockResolvedValue(mockSession);
      
      // Test request
      const response = await request(app)
        .post('/api/chat/sessions')
        .send({
          userId: 'test-user-123',
          metadata: { source: 'web' }
        });
      
      // Assertions
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      
      // Check properties individually to handle Date serialization
      expect(response.body.session.sessionId).toBe(mockSession.sessionId);
      expect(response.body.session.userId).toBe(mockSession.userId);
      expect(response.body.session.conversationId).toBe(mockSession.conversationId);
      expect(response.body.session.metadata).toEqual(mockSession.metadata);
      
      expect(mockChatService.createSession).toHaveBeenCalledWith({
        userId: 'test-user-123',
        metadata: { source: 'web' }
      });
    });
    
    it('should return 400 when userId is missing', async () => {
      const response = await request(app)
        .post('/api/chat/sessions')
        .send({
          metadata: { source: 'web' }
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('INVALID_REQUEST');
      expect(mockChatService.createSession).not.toHaveBeenCalled();
    });
  });
  
  describe('GET /api/chat/sessions/:sessionId', () => {
    it('should get a session by ID', async () => {
      // Setup mock
      const mockSession = {
        sessionId: 'test-session-123',
        userId: 'test-user-123',
        conversationId: uuidv4(),
        createdAt: new Date(),
        lastActive: new Date()
      };
      
      mockChatService.getSession.mockReturnValue(mockSession);
      
      // Test request
      const response = await request(app)
        .get('/api/chat/sessions/test-session-123');
      
      // Assertions
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Check properties individually to handle Date serialization
      expect(response.body.session.sessionId).toBe(mockSession.sessionId);
      expect(response.body.session.userId).toBe(mockSession.userId);
      expect(response.body.session.conversationId).toBe(mockSession.conversationId);
      
      expect(mockChatService.getSession).toHaveBeenCalledWith('test-session-123');
    });
    
    it('should return 404 when session is not found', async () => {
      // Setup mock to throw error
      mockChatService.getSession.mockImplementation(() => {
        throw new ChatServiceError(
          'Session not found',
          ChatErrorType.SESSION_NOT_FOUND
        );
      });
      
      // Test request
      const response = await request(app)
        .get('/api/chat/sessions/non-existent-session');
      
      // Assertions
      expect(response.status).toBe(404);
      expect(mockChatService.getSession).toHaveBeenCalledWith('non-existent-session');
    });
  });
  
  describe('DELETE /api/chat/sessions/:sessionId', () => {
    it('should delete a session', async () => {
      // Setup mock
      mockChatService.deleteSession.mockResolvedValue(true);
      
      // Test request
      const response = await request(app)
        .delete('/api/chat/sessions/test-session-123');
      
      // Assertions
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Session deleted successfully');
      expect(mockChatService.deleteSession).toHaveBeenCalledWith('test-session-123');
    });
  });
  
  describe('POST /api/chat/messages', () => {
    it('should send a message and get a response', async () => {
      // Setup mock with correct types
      const mockResult: MessageGenerationResult = {
        message: {
          id: uuidv4(),
          sessionId: 'test-session-123',
          content: 'I am an AI assistant. How can I help you?',
          role: 'assistant',
          timestamp: new Date()
        },
        agentsInvolved: ['test-agent'],
        primaryAgent: 'test-agent',
        executionTimeMs: 500,
        tokenCount: 150,
        segmentInfo: {
          isNewSegment: false
        }
      };
      
      mockChatService.sendMessage.mockResolvedValue(mockResult);
      
      // Test request
      const response = await request(app)
        .post('/api/chat/messages')
        .send({
          sessionId: 'test-session-123',
          content: 'Hello, AI!',
          metadata: { source: 'web' }
        });
      
      // Assertions
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Check properties individually to handle Date serialization
      expect(response.body.result.message.id).toBe(mockResult.message.id);
      expect(response.body.result.message.content).toBe(mockResult.message.content);
      expect(response.body.result.message.role).toBe(mockResult.message.role);
      expect(response.body.result.message.sessionId).toBe(mockResult.message.sessionId);
      expect(response.body.result.agentsInvolved).toEqual(mockResult.agentsInvolved);
      expect(response.body.result.primaryAgent).toBe(mockResult.primaryAgent);
      expect(response.body.result.executionTimeMs).toBe(mockResult.executionTimeMs);
      expect(response.body.result.tokenCount).toBe(mockResult.tokenCount);
      expect(response.body.result.segmentInfo).toEqual(mockResult.segmentInfo);
      
      expect(mockChatService.sendMessage).toHaveBeenCalledWith({
        sessionId: 'test-session-123',
        content: 'Hello, AI!',
        metadata: { source: 'web' }
      });
    });
    
    it('should return 400 when required fields are missing', async () => {
      // Test without content
      const response = await request(app)
        .post('/api/chat/messages')
        .send({
          sessionId: 'test-session-123'
        });
      
      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('INVALID_REQUEST');
      expect(mockChatService.sendMessage).not.toHaveBeenCalled();
    });
  });
  
  describe('GET /api/chat/sessions/:sessionId/history', () => {
    it('should get session history', async () => {
      // Setup mock with correct types
      const mockHistory: ChatMessage[] = [
        {
          id: 'msg-1',
          sessionId: 'test-session-123',
          content: 'Hello, AI!',
          role: 'user',
          timestamp: new Date()
        },
        {
          id: 'msg-2',
          sessionId: 'test-session-123',
          content: 'I am an AI assistant. How can I help you?',
          role: 'assistant',
          timestamp: new Date()
        }
      ];
      
      mockChatService.getSessionHistory.mockResolvedValue(mockHistory);
      
      // Test request
      const response = await request(app)
        .get('/api/chat/sessions/test-session-123/history')
        .query({ limit: '10', includeMetadata: 'true' });
      
      // Assertions
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Check array length and key properties
      expect(response.body.history.length).toBe(2);
      expect(response.body.history[0].id).toBe(mockHistory[0].id);
      expect(response.body.history[0].role).toBe(mockHistory[0].role);
      expect(response.body.history[0].content).toBe(mockHistory[0].content);
      expect(response.body.history[1].id).toBe(mockHistory[1].id);
      expect(response.body.history[1].role).toBe(mockHistory[1].role);
      expect(response.body.history[1].content).toBe(mockHistory[1].content);
      
      expect(mockChatService.getSessionHistory).toHaveBeenCalledWith(
        'test-session-123',
        expect.objectContaining({
          limit: 10,
          includeMetadata: true
        })
      );
    });
    
    it('should handle invalid query parameters', async () => {
      // Test with invalid limit
      const response = await request(app)
        .get('/api/chat/sessions/test-session-123/history')
        .query({ limit: 'not-a-number' });
      
      expect(response.status).toBe(400);
      expect(response.body.error.type).toBe('INVALID_REQUEST');
      expect(mockChatService.getSessionHistory).not.toHaveBeenCalled();
    });
  });
  
  describe('GET /api/chat/users/:userId/sessions', () => {
    it('should get sessions for a user', async () => {
      // Setup mock
      const mockSessions = [
        {
          sessionId: 'session-1',
          userId: 'test-user-123',
          conversationId: uuidv4(),
          createdAt: new Date(),
          lastActive: new Date()
        },
        {
          sessionId: 'session-2',
          userId: 'test-user-123',
          conversationId: uuidv4(),
          createdAt: new Date(),
          lastActive: new Date()
        }
      ];
      
      mockChatService.getUserSessions.mockResolvedValue(mockSessions);
      
      // Test request
      const response = await request(app)
        .get('/api/chat/users/test-user-123/sessions');
      
      // Assertions
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      
      // Check array length and key properties
      expect(response.body.sessions.length).toBe(2);
      expect(response.body.sessions[0].sessionId).toBe(mockSessions[0].sessionId);
      expect(response.body.sessions[0].userId).toBe(mockSessions[0].userId);
      expect(response.body.sessions[0].conversationId).toBe(mockSessions[0].conversationId);
      expect(response.body.sessions[1].sessionId).toBe(mockSessions[1].sessionId);
      expect(response.body.sessions[1].userId).toBe(mockSessions[1].userId);
      expect(response.body.sessions[1].conversationId).toBe(mockSessions[1].conversationId);
      
      expect(mockChatService.getUserSessions).toHaveBeenCalledWith('test-user-123');
    });
  });
}); 