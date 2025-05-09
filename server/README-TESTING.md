# Testing Guide for the Productive AI Server

This document provides instructions for running tests for the Productive AI server.

## Prerequisites

Before running tests, make sure you have:
- Node.js (v18 or higher)
- Yarn package manager
- All dependencies installed (`yarn install`)

## Running Unit and Integration Tests

### Run All Tests

To run all tests:

```bash
yarn test
```

### Run a Specific Test File

To run a specific test file:

```bash
yarn test path/to/test/file.test.ts
```

For example:

```bash
yarn test src/langgraph/agentic-meeting-analysis/tests/topic-visualization.test.ts
```

### Run Tests with Coverage

To generate a coverage report:

```bash
yarn test:coverage
```

## Running Chat Interface Tests

The chat interface tests require the server to be running. These tests interact with a live server instance to verify the functionality of the chat API and agent system.

### Method 1: Start Server Separately

1. Start the server in one terminal:

```bash
yarn start
```

2. In another terminal, run the chat tests:

```bash
yarn test:chat
```

### Method 2: All-in-One Command

Run the server and tests in a single command:

```bash
yarn test:chat:full
```

This command will:
1. Start the server
2. Wait for the server to be ready
3. Run the chat interface tests
4. Shut down the server when tests complete

## Testing Action Item Processing

To test the action item functionality:

```bash
yarn test:action
```

Or run individual action item tests:

```bash
yarn test action-extraction.test.ts
yarn test action-tracking.test.ts
yarn test action-integration.test.ts
```

## Debugging Failed Tests

If tests fail with "open handles" errors, it often means there are asynchronous operations that weren't properly closed:

1. Add the `--detectOpenHandles` flag to see more details:

```bash
yarn test --detectOpenHandles
```

2. Check for:
   - Unclosed database connections
   - Active timers or intervals
   - Incomplete promises
   - WebSocket connections that weren't closed

## Continuous Integration Tests

In CI environments, tests are automatically run with:

```bash
yarn test
```

Make sure all tests pass before submitting PRs. 