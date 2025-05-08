#!/bin/bash

# Test script for Topic Extraction (Milestone 3.1)
echo "Running tests for Topic Extraction (Milestone 3.1)"

# Run jest tests for topic extraction components
npx jest src/langgraph/agentic-meeting-analysis/tests/topic-extraction.test.ts
npx jest src/langgraph/agentic-meeting-analysis/tests/topic-visualization.test.ts

# Run the demo
echo "Running topic extraction demo"
node dist/langgraph/agentic-meeting-analysis/examples/topic-extraction-demo.js

echo "Tests completed" 