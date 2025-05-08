/**
 * API Module Entry Point
 *
 * Initializes and exports all API routes
 */

import { Router } from 'express';
import { UserContextFacade } from '../shared/services/user-context/user-context.facade';
import { Logger } from '../shared/logger/logger.interface';
import { chatRouter } from './chat/chat.routes';

/**
 * Initialize API routes with all required dependencies
 */
export function initializeApi(
  userContextFacade: UserContextFacade,
  llmConnector: any,
  agentRegistry: any,
  logger: Logger,
) {
  const apiRouter = Router();

  // Register chat routes
  apiRouter.use('/chat', chatRouter);

  // Register other API routes as needed
  
  return apiRouter;
}
