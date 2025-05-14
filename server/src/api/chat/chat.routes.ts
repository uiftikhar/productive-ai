// TODO: THere is a chat routes in /server/src/api/routes/chat.routes.ts
// There is a duplication either here or in the chat.controller.ts file
import { Router, Request, Response, NextFunction } from 'express';
import { chatController } from './chat.controller';
import { ServiceRegistry } from '../../langgraph/agentic-meeting-analysis/services/service-registry';

export const chatRouter = Router();

// Middleware to ensure services are initialized
const ensureInitialized = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const serviceRegistry = ServiceRegistry.getInstance();
    if (!serviceRegistry.isInitialized()) {
      await serviceRegistry.initialize();
    }
    next();
  } catch (error: any) {
    return res.status(503).json({
      error: {
        type: 'SERVICE_UNAVAILABLE',
        message: 'Services are still initializing, please try again in a moment',
        details: error.message
      }
    });
  }
};

// Apply the middleware to all chat routes
chatRouter.use(ensureInitialized);

// Create a new chat session
chatRouter.post('/session', chatController.createSession);

// Get messages for a chat session
chatRouter.get('/session/:sessionId/messages', chatController.getMessages);

// Upload a transcript for analysis
chatRouter.post('/transcript', chatController.uploadTranscript);

// Send a message to a chat session
chatRouter.post('/session/:sessionId/message', chatController.sendMessage);

// Get analysis status for a meeting
chatRouter.get('/analysis/:meetingId/status', chatController.getAnalysisStatus);

// Related meetings
chatRouter.get('/transcript/:meetingId/related', chatController.getRelatedMeetings); 