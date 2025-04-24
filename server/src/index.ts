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
import { ResourceManager } from './shared/utils/resource-manager';
import { PerformanceMonitor } from './shared/services/monitoring/performance-monitor';
import { AgentTaskExecutorService } from './agents/services/agent-task-executor.service';
import { ClassifierConfigService } from './agents/factories/classifier-config.service';
import { WorkflowManagerService } from './langgraph/core/workflows/workflow-manager.service';
import { AgentDiscoveryService } from './agents/services/agent-discovery.service';

dotenv.config();

const startServer = async () => {
  try {
    const logger = new ConsoleLogger();
    
    // Initialize the ResourceManager
    const resourceManager = ResourceManager.getInstance(logger);
    
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

    // Get the performance monitor instance
    const performanceMonitor = PerformanceMonitor.getInstance(logger);
    
    // Get instances of additional services to register
    const agentTaskExecutor = AgentTaskExecutorService.getInstance({ logger });
    const classifierConfig = ClassifierConfigService.getInstance(logger);
    const workflowManager = WorkflowManagerService.getInstance(logger);
    const agentDiscovery = AgentDiscoveryService.getInstance({ 
      logger,
      registry: agentRegistry 
    });
    
    // Initialize Socket.IO
    logger.info('**************Initializing Socket.IO Service**************');
    const socketService = new SocketService(server, chatService, logger);
    logger.info('**************Socket.IO Service Initialization Complete**************');

    // Register resources with the ResourceManager in shutdown order (higher priority first)
    resourceManager.register('socketService', () => socketService.shutdown(), { 
      priority: 100, 
      description: 'Socket.IO service'
    });
    
    resourceManager.register('chatService', () => chatService.cleanup(), {
      priority: 90,
      description: 'Chat service with supervisors'
    });
    
    resourceManager.register('userContextFacade', () => userContextFacade.shutdown(), {
      priority: 80,
      description: 'User context facade'
    });
    
    resourceManager.register('performanceMonitor', () => performanceMonitor.dispose(), {
      priority: 70,
      description: 'Performance monitoring service'
    });
    
    resourceManager.register('agentRegistry', () => agentRegistry.cleanup(), {
      priority: 60,
      description: 'Agent registry service'
    });
    
    // Register additional services
    resourceManager.register('agentTaskExecutor', () => agentTaskExecutor.cleanup(), {
      priority: 58,
      description: 'Agent task executor service'
    });
    
    resourceManager.register('classifierConfig', () => classifierConfig.cleanup(), {
      priority: 57,
      description: 'Classifier configuration service'
    });
    
    resourceManager.register('workflowManager', () => workflowManager.cleanup(), {
      priority: 56,
      description: 'LangGraph workflow manager service'
    });
    
    resourceManager.register('agentDiscovery', () => agentDiscovery.cleanup(), {
      priority: 55,
      description: 'Agent discovery service'
    });

    // Start the HTTP server after all initializations are complete
    const PORT = process.env.PORT || 3000;
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

startServer();
