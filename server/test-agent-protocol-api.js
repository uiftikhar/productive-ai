/**
 * Test script for Agent Protocol API
 * 
 * This script tests the new Agent Protocol API endpoints for meeting analysis
 * 
 * Run with: node test-agent-protocol-api.js
 */

const fetch = require('node-fetch');

// Sample meeting transcript for testing
const SAMPLE_TRANSCRIPT = `
John: Good morning everyone, let's get started with our project status update meeting.
Sarah: Hi team, I've completed the frontend dashboard and it's ready for review.
Michael: Great work Sarah! I've been working on the backend API and it's about 80% complete.
John: That sounds promising. What's the status on the database migration?
Michael: We're still waiting on the DevOps team to provision the new database instance.
Sarah: I can help with some of the migration scripts once the instance is ready.
John: Perfect, that would be helpful. Let's also discuss the upcoming client demo next week.
Sarah: I think we should prepare a slide deck highlighting the key features we've implemented.
Michael: Agreed, and we should also schedule a dry run before the actual demo.
John: Good point. I'll create the slide deck and share it with the team by Thursday.
Sarah: I'll handle the feature documentation part.
Michael: And I'll make sure the demo environment is stable and all APIs are functioning correctly.
John: Great! Any blockers or issues we need to address?
Michael: The authentication service is a bit unstable, but I'm working with the security team to resolve it.
Sarah: No blockers from my side, but I need Michael's API documentation to complete the UI integration.
Michael: I'll send that over to you by tomorrow morning, Sarah.
John: Perfect! Let's assign action items. Michael, please finalize the API by Friday.
Michael: Understood, I'll get it done.
John: Sarah, please complete the UI integration once you have Michael's documentation.
Sarah: Will do, I should be able to finish it by Monday.
John: And I'll prepare the slide deck and coordinate with the client for the demo.
John: Any other items we need to discuss?
Sarah: That covers everything from my side.
Michael: I'm good too.
John: Alright, let's wrap up. Thanks everyone for the update!
`;

const API_URL = 'http://localhost:3001';

/**
 * Test the Agent Protocol API
 */
async function testAgentProtocolApi() {
  console.log('Starting Agent Protocol API test');
  
  try {
    // Create a test meeting ID
    const meetingId = `test-meeting-${Date.now()}`;
    
    console.log(`Testing meeting analysis for meeting ID: ${meetingId}`);
    
    // Step 1: Start meeting analysis
    console.log('Starting meeting analysis...');
    const analysisResponse = await fetch(`${API_URL}/api/analysis/meetings/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        meetingId,
        transcript: SAMPLE_TRANSCRIPT,
        title: 'Project Status Update',
        participants: [
          { id: 'john', name: 'John', role: 'Project Manager' },
          { id: 'sarah', name: 'Sarah', role: 'Frontend Developer' },
          { id: 'michael', name: 'Michael', role: 'Backend Developer' }
        ]
      })
    });
    
    if (!analysisResponse.ok) {
      throw new Error(`Failed to start analysis: ${analysisResponse.status} ${analysisResponse.statusText}`);
    }
    
    const analysisResult = await analysisResponse.json();
    console.log('Analysis started:', analysisResult);
    
    const { executionId } = analysisResult;
    
    // Step 2: Poll for status until completed
    console.log('Polling for status...');
    let status = 'scheduled';
    let attempts = 0;
    const maxAttempts = 30;
    
    while (!['completed', 'failed', 'canceled'].includes(status) && attempts < maxAttempts) {
      // Wait 2 seconds between polls
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get status
      const statusResponse = await fetch(`${API_URL}/api/analysis/meetings/${meetingId}/status?executionId=${executionId}`);
      
      if (!statusResponse.ok) {
        throw new Error(`Failed to get status: ${statusResponse.status} ${statusResponse.statusText}`);
      }
      
      const statusResult = await statusResponse.json();
      status = statusResult.status;
      
      console.log(`Status check (${attempts + 1}): ${status}, progress: ${statusResult.progress || 0}%`);
      
      attempts++;
    }
    
    // Step 3: Get results
    if (status === 'completed') {
      console.log('Analysis completed, getting results...');
      const resultResponse = await fetch(`${API_URL}/api/analysis/meetings/${meetingId}/result?executionId=${executionId}`);
      
      if (!resultResponse.ok) {
        throw new Error(`Failed to get results: ${resultResponse.status} ${resultResponse.statusText}`);
      }
      
      const result = await resultResponse.json();
      console.log('Analysis results:', JSON.stringify(result, null, 2));
      
      // Test cancel endpoint on a completed run (should fail)
      try {
        console.log('Testing cancel endpoint on completed run (should fail)...');
        const cancelResponse = await fetch(`${API_URL}/api/analysis/meetings/${meetingId}/cancel`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            executionId
          })
        });
        
        const cancelResult = await cancelResponse.json();
        console.log('Cancel result:', cancelResult);
      } catch (error) {
        console.log('Expected error canceling completed run:', error.message);
      }
    } else {
      console.log(`Analysis did not complete: status = ${status}`);
    }
    
    // Test starting a new analysis to test cancel
    console.log('Starting another analysis to test cancellation...');
    const cancelTestMeetingId = `cancel-test-${Date.now()}`;
    const newAnalysisResponse = await fetch(`${API_URL}/api/analysis/meetings/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        meetingId: cancelTestMeetingId,
        transcript: SAMPLE_TRANSCRIPT,
        title: 'Meeting to Cancel'
      })
    });
    
    const newAnalysisResult = await newAnalysisResponse.json();
    console.log('Second analysis started:', newAnalysisResult);
    
    // Wait a moment then cancel
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Try to cancel the run
    console.log('Canceling the second analysis...');
    const cancelResponse = await fetch(`${API_URL}/api/analysis/meetings/${cancelTestMeetingId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        executionId: newAnalysisResult.executionId
      })
    });
    
    const cancelResult = await cancelResponse.json();
    console.log('Cancel result:', cancelResult);
    
    console.log('Agent Protocol API test completed successfully');
  } catch (error) {
    console.error('Error in Agent Protocol API test:', error);
  }
}

// Run the test
testAgentProtocolApi().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 