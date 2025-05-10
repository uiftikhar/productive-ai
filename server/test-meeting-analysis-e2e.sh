#!/bin/bash

# Test script for end-to-end testing of the meeting analysis feature
# This script starts both the server and client for testing.

echo "Starting end-to-end test for Meeting Analysis API..."

# Create a trap to ensure all processes are terminated on exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT

# Start the server
echo "Starting server..."
cd "$(dirname "$0")"
npm run start:dev &
SERVER_PID=$!

# Wait for server to start
echo "Waiting for server to start (10 seconds)..."
sleep 10

# Run the test script
echo "Running test script..."
node -r ts-node/register src/test-meeting-analysis.ts

# Output links for manual testing
echo ""
echo "Server is running. You can also test manually:"
echo "- API Endpoint: http://localhost:3000/api/analysis/sessions"
echo "- Browser Test UI: http://localhost:3000/test-api/meeting-analysis"
echo ""
echo "Press Ctrl+C to stop the test server"

# Wait for user to press Ctrl+C
wait $SERVER_PID 