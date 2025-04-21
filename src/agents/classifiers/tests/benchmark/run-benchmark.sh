#!/bin/bash

# Script to run classifier benchmarks

# Default to OpenAI if no args provided
CLASSIFIER=${1:-openai}

# Check if classifier is valid
if [[ "$CLASSIFIER" != "openai" && "$CLASSIFIER" != "bedrock" ]]; then
  echo "Invalid classifier specified. Use 'openai' or 'bedrock'."
  exit 1
fi

# Run the benchmark through ts-node
echo "Running benchmark for $CLASSIFIER classifier..."
npx ts-node -T src/agents/classifiers/tests/benchmark/run-benchmark.ts $CLASSIFIER 