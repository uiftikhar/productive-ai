#!/bin/bash

# Check if OpenAI API key is set
if [ -z "$OPENAI_API_KEY" ]; then
  echo "Error: OPENAI_API_KEY environment variable is not set"
  echo "Please set it with: export OPENAI_API_KEY=your-api-key"
  exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi

# Build the TypeScript project
echo "Building project..."
npm run build

# Run the demo
echo "Running embedding service demo..."
npx ts-node src/examples/embedding-service-demo.ts 