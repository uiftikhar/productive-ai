/**
 * API Module Entry Point
 *
 * Initializes and exports all API routes
 */

import { Router } from 'express';
import { UserContextFacade } from '../shared/services/user-context/user-context.facade';
import { Logger } from '../shared/logger/logger.interface';
import transcriptAnalysisRouter from './routes/transcript-analysis.routes';

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

  // Register new transcript analysis routes
  apiRouter.use('/transcript', transcriptAnalysisRouter);

  // Add more API routes here as needed

  return apiRouter;
}
