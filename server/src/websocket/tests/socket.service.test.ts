/**
 * Socket.IO Service Tests
 *
 * Tests the WebSocket functionality for real-time chat
 */

import http from 'http';
import express from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { io as SocketIOClient } from 'socket.io-client';
import { AddressInfo } from 'net';
import { ChatService } from '../../chat/chat.service';
import { ChatMessage, ChatSession } from '../../chat/chat.types';
import { SocketService, SocketEvents } from '../socket.service';
import { v4 as uuidv4 } from 'uuid';

// Mock dependencies
const mockChatService = {
  getSession: jest.fn(),
  sendMessageStream: jest.fn(),
} as unknown as jest.Mocked<ChatService>;

describe('Socket.IO Service', () => {
  let httpServer: http.Server;
  let socketService: SocketService;
  let clientSocket: any;
  let port: number;
  let serverUrl: string;

  // Save original environment
  const originalEnv = process.env.TEST_MODE;

  beforeAll(() => {
    // Enable test mode to bypass authentication
    process.env.TEST_MODE = 'true';

    // Create HTTP server
    const app = express();
    httpServer = http.createServer(app);

    // Start server on random port
    httpServer.listen(0);
    port = (httpServer.address() as AddressInfo).port;
    serverUrl = `http://localhost:${port}`;

    // Initialize Socket.IO service
    socketService = new SocketService(httpServer, mockChatService);
  });

  afterAll((done) => {
    // Restore original environment
    process.env.TEST_MODE = originalEnv;

    // Clean up
    if (clientSocket) {
      clientSocket.disconnect();
    }

    socketService.shutdown();
    httpServer.close(done);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (clientSocket) {
      clientSocket.disconnect();
    }
  });

  it('should establish a connection with client', (done) => {
    clientSocket = SocketIOClient(serverUrl, {
      auth: {
        userId: 'test-user-123',
      },
    });

    clientSocket.on('connected', (data: any) => {
      expect(data.success).toBe(true);
      expect(data.userId).toBe('test-user-123');
      done();
    });
  });

  it('should allow client to join a session', (done) => {
    // Mock the session
    const mockSession: ChatSession = {
      sessionId: 'test-session-123',
      userId: 'test-user-123',
      conversationId: uuidv4(),
      createdAt: new Date(),
      lastActive: new Date(),
    };

    mockChatService.getSession.mockReturnValue(mockSession);

    // Connect client
    clientSocket = SocketIOClient(serverUrl, {
      auth: {
        userId: 'test-user-123',
      },
    });

    clientSocket.on('connected', () => {
      // Attempt to join session
      clientSocket.emit(SocketEvents.JOIN_SESSION, 'test-session-123');
    });

    clientSocket.on('session_joined', (data: any) => {
      expect(data.success).toBe(true);
      expect(data.sessionId).toBe('test-session-123');
      expect(mockChatService.getSession).toHaveBeenCalledWith(
        'test-session-123',
      );
      done();
    });
  });

  it('should send an error when joining a non-existent session', (done) => {
    // Mock a session not found error
    mockChatService.getSession.mockImplementation(() => {
      throw new Error('Session not found');
    });

    // Connect client
    clientSocket = SocketIOClient(serverUrl, {
      auth: {
        userId: 'test-user-123',
      },
    });

    clientSocket.on('connected', () => {
      // Attempt to join non-existent session
      clientSocket.emit(SocketEvents.JOIN_SESSION, 'non-existent-session');
    });

    clientSocket.on('error', (data: any) => {
      expect(data.type).toBe('session_join_failed');
      expect(data.message).toBe('Session not found');
      expect(mockChatService.getSession).toHaveBeenCalledWith(
        'non-existent-session',
      );
      done();
    });
  });

  it('should allow sending messages with streaming response', (done) => {
    // Mock the session
    const mockSession: ChatSession = {
      sessionId: 'test-session-123',
      userId: 'test-user-123',
      conversationId: uuidv4(),
      createdAt: new Date(),
      lastActive: new Date(),
    };

    const mockMessage: ChatMessage = {
      id: uuidv4(),
      sessionId: 'test-session-123',
      content: 'This is a test response',
      role: 'assistant',
      timestamp: new Date(),
    };

    mockChatService.getSession.mockReturnValue(mockSession);

    // Mock streaming behavior
    mockChatService.sendMessageStream.mockImplementation(
      (request, streamOptions) => {
        // Simulate message tokens being streamed
        setTimeout(() => streamOptions.onToken('This '), 50);
        setTimeout(() => streamOptions.onToken('is '), 100);
        setTimeout(() => streamOptions.onToken('a '), 150);
        setTimeout(() => streamOptions.onToken('test '), 200);
        setTimeout(() => streamOptions.onToken('response'), 250);

        // Simulate completion
        setTimeout(() => streamOptions.onComplete(mockMessage), 300);

        return Promise.resolve();
      },
    );

    // Connect client
    clientSocket = SocketIOClient(serverUrl, {
      auth: {
        userId: 'test-user-123',
      },
    });

    clientSocket.on('connected', () => {
      // Join session first
      clientSocket.emit(SocketEvents.JOIN_SESSION, 'test-session-123');
    });

    clientSocket.on('session_joined', () => {
      // Send a message
      clientSocket.emit(SocketEvents.NEW_MESSAGE, {
        sessionId: 'test-session-123',
        content: 'Hello, AI!',
      });
    });

    // Track received tokens
    const receivedTokens: string[] = [];

    clientSocket.on(SocketEvents.MESSAGE_TOKEN, (data: any) => {
      expect(data.sessionId).toBe('test-session-123');
      receivedTokens.push(data.token);
    });

    clientSocket.on(SocketEvents.MESSAGE_RECEIVED, (data: any) => {
      expect(data.sessionId).toBe('test-session-123');
    });

    clientSocket.on(SocketEvents.MESSAGE_RESPONSE, (data: any) => {
      expect(data.success).toBe(true);
      expect(data.sessionId).toBe('test-session-123');

      // Check properties individually instead of deep equality
      expect(data.message.id).toBe(mockMessage.id);
      expect(data.message.sessionId).toBe(mockMessage.sessionId);
      expect(data.message.content).toBe(mockMessage.content);
      expect(data.message.role).toBe(mockMessage.role);
      // Don't check timestamp directly as it may be serialized differently

      // Verify all tokens were received
      expect(receivedTokens.join('')).toBe('This is a test response');

      // Verify the sendMessageStream was called with correct parameters
      expect(mockChatService.sendMessageStream).toHaveBeenCalledWith(
        {
          sessionId: 'test-session-123',
          content: 'Hello, AI!',
          metadata: {},
        },
        expect.objectContaining({
          onToken: expect.any(Function),
          onComplete: expect.any(Function),
          onError: expect.any(Function),
        }),
      );

      done();
    });
  });

  it('should handle typing indicators', (done) => {
    // Connect two clients to test communication between them
    const client1 = SocketIOClient(serverUrl, {
      auth: { userId: 'user-1' },
    });

    const client2 = SocketIOClient(serverUrl, {
      auth: { userId: 'user-2' },
    });

    // Mock the session
    const mockSession: ChatSession = {
      sessionId: 'test-session-123',
      userId: 'user-1', // owned by user-1 but accessible by user-2 for this test
      conversationId: uuidv4(),
      createdAt: new Date(),
      lastActive: new Date(),
    };

    mockChatService.getSession.mockReturnValue(mockSession);

    // Setup test sequence
    let client1Connected = false;
    let client2Connected = false;
    let client1Joined = false;
    let client2Joined = false;

    function checkAllReady() {
      if (
        client1Connected &&
        client2Connected &&
        client1Joined &&
        client2Joined
      ) {
        // Both clients are connected and joined the session, now test typing indicators
        client1.emit(SocketEvents.TYPING_START, 'test-session-123');
      }
    }

    // Set up client 1
    client1.on('connected', () => {
      client1Connected = true;
      client1.emit(SocketEvents.JOIN_SESSION, 'test-session-123');
    });

    client1.on('session_joined', () => {
      client1Joined = true;
      checkAllReady();
    });

    // Set up client 2
    client2.on('connected', () => {
      client2Connected = true;
      client2.emit(SocketEvents.JOIN_SESSION, 'test-session-123');
    });

    client2.on('session_joined', () => {
      client2Joined = true;
      checkAllReady();
    });

    // Client 2 listens for typing indicators from client 1
    client2.on(SocketEvents.TYPING_START, (data: any) => {
      expect(data.userId).toBe('user-1');
      expect(data.sessionId).toBe('test-session-123');

      // Clean up
      client1.disconnect();
      client2.disconnect();
      clientSocket = null; // Prevent double disconnection in afterEach

      done();
    });
  });

  it('should handle read receipts', (done) => {
    // Connect two clients
    const client1 = SocketIOClient(serverUrl, {
      auth: { userId: 'user-1' },
    });

    const client2 = SocketIOClient(serverUrl, {
      auth: { userId: 'user-2' },
    });

    // Mock the session
    const mockSession: ChatSession = {
      sessionId: 'test-session-123',
      userId: 'user-1',
      conversationId: uuidv4(),
      createdAt: new Date(),
      lastActive: new Date(),
    };

    mockChatService.getSession.mockReturnValue(mockSession);

    // Setup test sequence
    let client1Connected = false;
    let client2Connected = false;
    let client1Joined = false;
    let client2Joined = false;

    function checkAllReady() {
      if (
        client1Connected &&
        client2Connected &&
        client1Joined &&
        client2Joined
      ) {
        // Both clients are connected and joined the session, now test read receipts
        client1.emit(SocketEvents.READ_RECEIPT, {
          sessionId: 'test-session-123',
          messageId: 'test-message-123',
        });
      }
    }

    // Set up client 1
    client1.on('connected', () => {
      client1Connected = true;
      client1.emit(SocketEvents.JOIN_SESSION, 'test-session-123');
    });

    client1.on('session_joined', () => {
      client1Joined = true;
      checkAllReady();
    });

    // Set up client 2
    client2.on('connected', () => {
      client2Connected = true;
      client2.emit(SocketEvents.JOIN_SESSION, 'test-session-123');
    });

    client2.on('session_joined', () => {
      client2Joined = true;
      checkAllReady();
    });

    // Client 2 listens for read receipts from client 1
    client2.on(SocketEvents.READ_RECEIPT, (data: any) => {
      expect(data.userId).toBe('user-1');
      expect(data.sessionId).toBe('test-session-123');
      expect(data.messageId).toBe('test-message-123');
      expect(data.timestamp).toBeDefined();

      // Clean up
      client1.disconnect();
      client2.disconnect();
      clientSocket = null; // Prevent double disconnection in afterEach

      done();
    });
  });
});
