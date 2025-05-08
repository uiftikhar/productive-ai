import express, { Express } from 'express';
import cors from 'cors';
import { json } from 'body-parser';
import { chatRouter } from './api/chat/chat.routes';
import { healthRouter } from './api/health/health.routes';
import { ConsoleLogger } from './shared/logger/console-logger';
import { ServiceRegistry } from './langgraph/agentic-meeting-analysis/services/service-registry';
import { Logger } from './shared/logger/logger.interface';

/**
 * Server configuration options
 */
export interface ServerConfig {
  serviceRegistry?: ServiceRegistry;
  port?: number;
  enableCors?: boolean;
  enableLogging?: boolean;
  logger?: Logger;
}

/**
 * Create an Express server with the specified configuration
 */
export async function createServer(config: ServerConfig = {}): Promise<Express> {
  // Initialize logger
  const logger = config.logger || new ConsoleLogger();
  
  // Initialize services if not provided
  const serviceRegistry = config.serviceRegistry || ServiceRegistry.getInstance({
    storageType: 'file',
    storagePath: process.env.STORAGE_PATH || './data',
    logger
  });
  
  // Initialize services if needed
  if (!config.serviceRegistry) {
    try {
      await serviceRegistry.initialize();
      logger.info('Services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize services', { error });
      throw error;
    }
  }

  // Create Express app
  const app = express();
  
  // Apply middleware
  if (config.enableCors !== false) {
    app.use(cors());
  }
  app.use(json({ limit: '10mb' })); // Increased limit for transcript uploads
  
  // Create versioned API routes
  const apiV1Router = express.Router();
  
  // Health routes (not versioned for easier monitoring)
  app.use('/', healthRouter);
  
  // Mount API v1 routes
  apiV1Router.use('/chat', chatRouter);
  
  // Use versioned routes
  app.use('/api/v1', apiV1Router);
  // Keep an unversioned path for backward compatibility
  app.use('/api', apiV1Router);
  
  // General error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled error in request', { error: err, path: req.path });
    res.status(500).json({
      error: {
        type: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        details: process.env.NODE_ENV === 'production' ? undefined : err.message
      }
    });
  });
  
  return app;
}

// Only start the server if this file is run directly
if (require.main === module) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  const logger = new ConsoleLogger();
  
  // Create and start the server
  (async () => {
    try {
      const app = await createServer({ port, logger });
      
      // Start listening
      app.listen(port, () => {
        logger.info(`Server running on port ${port}`);
      });
    } catch (error) {
      logger.error('Failed to start server', { error });
      process.exit(1);
    }
  })();
} 