#!/bin/bash

SERVER_PORT=3001
API_BASE_URL="http://localhost:${SERVER_PORT}/api/v1/analysis"

# Start server in background
echo "Starting server in background..."
node dist/server.js &
SERVER_PID=$!

# Wait for server to start
echo "Waiting for server to start..."
sleep 3

# Function to test an endpoint
test_endpoint() {
  local method=$1
  local endpoint=$2
  local data=$3
  local description=$4
  
  echo -e "\n\n[$method] $endpoint - $description"
  
  if [ "$method" == "GET" ]; then
    curl -s -X GET "${API_BASE_URL}${endpoint}" | jq
  elif [ "$method" == "POST" ]; then
    curl -s -X POST "${API_BASE_URL}${endpoint}" \
      -H "Content-Type: application/json" \
      -d "$data" | jq
  elif [ "$method" == "DELETE" ]; then
    curl -s -X DELETE "${API_BASE_URL}${endpoint}" | jq
  fi
  
  # Small delay between requests
  sleep 1
}

# Get sessions list
test_endpoint "GET" "/sessions" "" "List all sessions"

# Create a new session
echo -e "\n\nCreating a new session..."
SESSION_RESPONSE=$(curl -s -X POST "${API_BASE_URL}/sessions" \
  -H "Content-Type: application/json" \
  -d '{"analysisGoal": "MEETING_SUMMARY", "enabledExpertise": ["GENERAL"]}')

echo "$SESSION_RESPONSE" | jq

# Extract session ID
SESSION_ID=$(echo "$SESSION_RESPONSE" | jq -r '.data.sessionId')
echo "Created session: $SESSION_ID"

if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" == "null" ]; then
  echo "Error: Could not create session. Exiting."
  kill $SERVER_PID
  exit 1
fi

# Get session status
test_endpoint "GET" "/sessions/${SESSION_ID}" "" "Get session status"

# Submit transcript for analysis
test_endpoint "POST" "/sessions/${SESSION_ID}/analyze" \
  '{"transcript": "This is a test meeting transcript. We discussed project updates, timeline, and budget concerns."}' \
  "Submit transcript for analysis"

# Allow some time for processing
echo -e "\n\nWaiting for analysis to complete..."
sleep 3

# Get analysis results
test_endpoint "GET" "/sessions/${SESSION_ID}/results" "" "Get analysis results"

# Delete the session
test_endpoint "DELETE" "/sessions/${SESSION_ID}" "" "Delete session"

# Final verification - list sessions again
test_endpoint "GET" "/sessions" "" "Verify session list after deletion"

# Kill server
echo -e "\n\nKilling server..."
kill $SERVER_PID 