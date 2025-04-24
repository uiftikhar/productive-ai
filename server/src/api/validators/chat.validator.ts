/**
 * Chat API Validation Middleware
 *
 * Validates and sanitizes input data for chat API endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { ChatServiceError, ChatErrorType } from '../../chat/chat.types';

export class ChatValidator {
  /**
   * Validate session creation requests
   */
  static validateCreateSession(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    try {
      const { userId, conversationId, agentId, metadata } = req.body;

      // Required field check
      if (!userId || typeof userId !== 'string') {
        throw new ChatServiceError(
          'userId is required and must be a string',
          ChatErrorType.INVALID_REQUEST,
        );
      }

      // Optional field validations
      if (conversationId && typeof conversationId !== 'string') {
        throw new ChatServiceError(
          'conversationId must be a string',
          ChatErrorType.INVALID_REQUEST,
        );
      }

      if (agentId && typeof agentId !== 'string') {
        throw new ChatServiceError(
          'agentId must be a string',
          ChatErrorType.INVALID_REQUEST,
        );
      }

      if (metadata && typeof metadata !== 'object') {
        throw new ChatServiceError(
          'metadata must be an object',
          ChatErrorType.INVALID_REQUEST,
        );
      }

      // Sanitize data
      req.body = {
        userId: userId.trim(),
        conversationId: conversationId?.trim(),
        agentId: agentId?.trim(),
        metadata: metadata || {},
      };

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate message sending requests
   */
  static validateSendMessage(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    try {
      const { sessionId, content, metadata } = req.body;

      // Required field check
      if (!sessionId || typeof sessionId !== 'string') {
        throw new ChatServiceError(
          'sessionId is required and must be a string',
          ChatErrorType.INVALID_REQUEST,
        );
      }

      if (!content || typeof content !== 'string') {
        throw new ChatServiceError(
          'content is required and must be a string',
          ChatErrorType.INVALID_REQUEST,
        );
      }

      // Empty content check
      if (content.trim().length === 0) {
        throw new ChatServiceError(
          'content cannot be empty',
          ChatErrorType.INVALID_REQUEST,
        );
      }

      // Optional field validations
      if (metadata && typeof metadata !== 'object') {
        throw new ChatServiceError(
          'metadata must be an object',
          ChatErrorType.INVALID_REQUEST,
        );
      }

      // Sanitize data
      req.body = {
        sessionId: sessionId.trim(),
        content: content.trim(),
        metadata: metadata || {},
      };

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate session ID in URL parameters
   */
  static validateSessionIdParam(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    try {
      const { sessionId } = req.params;

      if (
        !sessionId ||
        typeof sessionId !== 'string' ||
        sessionId.trim().length === 0
      ) {
        throw new ChatServiceError(
          'Valid sessionId is required',
          ChatErrorType.INVALID_REQUEST,
        );
      }

      // Sanitize
      req.params.sessionId = sessionId.trim();

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate user ID in URL parameters
   */
  static validateUserIdParam(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    try {
      const { userId } = req.params;

      if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
        throw new ChatServiceError(
          'Valid userId is required',
          ChatErrorType.INVALID_REQUEST,
        );
      }

      // Sanitize
      req.params.userId = userId.trim();

      next();
    } catch (error) {
      next(error);
    }
  }

  /**
   * Validate session history query parameters
   */
  static validateHistoryParams(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    try {
      const { limit, includeMetadata, beforeTimestamp, afterTimestamp } =
        req.query;

      // Validate limit param
      if (limit) {
        const limitNum = parseInt(limit as string, 10);
        if (isNaN(limitNum) || limitNum <= 0) {
          throw new ChatServiceError(
            'limit must be a positive number',
            ChatErrorType.INVALID_REQUEST,
          );
        }
        req.query.limit = limitNum.toString();
      }

      // Validate timestamp parameters
      if (beforeTimestamp) {
        const beforeDate = new Date(beforeTimestamp as string);
        if (isNaN(beforeDate.getTime())) {
          throw new ChatServiceError(
            'beforeTimestamp must be a valid date',
            ChatErrorType.INVALID_REQUEST,
          );
        }
      }

      if (afterTimestamp) {
        const afterDate = new Date(afterTimestamp as string);
        if (isNaN(afterDate.getTime())) {
          throw new ChatServiceError(
            'afterTimestamp must be a valid date',
            ChatErrorType.INVALID_REQUEST,
          );
        }
      }

      next();
    } catch (error) {
      next(error);
    }
  }
}
