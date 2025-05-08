/**
 * Simple script to start the server
 */

console.log('Starting server...');

try {
  // Set up data directory if it doesn't exist
  const fs = require('fs');
  const path = require('path');
  
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    console.log(`Creating data directory: ${dataDir}`);
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Check if the dist directory exists
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    console.error(`Error: dist directory does not exist: ${distDir}`);
    console.error('Please run "npm run build" first');
    process.exit(1);
  }
  
  // Check if server.js exists in the dist directory
  const serverFile = path.join(distDir, 'server.js');
  if (!fs.existsSync(serverFile)) {
    console.error(`Error: server.js not found: ${serverFile}`);
    console.error('Please run "npm run build" first');
    process.exit(1);
  }
  
  console.log(`Starting server from: ${serverFile}`);
  
  // Start the server
  require('./dist/server');
  
  console.log('Server started successfully. Use Ctrl+C to stop.');
} catch (error) {
  console.error('Error starting server:', error);
  console.error('Stack trace:', error.stack);
} 