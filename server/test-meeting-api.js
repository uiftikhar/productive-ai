/**
 * Test script to verify meeting analysis API routes
 * Run with: node test-meeting-api.js
 */
const express = require('express');
const { createServer } = require('./dist/server');
const { ConsoleLogger } = require('./dist/shared/logger/console-logger');

async function testRoutes() {
  const logger = new ConsoleLogger({ level: 'debug' });
  logger.info('Starting test for meeting analysis API routes');
  
  try {
    // Create server
    const app = await createServer({ 
      logger,
      enableCors: true
    });
    
    // Print registered routes
    logger.info('Printing registered routes:');
    
    // Function to print routes recursively
    function printRoutes(stack, prefix = '') {
      if (!stack) return;
      
      stack.forEach(route => {
        if (route.route) {
          // It's a route
          const path = prefix + route.route.path;
          const methods = Object.keys(route.route.methods).map(m => m.toUpperCase()).join(', ');
          logger.info(`Route: [${methods}] ${path}`);
        } else if (route.name === 'router' && route.handle.stack) {
          // It's a sub-router
          const newPrefix = prefix + (route.regexp.toString().includes('^\\/\\^') 
            ? route.regexp.toString().replace(/^\^\\\/\\\^/, '').replace(/\\\/\\\?\(\?=\\\/\|\$\)\$/, '')
            : '');
          
          printRoutes(route.handle.stack, prefix + (route.regexp ? route.regexp.source.replace(/^\^\\\//, '/').replace(/\\\/\?\(\?=\\\/\|\$\)\$/, '') : ''));
        }
      });
    }
    
    // Print Express routes
    printRoutes(app._router.stack);
    
    logger.info('Test completed');
  } catch (error) {
    logger.error('Test failed:', error);
  }
}

testRoutes(); 