/**
 * Test script for validating the meeting analysis API integration
 * 
 * This script tests the end-to-end functionality of the meeting analysis feature
 * by creating a session, submitting a transcript, and retrieving results.
 * 
 * Run with: node -r ts-node/register src/test-meeting-analysis.ts
 */

import fetch from 'node-fetch';

// Configuration
const API_BASE_URL = 'http://localhost:3000/api';
const POLLING_INTERVAL = 2000; // 2 seconds

// Sample transcript
const SAMPLE_TRANSCRIPT = `
Alice: Welcome everyone to our weekly project update meeting. Today, we'll discuss the current progress and next steps.
Bob: Great. I've finished implementing the user authentication system.
Charlie: That's good news. I'm still working on the database schema for the analytics module.
Alice: Let's set a deadline for that. Can you complete it by next Friday?
Charlie: Yes, I think that's doable. I'll need to coordinate with Dave from the backend team.
Bob: Speaking of deadlines, we should also discuss the timeline for the new feature rollout.
Alice: You're right. Let's schedule a separate meeting with the product team for Thursday.
Dave: That works for me. I can present the backend architecture then.
Alice: Perfect. Any other issues we need to address today?
Charlie: Yes, we might need to revisit our budget for the external APIs we're using.
Alice: Good point. Bob, can you prepare a report on our current API usage and costs?
Bob: Sure, I'll have that ready by Wednesday.
Alice: Great, I think that covers everything for today. Thank you all.
`;

// Main test function
async function testMeetingAnalysis() {
  console.log('=== Testing Meeting Analysis API ===');
  
  try {
    // Step 1: Create a session
    console.log('\n1. Creating analysis session...');
    const sessionResponse = await fetch(`${API_BASE_URL}/analysis/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        analysisGoal: 'full_analysis',
        enabledExpertise: ['topic_analysis', 'action_item_extraction', 'summary_generation']
      })
    });
    
    if (!sessionResponse.ok) {
      throw new Error(`Failed to create session: ${sessionResponse.status} ${sessionResponse.statusText}`);
    }
    
    const sessionData = await sessionResponse.json();
    const sessionId = sessionData.data.sessionId;
    console.log(`   Session created with ID: ${sessionId}`);
    
    // Step 2: Submit transcript for analysis
    console.log('\n2. Submitting transcript for analysis...');
    const analyzeResponse = await fetch(`${API_BASE_URL}/analysis/sessions/${sessionId}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: SAMPLE_TRANSCRIPT,
        message: 'Please analyze this meeting transcript'
      })
    });
    
    if (!analyzeResponse.ok) {
      throw new Error(`Failed to submit transcript: ${analyzeResponse.status} ${analyzeResponse.statusText}`);
    }
    
    console.log('   Transcript submitted successfully');
    
    // Step 3: Poll for results
    console.log('\n3. Polling for results...');
    let isComplete = false;
    let pollCount = 0;
    
    while (!isComplete && pollCount < 30) { // Max 30 polls (60 seconds)
      pollCount++;
      
      // Wait for polling interval
      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
      
      // Check results
      const resultsResponse = await fetch(`${API_BASE_URL}/analysis/sessions/${sessionId}/results`);
      
      if (!resultsResponse.ok) {
        throw new Error(`Failed to get results: ${resultsResponse.status} ${resultsResponse.statusText}`);
      }
      
      const resultsData = await resultsResponse.json();
      const status = resultsData.data.status;
      console.log(`   Poll ${pollCount}: Status = ${status}, Progress = ${resultsData.data.progress || 0}%`);
      
      if (status === 'completed') {
        isComplete = true;
        
        // Display results
        console.log('\n4. Analysis Results:');
        console.log('   Topics:', resultsData.data.results.topics);
        console.log('   Action Items:', resultsData.data.results.actionItems.length);
        console.log('   Summary:', resultsData.data.results.summary);
        break;
      }
    }
    
    if (!isComplete) {
      console.log('\n   Analysis did not complete within the timeout period');
    }
    
    // Step 4: Clean up - Delete the session
    console.log('\n5. Cleaning up - Deleting session...');
    const deleteResponse = await fetch(`${API_BASE_URL}/analysis/sessions/${sessionId}`, {
      method: 'DELETE'
    });
    
    if (!deleteResponse.ok) {
      throw new Error(`Failed to delete session: ${deleteResponse.status} ${deleteResponse.statusText}`);
    }
    
    console.log('   Session deleted successfully');
    console.log('\n=== Test Completed Successfully ===');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testMeetingAnalysis(); 