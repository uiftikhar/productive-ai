/**
 * Chat API Routes
 *
 * Defines all chat-related REST API endpoints
 */

import { Router } from 'express';
import { ChatController } from '../controllers/chat.controller';
import { ChatValidator } from '../validators/chat.validator';
import { createRateLimiter } from '../../chat/middleware/rate-limiter';
import { chatErrorHandler } from '../../chat/middleware/error-handler';
import { isAuthenticated } from '../../auth/middlewares/isAuthenticated';
import {
  createCacheMiddleware,
  noCacheMiddleware,
} from '../../chat/middleware/cache-middleware';

export function createChatRouter(chatController: ChatController): Router {
  const router = Router();

  // Apply rate limiting to all chat endpoints
  // const chatRateLimiter = createRateLimiter({
  //   windowMs: 60 * 1000, // 1 minute window
  //   maxRequests: 120, // 120 requests per minute by default
  //   message: 'Too many requests, please try again after some time',
  //   slidingWindow: true, // Use more accurate sliding window algorithm
  //   tierLimits: {
  //     free: 60, // 60 requests per minute for free tier
  //     standard: 120, // 120 requests per minute for standard tier
  //     premium: 300, // 300 requests per minute for premium tier
  //     enterprise: 600, // 600 requests per minute for enterprise tier
  //   },
  //   endpointLimits: {
  //     '/messages': 40, // Limit message sending more strictly
  //     '/messages/stream': 20, // Even stricter limit on streaming
  //     '/sessions': 30, // Session creation has its own limit
  //   },
  //   ipLimitMultiplier: 0.3, // Stricter limits for unauthenticated requests
  // });

  // // Create cache middleware
  // const cacheMiddleware = createCacheMiddleware({
  //   ttlMs: 30 * 1000, // 30 seconds cache for GET requests
  //   maxSize: 1000, // Store up to 1000 responses
  // });

  // // Apply authentication and rate limiting to all routes
  // router.use(isAuthenticated);
  // router.use(chatRateLimiter);

  // // Session management endpoints
  // router.post(
  //   '/sessions',
  //   noCacheMiddleware, // Prevent caching of POST requests
  //   ChatValidator.validateCreateSession,
  //   chatController.createSession.bind(chatController),
  // );

  // router.get(
  //   '/sessions/:sessionId',
  //   cacheMiddleware, // Cache session details
  //   ChatValidator.validateSessionIdParam,
  //   chatController.getSession.bind(chatController),
  // );

  // router.delete(
  //   '/sessions/:sessionId',
  //   noCacheMiddleware,
  //   ChatValidator.validateSessionIdParam,
  //   chatController.deleteSession.bind(chatController),
  // );

  // router.get(
  //   '/users/:userId/sessions',
  //   cacheMiddleware, // Cache user sessions list
  //   ChatValidator.validateUserIdParam,
  //   chatController.getUserSessions.bind(chatController),
  // );

  // // Messaging endpoints
  // router.post(
  //   '/messages',
  //   noCacheMiddleware,
  //   ChatValidator.validateSendMessage,
  //   chatController.sendMessage.bind(chatController),
  // );

  // // Streaming messaging endpoint - support both POST and GET for EventSource compatibility
  // router.post(
  //   '/messages/stream',
  //   noCacheMiddleware,
  //   ChatValidator.validateSendMessage,
  //   chatController.sendMessageStream.bind(chatController),
  // );

  // router.get(
  //   '/messages/stream',
  //   chatController.sendMessageStream.bind(chatController),
  // );

  // // Session history endpoint
  // router.get(
  //   '/sessions/:sessionId/history',
  //   cacheMiddleware, // Cache conversation history
  //   ChatValidator.validateSessionIdParam,
  //   ChatValidator.validateHistoryParams,
  //   chatController.getSessionHistory.bind(chatController),
  // );

  // // Use error handler as the last middleware
  // router.use(chatErrorHandler);

  return router;
}
