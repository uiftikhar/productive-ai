#!/usr/bin/env node

/**
 * Server startup script that runs without Nodemon
 * This is useful for testing long-running processes like meeting analysis
 * without interruption from file changes causing restarts
 */

const path = require('path');
const { spawn } = require('child_process');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Set server port
const PORT = process.env.PORT || 3000;

// Function to log with timestamp
function logWithTime(message) {
  const now = new Date().toISOString();
  console.log(`[${now}] ${message}`);
}

// Start the server using ts-node (for development) or node (for production)
function startServer() {
  // Determine if we're using TypeScript
  const isTypeScriptProject = true; // Hard-coded for this project

  let serverProcess;
  
  if (isTypeScriptProject) {
    logWithTime('Starting server with ts-node (without nodemon)...');
    serverProcess = spawn('npx', ['ts-node', './src/index.ts'], {
      env: { ...process.env, PORT: PORT.toString() },
      stdio: 'inherit'
    });
  } else {
    logWithTime('Starting server with node...');
    serverProcess = spawn('node', ['./dist/index.js'], {
      env: { ...process.env, PORT: PORT.toString() },
      stdio: 'inherit'
    });
  }
  
  // Handle server process events
  serverProcess.on('error', (err) => {
    console.error('Failed to start server process:', err);
    process.exit(1);
  });
  
  serverProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`Server process exited with code ${code}`);
      process.exit(code);
    }
  });
  
  // Return the server process
  return serverProcess;
}

// Handle signals to gracefully shut down
process.on('SIGINT', () => {
  logWithTime('Received SIGINT - shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logWithTime('Received SIGTERM - shutting down...');
  process.exit(0);
});

// Start the server
logWithTime(`Starting server in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}...`);
const server = startServer();

// Display startup message
logWithTime(`Server should be running on http://localhost:${PORT}`);
logWithTime('Press Ctrl+C to stop the server');

// Keep the process running
process.stdin.resume(); 