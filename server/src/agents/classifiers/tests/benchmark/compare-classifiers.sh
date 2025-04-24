#!/bin/bash

# Script to run classifier comparison benchmark

echo "Running classifier comparison benchmark..."
npx ts-node -T src/agents/classifiers/tests/benchmark/compare-classifiers.ts 