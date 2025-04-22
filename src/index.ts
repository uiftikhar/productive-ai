import dotenv from 'dotenv';
import http from 'http';
import app from './app';
import { connectDB } from './database/index';
import { initializePineconeIndexes } from './pinecone/initialize-indexes';
import { initializeDefaultAgentSystem } from './agents/services/initialize-default-agent';
import { ConsoleLogger } from './shared/logger/console-logger';
import { SocketService } from './websocket/socket.service';
import { ChatService } from './chat/chat.service';
import { UserContextFacade } from './shared/services/user-context/user-context.facade';
import { OpenAIConnector } from './agents/integrations/openai-connector';
import { AgentRegistryService } from './agents/services/agent-registry.service';

dotenv.config();

const startServer = async () => {
  try {
    const logger = new ConsoleLogger();
    
    // Connect to MongoDB first
    logger.info('************** Connecting to database... **************');
    await connectDB();
    logger.info(
      '************** Database connection established successfully**************',
    );

    // Initialize Pinecone next - this is the SINGLE initialization point
    logger.info('**************Initializing Pinecone**************');
    await initializePineconeIndexes();
    logger.info(
      '**************Pinecone initialization completed successfully**************',
    );

    // Initialize the default agent system
    // TODO Initialize other agents also and add them to the registry and initialize them here
    logger.info('**************Initializing Default Agent System**************');
    const defaultAgentService = await initializeDefaultAgentSystem({
      logger,
      confidenceThreshold: 0.7, // Adjust based on desired sensitivity
    });
    
    const defaultAgent = defaultAgentService.getDefaultAgent();
    if (defaultAgent) {
      logger.info(`Default agent initialized: ${defaultAgent.name} (${defaultAgent.id})`);
    } else {
      logger.warn('No default agent was configured. Fallback functionality will be limited.');
    }
    
    logger.info('**************Default Agent System Initialization Complete**************');

    // Create HTTP server
    const server = http.createServer(app);
    
    // Initialize services for Socket.IO
    const userContextFacade = new UserContextFacade({ logger });
    const llmConnector = new OpenAIConnector({
      modelConfig: {
        model: process.env.OPENAI_MODEL || 'gpt-4o',
      },
      logger
    });
    const agentRegistry = AgentRegistryService.getInstance(logger);
    
    // Create ChatService instance for Socket.IO
    const chatService = new ChatService({
      logger,
      userContextFacade,
      llmConnector,
      agentRegistry
    });
    
    // Initialize Socket.IO
    logger.info('**************Initializing Socket.IO Service**************');
    const socketService = new SocketService(server, chatService, logger);
    logger.info('**************Socket.IO Service Initialization Complete**************');

    // Start the HTTP server after all initializations are complete
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });
    
    // Handle graceful shutdown
    const handleShutdown = () => {
      logger.info('Shutting down server...');
      socketService.shutdown();
      server.close(() => {
        logger.info('Server shutdown complete');
        process.exit(0);
      });
    };
    
    process.on('SIGTERM', handleShutdown);
    process.on('SIGINT', handleShutdown);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
