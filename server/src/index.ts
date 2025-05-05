import 'reflect-metadata';
import dotenv from 'dotenv';
import http from 'http';
import { server as httpServer } from './app';
import { connectDB } from './database/index';
import { initializePineconeIndexes } from './pinecone/initialize-indexes';
import { ConsoleLogger } from './shared/logger/console-logger';
import { SocketService } from './websocket/socket.service';
import { ChatService } from './chat/chat.service';
import { UserContextFacade } from './shared/services/user-context/user-context.facade';
import { OpenAIConnector } from './connectors/openai-connector';
import { ResourceManager } from './shared/utils/resource-manager';
import { PerformanceMonitor } from './shared/services/monitoring/performance-monitor';
import { initializeApi } from './api';
import express from 'express';

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

    // Create HTTP server with WebSocket support (imported from app.ts)
    const server = httpServer;

    // Initialize services for Socket.IO
    const userContextFacade = new UserContextFacade({ logger });
    const llmConnector = new OpenAIConnector({
      modelConfig: {
        model: process.env.OPENAI_MODEL || 'gpt-4o',
      },
      logger,
    });

    // Create ChatService instance for Socket.IO
    const chatService = new ChatService();

    // Get the performance monitor instance
    const performanceMonitor = PerformanceMonitor.getInstance(logger);

    // Initialize Socket.IO
    logger.info('**************Initializing Socket.IO Service**************');
    const socketService = new SocketService();
    logger.info(
      '**************Socket.IO Service Initialization Complete**************',
    );

    // Initialize API routes
    logger.info('**************Initializing API Routes**************');
    const apiRouter = initializeApi(
      userContextFacade,
      llmConnector,
      null, // No agent registry needed with new approach
      logger,
    );
    
    // Add the API router to the Express app
    const app = server.listeners('request')[0] as express.Application;
    app.use('/api', apiRouter);
    
    logger.info('**************API Routes Initialization Complete**************');

    // Register resources with the ResourceManager in shutdown order (higher priority first)
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

    // Start the HTTP server after all initializations are complete
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

// Simple version that directly starts the server for development
if (process.env.NODE_ENV === 'development') {
  // Start server with WebSocket support
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
