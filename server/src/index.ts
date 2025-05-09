import 'reflect-metadata';
import dotenv from 'dotenv';
import http from 'http';
import { createServer } from './server';
import { connectDB } from './database/index';
import { initializePineconeIndexes } from './pinecone/initialize-indexes';
import { ConsoleLogger } from './shared/logger/console-logger';
import { SocketService } from './websocket/socket.service';
import { UserContextFacade } from './shared/services/user-context/user-context.facade';
import { OpenAIConnector } from './connectors/openai-connector';
import { ResourceManager } from './shared/utils/resource-manager';
import { PerformanceMonitor } from './shared/services/monitoring/performance-monitor';

// Create a logger instance
const logger = new ConsoleLogger();

// Load environment variables from .env file
dotenv.config();

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    logger.info('Starting server...');

    // Connect to MongoDB
    await connectDB();
    logger.info('Connected to MongoDB');

    // Initialize Pinecone indexes
    try {
      await initializePineconeIndexes();
      logger.info(
        '**************Pinecone initialization completed successfully**************',
      );
    } catch (error) {
      logger.warn('Error initializing Pinecone:', { error });
      logger.info('Continuing with server initialization...');
    }

    // Create Express app with required services
    const app = await createServer({
      logger,
      enableCors: true,
      enableLogging: true
    });

    // Create HTTP server
    const server = http.createServer(app);

    // Initialize services
    const userContextFacade = new UserContextFacade({ logger });
    const performanceMonitor = PerformanceMonitor.getInstance(logger);

    // Get the resource manager
    const resourceManager = ResourceManager.getInstance(logger);
    
    resourceManager.register(
      'userContextFacade',
      () => userContextFacade.shutdown(),
      {
        priority: 80,
        description: 'User context facade',
      },
    );

    resourceManager.register(
      'performanceMonitor',
      () => performanceMonitor.dispose(),
      {
        priority: 70,
        description: 'Performance monitoring service',
      },
    );

    // Start the HTTP server
    server.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });

    // Handle graceful shutdown using ResourceManager
    const handleShutdown = async () => {
      logger.info('Shutting down server...');

      // First shut down all resources using the ResourceManager
      await resourceManager.shutdownAll();

      // Then close the HTTP server
      server.close(() => {
        logger.info('Server shutdown complete');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => {
      void handleShutdown();
    });

    process.on('SIGINT', () => {
      void handleShutdown();
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Start server if this is the main module
if (require.main === module) {
  startServer();
}

// Simple version for development mode
if (process.env.NODE_ENV === 'development') {
  startServer().catch(err => {
    console.error('Failed to start development server:', err);
    process.exit(1);
  });
}
