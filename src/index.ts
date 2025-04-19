import dotenv from 'dotenv';

import app from './app';
import { connectDB } from './database/index';
import { initializePineconeIndexes } from './pinecone/initialize-indexes';

dotenv.config();

const startServer = async () => {
  try {
    // Connect to MongoDB first
    console.log('************** Connecting to database... **************');
    await connectDB();
    console.log(
      '************** Database connection established successfully**************',
    );

    // Initialize Pinecone next - this is the SINGLE initialization point
    console.log('**************Initializing Pinecone**************');
    await initializePineconeIndexes();
    console.log(
      '**************Pinecone initialization completed successfully**************',
    );

    // Start the Express server after all initializations are complete
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
