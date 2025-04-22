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

export function createChatRouter(chatController: ChatController): Router {
  const router = Router();
  
  // Apply rate limiting to all chat endpoints
  const chatRateLimiter = createRateLimiter({
    windowMs: 60 * 1000, // 1 minute window
    maxRequests: 60,     // 60 requests per minute
    message: 'Too many requests, please try again after some time'
  });
  
  // Apply authentication and rate limiting to all routes
  router.use(isAuthenticated);
  router.use(chatRateLimiter);
  
  // Session management endpoints
  router.post('/sessions', 
    ChatValidator.validateCreateSession,
    chatController.createSession.bind(chatController)
  );
  
  router.get('/sessions/:sessionId', 
    ChatValidator.validateSessionIdParam,
    chatController.getSession.bind(chatController)
  );
  
  router.delete('/sessions/:sessionId', 
    ChatValidator.validateSessionIdParam,
    chatController.deleteSession.bind(chatController)
  );
  
  router.get('/users/:userId/sessions', 
    ChatValidator.validateUserIdParam,
    chatController.getUserSessions.bind(chatController)
  );
  
  // Messaging endpoints
  router.post('/messages', 
    ChatValidator.validateSendMessage,
    chatController.sendMessage.bind(chatController)
  );
  
  // Streaming messaging endpoint - support both POST and GET for EventSource compatibility
  router.post('/messages/stream', 
    ChatValidator.validateSendMessage,
    chatController.sendMessageStream.bind(chatController)
  );
  
  router.get('/messages/stream',
    chatController.sendMessageStream.bind(chatController)
  );
  
  router.get('/sessions/:sessionId/history', 
    ChatValidator.validateSessionIdParam,
    ChatValidator.validateHistoryParams,
    chatController.getSessionHistory.bind(chatController)
  );
  
  // Use error handler as the last middleware
  router.use(chatErrorHandler);
  
  return router;
} 