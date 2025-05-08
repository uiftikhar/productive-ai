/**
 * Mock Service Worker server setup
 * 
 * This file sets up the MSW server for testing
 */

const { setupServer } = require('msw/node');
const { handlers } = require('./handlers');

// Create the mock server instance
const server = setupServer(...handlers);

module.exports = server; 