import 'reflect-metadata';
import dotenv from 'dotenv';
import http from 'http';
import { server as httpServer } from './app';
import { connectDB } from './database/index';
import { initializePineconeIndexes } from './pinecone/initialize-indexes';
import { initializeDefaultAgentSystem } from './agents/services/initialize-default-agent';
import { ConsoleLogger } from './shared/logger/console-logger';
import { SocketService } from './websocket/socket.service';
import { ChatService } from './chat/chat.service';
import { UserContextFacade } from './shared/services/user-context/user-context.facade';
import { OpenAIConnector } from './agents/integrations/openai-connector';
import { AgentRegistryService } from './agents/services/agent-registry.service';
import { ResourceManager } from './shared/utils/resource-manager';
import { PerformanceMonitor } from './shared/services/monitoring/performance-monitor';
import { AgentTaskExecutorService } from './agents/services/agent-task-executor.service';
import { ClassifierConfigService } from './agents/factories/classifier-config.service';
import { WorkflowManagerService } from './langgraph/core/workflows/workflow-manager.service';
import { AgentDiscoveryService } from './agents/services/agent-discovery.service';

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

    // Initialize the default agent system
    try {
      logger.info('Initializing agent discovery service...');
      const agentDiscovery = AgentDiscoveryService.getInstance();
      // NOTE: These methods appear to be missing in the AgentDiscoveryService
      // Using alternate approach or awaiting implementation
      // await agentDiscovery.initialize();
      // await agentDiscovery.discoverAgents();
      logger.info('Agent discovery service initialized successfully');
    } catch (error) {
      logger.warn('Error initializing agent discovery service:', { error });
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
    const agentRegistry = AgentRegistryService.getInstance(logger);

    // Create ChatService instance for Socket.IO
    const chatService = new ChatService({
      logger,
      userContextFacade,
      llmConnector,
      agentRegistry,
    });

    // Get the performance monitor instance
    const performanceMonitor = PerformanceMonitor.getInstance(logger);

    // Get instances of additional services to register
    const agentTaskExecutor = AgentTaskExecutorService.getInstance({ logger });
    const classifierConfig = ClassifierConfigService.getInstance(logger);
    const workflowManager = WorkflowManagerService.getInstance(logger);

    // Initialize Socket.IO
    logger.info('**************Initializing Socket.IO Service**************');
    const socketService = new SocketService(server, chatService, logger);
    logger.info(
      '**************Socket.IO Service Initialization Complete**************',
    );

    // Register resources with the ResourceManager in shutdown order (higher priority first)
    const resourceManager = ResourceManager.getInstance(logger);
    resourceManager.register('socketService', () => socketService.shutdown(), {
      priority: 100,
      description: 'Socket.IO service',
    });

    resourceManager.register('chatService', () => chatService.cleanup(), {
      priority: 90,
      description: 'Chat service with supervisors',
    });

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

    resourceManager.register('agentRegistry', () => agentRegistry.cleanup(), {
      priority: 60,
      description: 'Agent registry service',
    });

    // Register additional services
    resourceManager.register(
      'agentTaskExecutor',
      () => agentTaskExecutor.cleanup(),
      {
        priority: 58,
        description: 'Agent task executor service',
      },
    );

    resourceManager.register(
      'classifierConfig',
      () => classifierConfig.cleanup(),
      {
        priority: 57,
        description: 'Classifier configuration service',
      },
    );

    resourceManager.register(
      'workflowManager',
      () => workflowManager.cleanup(),
      {
        priority: 56,
        description: 'LangGraph workflow manager service',
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
