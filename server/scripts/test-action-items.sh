#!/bin/bash

# Test script for action item processing functionality
# Part of Milestone 3.2: Action Item Processing

# Set working directory to project root
cd "$(dirname "$0")/.."

# Set environment variables
export NODE_ENV=development
export DEBUG=productive-ai:*

# Test action item extraction and tracking
echo "Testing Action Item Processing functionality..."

# Build TypeScript if needed
if [ ! -d "dist" ] || [ -n "$(find src -type f -name "*.ts" -newer "dist")" ]; then
  echo "Building TypeScript..."
  yarn build
fi

# Run the action item demo
echo "Running action item extraction demo..."
node dist/src/langgraph/agentic-meeting-analysis/examples/action-item-demo.js

# Run the tests with yarn test
echo "Running action item extraction tests..."
yarn test src/langgraph/agentic-meeting-analysis/tests/action-extraction.test.ts

echo "Running action item tracking tests..."
yarn test src/langgraph/agentic-meeting-analysis/tests/action-tracking.test.ts

echo "Running action item integration tests..."
yarn test src/langgraph/agentic-meeting-analysis/tests/action-integration.test.ts 