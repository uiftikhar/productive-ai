import dotenv from 'dotenv';

import app from './app';
import { connectDB } from './database/index';

dotenv.config();

const startServer = async () => {
  try {
    await connectDB();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  }
};

startServer();
