import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const connectDB = async (): Promise<void> => {
  try {
    const mongoURI = process.env.MONGO_DB_CONNECTION_URI!;
    await mongoose.connect(mongoURI);
    console.log('MongoDB Atlas connected successfully.');
  } catch (error) {
    console.error('Error connecting to MongoDB Atlas:', error);
    process.exit(1);
  }
};
export default connectDB;
