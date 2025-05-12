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
import { ServiceRegistry } from './langgraph/agentic-meeting-analysis/services/service-registry';
import { AgentGraphVisualizationService } from './langgraph/agentic-meeting-analysis/visualization/agent-graph-visualization.service';
import { initializeVisualizationWebSocket } from './api/controllers/visualization.controller';
import visualizationRoutes from './api/routes/visualization.routes';
import agentProtocolRoutes from './api/agent-protocol.routes';
import express from 'express';
import path from 'path';
import fs from 'fs';
import { PineconeConnector } from './connectors/pinecone-connector';

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
    const { app, server } = await createServer({
      logger,
      enableCors: true,
      enableLogging: true
    });

    // Initialize WebSocket server for visualizations
    initializeVisualizationWebSocket(server);

    // Register global services
    const serviceRegistry = ServiceRegistry.getInstance();
    serviceRegistry.registerAgentVisualizationService(new AgentGraphVisualizationService({
      logger,
      enableRealTimeUpdates: true
    }));

    // Initialize and register OpenAI connector
    try {
      const openAiConnector = new OpenAIConnector({
        logger,
        modelConfig: {
          model: process.env.OPENAI_MODEL || 'gpt-4o',
          temperature: 0.2,
          maxTokens: 4000,
          streaming: true
        },
        embeddingConfig: {
          model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large'
        }
      });
      
      await openAiConnector.initialize();
      serviceRegistry.registerOpenAIConnector(openAiConnector);
      logger.info('OpenAI connector registered with ServiceRegistry');
    } catch (error) {
      logger.error('Failed to initialize OpenAI connector', { error });
    }

    // Initialize and register Pinecone connector
    try {
      const pineconeConnector = new PineconeConnector({ logger });
      await pineconeConnector.initialize();
      serviceRegistry.registerPineconeConnector(pineconeConnector);
      logger.info('Pinecone connector registered with ServiceRegistry');
    } catch (error) {
      logger.error('Failed to initialize Pinecone connector', { error });
    }

    // Register API routes
    app.use('/api/visualizations', visualizationRoutes);
    
    // Register the Agent Protocol routes as the primary meeting analysis API
    app.use('/api/analysis', agentProtocolRoutes);
    app.use('/api/v1/analysis', agentProtocolRoutes);

    // Create visualizations directory if it doesn't exist
    const visualizationsPath = path.join(process.cwd(), 'visualizations');
    if (!fs.existsSync(visualizationsPath)) {
      fs.mkdirSync(visualizationsPath, { recursive: true });
      logger.info(`Created visualizations directory at ${visualizationsPath}`);
    }

    // Serve visualizations as static files
    app.use('/visualizations', express.static('visualizations'));

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
      logger.info(`Server started on port ${PORT}`);
      logger.info(`http://localhost:${PORT}`);
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
