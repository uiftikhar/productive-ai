# Chat Interface Test

This test script demonstrates how to use the chat interface API to interact with the hierarchical agent system.

## Overview

The test uses MSW (Mock Service Worker) to mock the API responses, simulating the complete flow of the hierarchical supervisor-manager-worker architecture for meeting analysis. The test covers:

1. Creating a chat session
2. Uploading a transcript for analysis
3. Monitoring the hierarchical analysis progress
4. Querying the analysis results through chat
5. Verifying the conversation history

## Setup

Before running the test, ensure you have the necessary dependencies installed:

```bash
# Install MSW and other required dependencies
npm run setup:mocks
# or
yarn setup:mocks
```

## Running the Test

To run the test:

```bash
npm run test:chat
# or
yarn test:chat
```

## Test Flow

The test simulates the following flow:

1. **Session Creation**: Creates a new chat session with the system
2. **Transcript Upload**: Uploads a sample meeting transcript for analysis
3. **Hierarchical Analysis**:
   - Simulates the supervisor agent delegating tasks
   - Simulates manager agents coordinating worker agents
   - Simulates the progressive analysis of the transcript
4. **Analysis Querying**:
   - Sends questions about topics discussed
   - Sends questions about action items
   - Sends questions about key decisions
5. **Conversation Verification**:
   - Checks that all messages were properly recorded
   - Verifies system notifications about the analysis

## Hierarchical Architecture

This test aligns with the hierarchical agent architecture described in the documentation:

### Supervisor Layer
- Orchestrates the entire analysis
- Makes high-level decisions about task decomposition
- Monitors overall progress

### Manager Layer
- Specializes in specific domains (content, participants, action items)
- Coordinates related worker agents
- Aggregates results from workers

### Worker Layer
- Performs specific, focused tasks
- Extracts detailed information from the transcript
- Reports results back to managers

## Customizing the Test

You can customize the test by:

1. Modifying the `SAMPLE_TRANSCRIPT` variable with different meeting content
2. Adjusting the timing of status checks to simulate faster/slower analysis
3. Adding different types of queries to test the system's understanding

## Mocked vs. Real Implementation

The test uses MSW to mock the API responses, but the mock implementation closely mimics the behavior of the real hierarchical agent system as described in the architecture documentation.

In a real implementation:
- The supervisor agent would decompose the analysis task and delegate to managers
- Manager agents would coordinate worker agents for specialized analysis
- Workers would extract information and generate insights
- Results would be progressively synthesized up the hierarchy

The test simulates this entire process through the mock handlers while maintaining the same API contract. 