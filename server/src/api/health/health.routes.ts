import { Router } from 'express';
import { healthController } from './health.controller';

export const healthRouter = Router();

// Basic health check
healthRouter.get('/health', healthController.checkHealth);

// Detailed health check (may require authentication in production)
healthRouter.get('/health/detailed', healthController.checkDetailedHealth); 