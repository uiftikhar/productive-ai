import express from 'express';
import cors from 'cors';
import { json } from 'body-parser';
import { chatRouter } from './api/chat/chat.routes';
import { healthRouter } from './api/health/health.routes';
import { ConsoleLogger } from './shared/logger/console-logger';
import { ServiceRegistry } from './langgraph/agentic-meeting-analysis/services/service-registry';

// Initialize services
const logger = new ConsoleLogger();

// Create Express app
const app = express();
const port = process.env.PORT || 3001;

// Apply middleware
app.use(cors());
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

// Initialize services before starting the server
const serviceRegistry = ServiceRegistry.getInstance({
  storageType: 'file',
  storagePath: process.env.STORAGE_PATH || './data',
  logger
});

// Start server
(async () => {
  try {
    // Initialize services
    await serviceRegistry.initialize();
    logger.info('Services initialized successfully');
    
    // Start listening
    app.listen(port, () => {
      logger.info(`Server running on port ${port} `);
    });
  } catch (error) {
    logger.error('Failed to initialize services', { error });
    process.exit(1);
  }
})(); 