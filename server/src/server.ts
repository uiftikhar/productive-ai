import express, { Express, Router } from 'express';
import session from 'express-session';
import cors from 'cors';
import { json, urlencoded } from 'body-parser';
import { chatRouter } from './api/chat/chat.routes';
import { healthRouter } from './api/health/health.routes';
import { debugRouter } from './api/debug/debug.routes';
import { ConsoleLogger } from './shared/logger/console-logger';
import { ServiceRegistry } from './langgraph/agentic-meeting-analysis/services/service-registry';
import { Logger } from './shared/logger/logger.interface';
import { authRoutes } from './auth/auth.routes';
import { passportClient } from './database';
import http from 'http';
import morgan from 'morgan';
import agentProtocolRoutes from './api/agent-protocol.routes';

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
 * Create and configure Express server
 */
export async function createServer(config: ServerConfig = {}): Promise<{ app: Express; server: http.Server }> {
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

  // Create HTTP server
  const server = http.createServer(app);

  // Configure middleware
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // Enable CORS if specified
  if (config.enableCors) {
    app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-bypass-auth']
    }));
  }

  // Enable request logging if specified
  if (config.enableLogging) {
    app.use(morgan('dev'));
  }

  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'your-secret-key',
      resave: false,
      saveUninitialized: false,
    }),
  );

  app.use(passportClient.initialize());
  app.use(passportClient.session());

  // Health routes (not versioned for easier monitoring)
  app.use('/', healthRouter);

  // Register auth and existing routes
  app.use('/auth', authRoutes);
  
  // Create versioned API routes
  const apiV1Router = express.Router();

  // Mount API v1 routes
  apiV1Router.use('/chat', chatRouter);
  apiV1Router.use('/debug', debugRouter);
  
  // Register Agent Protocol routes
  apiV1Router.use('/analysis', agentProtocolRoutes);

  // Use versioned routes
  app.use('/api/v1', apiV1Router);
  // Keep an unversioned path for backward compatibility
  app.use('/api', apiV1Router);

  // Add a debug route to see all registered routes
  app.get('/debug/routes', (req, res) => {
    const routes: Array<{ method: string, path: string }> = [];

    function print(path: string, layer: any) {
      if (layer.route) {
        layer.route.stack.forEach((item: any) => {
          let method = Object.keys(layer.route.methods)[0].toUpperCase();
          routes.push({
            method,
            path: path + layer.route.path
          });
        });
      } else if (layer.name === 'router' && layer.handle.stack) {
        layer.handle.stack.forEach((item: any) => {
          print(
            (path || '') + (layer.regexp ? layer.regexp.toString().replace(/\/\^\\\/(?:([^\/]*(?:\/[^\/]*?)?))\\\/\?\(\?=\\\/\|\$\)\/i/, '/$1').replace(/\\\//g, '/') : ''),
            item
          );
        });
      }
    }

    app._router.stack.forEach((layer: any) => {
      print('', layer);
    });

    res.json({ routes });
  });

  // Debug logging to verify routes
  if (config.logger) {
    config.logger.debug('API routes registered:', {
      routes: {
        health: ['/health', '/health/detailed', '/health/service-status'],
        debug: ['/api/v1/debug/agent-status', '/api/v1/debug/agent-progress/:sessionId'],
        analysis: [
          '/api/v1/analysis/meetings/analyze',
          '/api/v1/analysis/meetings/:meetingId/status',
          '/api/v1/analysis/meetings/:meetingId/result',
          '/api/v1/analysis/meetings/:meetingId/cancel'
        ]
      }
    });
  }

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

  return { app, server };
}

// Only start the server if this file is run directly
if (require.main === module) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
  const logger = new ConsoleLogger();

  // Create and start the server
  (async () => {
    try {
      const { app, server } = await createServer({ port, logger });

      // Start listening
      server.listen(port, () => {
        logger.info(`Server running on port ${port}`);
        logger.info('Meeting analysis endpoints registered at:');
        logger.info('- /api/analysis/meetings/analyze');
        logger.info('- /api/analysis/meetings/:meetingId/status');
        logger.info('- /api/analysis/meetings/:meetingId/result');
        logger.info('- /api/analysis/meetings/:meetingId/cancel');
        logger.info('- /api/v1/analysis/meetings/analyze');
        logger.info('- /api/v1/analysis/meetings/:meetingId/status');
        logger.info('- /api/v1/analysis/meetings/:meetingId/result');
        logger.info('- /api/v1/analysis/meetings/:meetingId/cancel');
      });
    } catch (error) {
      logger.error('Failed to start server', { error });
      process.exit(1);
    }
  })();
} 