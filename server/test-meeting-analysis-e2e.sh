#!/bin/bash

# Test script for end-to-end meeting analysis using real agents

# Set variables
PORT=3000
BASE_URL="http://localhost:$PORT"
API_PATH="/api/v1/analysis"
SESSION_ID=""

# Set text color variables
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Sample transcript
TRANSCRIPT='
Alice: Welcome everyone to our weekly project update meeting. Today, we will discuss the current progress and next steps.
Bob: Great. I have finished implementing the user authentication system.
Charlie: That is good news. I am still working on the database schema for the analytics module.
Alice: Let us set a deadline for that. Can you complete it by next Friday?
Charlie: Yes, I think that is doable. I will need to coordinate with Dave from the backend team.
Bob: Speaking of deadlines, we should also discuss the timeline for the new feature rollout.
Alice: You are right. Let us schedule a separate meeting with the product team for Thursday.
Dave: That works for me. I can present the backend architecture then.
Alice: Perfect. Any other issues we need to address today?
Charlie: Yes, we might need to revisit our budget for the external APIs we are using.
Alice: Good point. Bob, can you prepare a report on our current API usage and costs?
Bob: Sure, I will have that ready by Wednesday.
Alice: Great, I think that covers everything for today. Thank you all.
'

echo -e "${BLUE}=== Testing Meeting Analysis System ===${NC}"
echo -e "${BLUE}Using server at: ${BASE_URL}${API_PATH}${NC}"

# Function to make HTTP requests and handle responses
make_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    local response=""
    
    if [ -z "$data" ]; then
        response=$(curl -s -X "$method" "$BASE_URL$API_PATH$endpoint" -H "Content-Type: application/json")
    else
        response=$(curl -s -X "$method" "$BASE_URL$API_PATH$endpoint" -H "Content-Type: application/json" -d "$data")
    fi
    
    echo "$response"
}

# Step 1: Create an analysis session
echo -e "${YELLOW}Step 1: Creating analysis session...${NC}"
create_session_request='{
    "analysisGoal": "full_analysis",
    "enabledExpertise": ["topic_analysis", "action_item_extraction", "summary_generation"]
}'

create_session_response=$(make_request "POST" "/sessions" "$create_session_request")
echo "$create_session_response" | jq -r '.'

# Extract session ID from response
SESSION_ID=$(echo "$create_session_response" | jq -r '.data.sessionId')

if [ -z "$SESSION_ID" ] || [ "$SESSION_ID" == "null" ]; then
    echo -e "${RED}Failed to create session!${NC}"
    exit 1
fi

echo -e "${GREEN}Session created with ID: $SESSION_ID${NC}"

# Step 2: Submit transcript for analysis
echo -e "${YELLOW}Step 2: Submitting transcript for analysis...${NC}"
submit_transcript_request="{
    \"transcript\": \"$TRANSCRIPT\",
    \"message\": \"Please analyze this meeting transcript\"
}"

submit_transcript_response=$(make_request "POST" "/sessions/$SESSION_ID/analyze" "$submit_transcript_request")
echo "$submit_transcript_response" | jq -r '.'

# Check if transcript submission was successful
SUBMIT_STATUS=$(echo "$submit_transcript_response" | jq -r '.data.status')

if [ "$SUBMIT_STATUS" != "processing" ]; then
    echo -e "${RED}Failed to submit transcript!${NC}"
    exit 1
fi

echo -e "${GREEN}Transcript submitted successfully. Processing...${NC}"

# Step 3: Poll for results
echo -e "${YELLOW}Step 3: Polling for results...${NC}"
MAX_POLLS=30
poll_count=0
status="processing"

while [ "$status" = "processing" ] && [ $poll_count -lt $MAX_POLLS ]; do
    poll_count=$((poll_count + 1))
    echo -e "${BLUE}Poll attempt $poll_count of $MAX_POLLS...${NC}"
    
    results_response=$(make_request "GET" "/sessions/$SESSION_ID/results" "")
    status=$(echo "$results_response" | jq -r '.data.status')
    progress=$(echo "$results_response" | jq -r '.data.progress')
    
    echo -e "${YELLOW}Status: $status, Progress: $progress%${NC}"
    
    if [ "$status" = "completed" ]; then
        echo -e "${GREEN}Analysis completed!${NC}"
        echo -e "${BLUE}Results:${NC}"
        echo "$results_response" | jq -r '.data.results'
        break
    fi
    
    # Wait before polling again
    sleep 3
done

if [ "$status" != "completed" ]; then
    echo -e "${RED}Analysis did not complete within expected time!${NC}"
    echo -e "${YELLOW}Final status: $status${NC}"
    exit 1
fi

# Step 4: Delete the session
echo -e "${YELLOW}Step 4: Cleaning up (deleting session)...${NC}"
delete_response=$(make_request "DELETE" "/sessions/$SESSION_ID" "")
echo "$delete_response" | jq -r '.'

DELETE_STATUS=$(echo "$delete_response" | jq -r '.data.status')

if [ "$DELETE_STATUS" != "deleted" ]; then
    echo -e "${RED}Failed to delete session!${NC}"
    exit 1
fi

echo -e "${GREEN}Session deleted successfully.${NC}"
echo -e "${GREEN}Test completed successfully!${NC}" 