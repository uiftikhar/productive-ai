import mongoose from 'mongoose';

// connectDB.test.ts
import { connectDB } from '../db.ts'; // adjust the path accordingly

jest.mock('mongoose', () => ({
  connect: jest.fn(),
}));

describe('connectDB', () => {
  // Save the original process.exit so we can restore it later.
  const originalProcessExit = process.exit;

  beforeAll(() => {
    // Override process.exit so that it doesn't actually terminate the test runner.
    process.exit = jest.fn() as unknown as typeof process.exit;
  });

  afterAll(() => {
    // Restore process.exit after tests.
    process.exit = originalProcessExit;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Ensure the environment variable is set.
    process.env.MONGO_DB_URI = 'mongodb://localhost:27017/test';
  });

  it('should connect to MongoDB successfully', async () => {
    // Arrange: simulate a successful connection.
    (mongoose.connect as jest.Mock).mockResolvedValueOnce(undefined);
    const consoleLogSpy = jest
      .spyOn(console, 'log')
      .mockImplementation(() => {});

    // Act
    await connectDB();

    // Assert
    expect(mongoose.connect).toHaveBeenCalledWith(process.env.MONGO_DB_URI);
    expect(consoleLogSpy).toHaveBeenCalledWith(
      'MongoDB Atlas connected successfully.',
    );
    expect(process.exit).not.toHaveBeenCalled();

    consoleLogSpy.mockRestore();
  });

  it('should log an error and exit process if connection fails', async () => {
    // Arrange: simulate a connection failure.
    const connectionError = new Error('Connection failed');
    (mongoose.connect as jest.Mock).mockRejectedValueOnce(connectionError);
    const consoleErrorSpy = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // Act
    await connectDB();

    // Assert
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error connecting to MongoDB Atlas:',
      connectionError,
    );
    expect(process.exit).toHaveBeenCalledWith(1);

    consoleErrorSpy.mockRestore();
  });
});
