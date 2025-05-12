/**
 * Test script for API access using the Agent Protocol
 * 
 * This script tests the client-side API integration with the Agent Protocol
 * 
 * Run with: node test-api-access.js
 */

const { AgentProtocolService } = require('./src/lib/api/agent-protocol-service');

// Sample meeting transcript for testing
const SAMPLE_TRANSCRIPT = `
John: Good morning everyone, let's get started with our project status update meeting.
Sarah: Hi team, I've completed the frontend dashboard and it's ready for review.
Michael: Great work Sarah! I've been working on the backend API and it's about 80% complete.
John: That sounds promising. What's the status on the database migration?
Michael: We're still waiting on the DevOps team to provision the new database instance.
Sarah: I can help with some of the migration scripts once the instance is ready.
John: Perfect, that would be helpful. Let's also discuss the upcoming client demo next week.
`;

// Create an instance of the service
const agentProtocolService = new AgentProtocolService();

/**
 * Test the Agent Protocol API directly from the client code
 */
async function testAgentProtocolFromClient() {
  console.log('Starting Client-side Agent Protocol API test');
  
  try {
    // Create a test meeting ID
    const meetingId = `client-test-${Date.now()}`;
    
    console.log(`Testing meeting analysis for meeting ID: ${meetingId}`);
    
    // Step 1: Start meeting analysis
    console.log('Starting meeting analysis...');
    const analysisResponse = await agentProtocolService.analyzeMeeting({
      meetingId,
      transcript: SAMPLE_TRANSCRIPT,
      title: 'Client-side Test Meeting'
    });
    
    console.log('Analysis started:', analysisResponse);
    
    const { executionId } = analysisResponse;
    
    // Step 2: Poll for status until completed
    console.log('Polling for status...');
    let status = 'scheduled';
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!['completed', 'failed', 'canceled'].includes(status) && attempts < maxAttempts) {
      // Wait 2 seconds between polls
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get status
      const statusResponse = await agentProtocolService.getAnalysisStatus(meetingId, executionId);
      status = statusResponse.status;
      
      console.log(`Status check (${attempts + 1}): ${status}, progress: ${statusResponse.progress || 0}%`);
      
      attempts++;
    }
    
    // Step 3: Get results
    if (status === 'completed') {
      console.log('Analysis completed, getting results...');
      const resultResponse = await agentProtocolService.getAnalysisResults(meetingId, executionId);
      
      console.log('Analysis results:', JSON.stringify(resultResponse, null, 2));
    } else {
      console.log(`Analysis did not complete within timeout: status = ${status}`);
    }
    
    console.log('Client-side Agent Protocol API test completed');
  } catch (error) {
    console.error('Error in client-side Agent Protocol API test:', error);
  }
}

// Run the test
testAgentProtocolFromClient().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 