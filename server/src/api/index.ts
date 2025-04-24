/**
 * API Module Entry Point
 *
 * Initializes and exports all API routes
 */

import { Router } from 'express';
import { ChatService } from '../chat/chat.service';
import { ChatController } from './controllers/chat.controller';
import { createChatRouter } from './routes/chat.routes';
import { UserContextFacade } from '../shared/services/user-context/user-context.facade';
import { LanguageModelProvider } from '../agents/interfaces/language-model-provider.interface';
import { AgentRegistryService } from '../agents/services/agent-registry.service';
import { Logger } from '../shared/logger/logger.interface';

/**
 * Initialize API routes with all required dependencies
 */
export function initializeApi(
  userContextFacade: UserContextFacade,
  llmConnector: LanguageModelProvider,
  agentRegistry: AgentRegistryService,
  logger: Logger,
): Router {
  const apiRouter = Router();

  // Initialize chat service
  const chatService = new ChatService({
    userContextFacade,
    llmConnector,
    agentRegistry,
    logger,
  });

  // Initialize controllers
  const chatController = new ChatController(chatService);

  // Register routes
  apiRouter.use('/chat', createChatRouter(chatController));

  // Add more API routes here as needed

  return apiRouter;
}
