import express from 'express';
import cors from 'cors';
import { json, urlencoded } from 'body-parser';
import { ConsoleLogger } from './shared/logger/console-logger';
import { initializeApi } from './api';
import { ServiceRegistry } from './langgraph/agentic-meeting-analysis/services/service-registry';
import { chatRouter } from './api/chat/chat.routes';

// Create logger
const logger = new ConsoleLogger();

// Create Express app
const app = express();
const port = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(json({ limit: '50mb' }));
app.use(urlencoded({ extended: true, limit: '50mb' }));

// Initialize services
const serviceRegistry = ServiceRegistry.getInstance({
  storageType: 'file',
  storagePath: process.env.STORAGE_PATH || './data',
  logger
});

// Initialize the service registry
(async () => {
  try {
    logger.info('Initializing services...');
    await serviceRegistry.initialize();
    logger.info('Services initialized successfully');
  } catch (error) {
    logger.error('Error initializing services', { error });
    process.exit(1);
  }
})();

// API routes
app.use('/api/chat', chatRouter);

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err });
  res.status(500).json({
    error: {
      type: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'production' ? undefined : err.message
    }
  });
});

// Start server
app.listen(port, () => {
  logger.info(`Server running on port ${port}`);
}); 