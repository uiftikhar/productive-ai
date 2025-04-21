import dotenv from 'dotenv';

import app from './app';
import { connectDB } from './database/index';
import { initializePineconeIndexes } from './pinecone/initialize-indexes';
import { initializeDefaultAgentSystem } from './agents/services/initialize-default-agent';
import { ConsoleLogger } from './shared/logger/console-logger';

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

    // Start the Express server after all initializations are complete
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      logger.info(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
