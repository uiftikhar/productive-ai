/**
 * Chat API Controller
 * 
 * Handles REST API endpoints for chat functionality
 */

import { Request, Response, NextFunction } from 'express';
import { ChatService } from '../../chat/chat.service';
import { ChatServiceError, ChatErrorType } from '../../chat/chat.types';

export class ChatController {
  private chatService: ChatService;

  constructor(chatService: ChatService) {
    this.chatService = chatService;
  }

  /**
   * Create a new chat session
   */
  async createSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { userId, conversationId, agentId, metadata } = req.body;

      // Validate required fields
      if (!userId) {
        throw new ChatServiceError(
          'Missing required field: userId',
          ChatErrorType.INVALID_REQUEST
        );
      }

      const session = await this.chatService.createSession({
        userId,
        conversationId,
        agentId,
        metadata
      });

      res.status(201).json({
        success: true,
        session
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get an existing session by ID
   */
  async getSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionId = req.params.sessionId;

      if (!sessionId) {
        throw new ChatServiceError(
          'Session ID is required',
          ChatErrorType.INVALID_REQUEST
        );
      }

      const session = this.chatService.getSession(sessionId);

      res.json({
        success: true,
        session
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionId = req.params.sessionId;

      if (!sessionId) {
        throw new ChatServiceError(
          'Session ID is required',
          ChatErrorType.INVALID_REQUEST
        );
      }

      const result = await this.chatService.deleteSession(sessionId);

      res.json({
        success: result,
        message: result ? 'Session deleted successfully' : 'Failed to delete session'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get sessions for a user
   */
  async getUserSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.params.userId;

      if (!userId) {
        throw new ChatServiceError(
          'User ID is required',
          ChatErrorType.INVALID_REQUEST
        );
      }

      const sessions = await this.chatService.getUserSessions(userId);

      res.json({
        success: true,
        sessions
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send a message and get a response
   */
  async sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { sessionId, content, metadata } = req.body;

      if (!sessionId || !content) {
        throw new ChatServiceError(
          'Session ID and content are required',
          ChatErrorType.INVALID_REQUEST
        );
      }

      const result = await this.chatService.sendMessage({
        sessionId,
        content,
        metadata
      });

      res.json({
        success: true,
        result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send a message and stream the response using Server-Sent Events
   */
  async sendMessageStream(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Support both POST body and GET query parameters for EventSource compatibility
      const sessionId = req.body.sessionId || req.query.sessionId as string;
      const content = req.body.content || req.query.content as string;
      const metadata = req.body.metadata || {};

      if (!sessionId || !content) {
        throw new ChatServiceError(
          'Session ID and content are required',
          ChatErrorType.INVALID_REQUEST
        );
      }

      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders(); // flush the headers to establish SSE with client

      // Handle client disconnect
      const heartbeatInterval = setInterval(() => {
        res.write(': heartbeat\n\n');
      }, 30000);

      // Clean up on close
      req.on('close', () => {
        clearInterval(heartbeatInterval);
        res.end();
      });

      // Set up streaming options
      const streamOptions = {
        onToken: (token: string) => {
          res.write(`data: ${JSON.stringify({ type: 'token', content: token })}\n\n`);
        },
        onComplete: (message: any) => {
          res.write(`data: ${JSON.stringify({ type: 'complete', message })}\n\n`);
          res.end();
          clearInterval(heartbeatInterval);
        },
        onError: (error: any) => {
          res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
          res.end();
          clearInterval(heartbeatInterval);
        }
      };

      // Start streaming
      await this.chatService.sendMessageStream({
        sessionId,
        content,
        metadata
      }, streamOptions);
    } catch (error) {
      // If we encounter an error before streaming begins
      if (!res.headersSent) {
        next(error);
      } else {
        // If headers are already sent, we need to end the stream with an error
        res.write(`data: ${JSON.stringify({ 
          type: 'error', 
          error: error instanceof Error ? error.message : String(error) 
        })}\n\n`);
        res.end();
      }
    }
  }

  /**
   * Get chat history for a session
   */
  async getSessionHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionId = req.params.sessionId;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
      const includeMetadata = req.query.includeMetadata === 'true';

      // Parse date parameters if provided
      let beforeTimestamp: Date | undefined;
      let afterTimestamp: Date | undefined;
      
      if (req.query.beforeTimestamp) {
        beforeTimestamp = new Date(req.query.beforeTimestamp as string);
      }
      
      if (req.query.afterTimestamp) {
        afterTimestamp = new Date(req.query.afterTimestamp as string);
      }

      if (!sessionId) {
        throw new ChatServiceError(
          'Session ID is required',
          ChatErrorType.INVALID_REQUEST
        );
      }

      const history = await this.chatService.getSessionHistory(sessionId, {
        limit,
        beforeTimestamp,
        afterTimestamp,
        includeMetadata
      });

      res.json({
        success: true,
        history
      });
    } catch (error) {
      next(error);
    }
  }
} 