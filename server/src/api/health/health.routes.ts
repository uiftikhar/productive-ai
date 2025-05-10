import { Router } from 'express';
import { healthController } from './health.controller';

// Create the health router with versioning support
export const healthRouter = Router();

// Basic health check - available without version prefix
healthRouter.get('/health', healthController.checkHealth);

// API version 1 endpoints
const v1Router = Router();

// Detailed health check with versioning
v1Router.get('/health/detailed', healthController.checkDetailedHealth);

// Service status endpoint
v1Router.get('/health/service-status', healthController.checkServiceStatus);

// Add version-specific routes
healthRouter.use('/v1', v1Router);

// For backward compatibility, also expose without version prefix
healthRouter.get('/health/detailed', healthController.checkDetailedHealth);
healthRouter.get('/health/service-status', healthController.checkServiceStatus); 