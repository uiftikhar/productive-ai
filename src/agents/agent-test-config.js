// agent-test-config.js
module.exports = {
  ...require('./jest.config.cjs'),
  testMatch: ["**/src/agents/**/*.test.ts"],
  // Increase timeout for agent tests that might take longer
  testTimeout: 30000,
  setupFilesAfterEnv: ['<rootDir>/src/agents/tests/setup.ts'],
};