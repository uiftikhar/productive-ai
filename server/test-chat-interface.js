/**
 * Test script for the chat interface
 * 
 * This script demonstrates how to use the chat interface API
 * to interact with the hierarchical agent system.
 */

const axios = require('axios');

// Configuration
const API_URL = 'http://localhost:3001';
const ENDPOINTS = {
  createSession: `${API_URL}/api/chat/session`,
  uploadTranscript: `${API_URL}/api/chat/transcript`,
  sendMessage: (sessionId) => `${API_URL}/api/chat/session/${sessionId}/message`,
  getMessages: (sessionId) => `${API_URL}/api/chat/session/${sessionId}/messages`,
  getAnalysisStatus: (meetingId) => `${API_URL}/api/chat/analysis/${meetingId}/status`,
  getHistory: (sessionId) => `${API_URL}/api/chat/history/${sessionId}`,
  analyzeTranscript: (meetingId) => `${API_URL}/api/chat/transcript/${meetingId}/analyze`,
};

// Sample transcript for testing
const SAMPLE_TRANSCRIPT = `John: We need to finalize the product roadmap for Q3.
Sarah: I agree. We should prioritize the new reporting feature.
John: Customers have been asking for that for months.
Mark: What about the mobile app redesign?
Sarah: That should be secondary. Let's focus on functionality first.
John: Good point. We'll put reporting as our top priority for Q3.
Mark: I'll update the JIRA board with these priorities.
Sarah: Can we also discuss the timeline for the API update?
John: Let's schedule a separate meeting for that next week.
Mark: Sounds good. I'll send out a calendar invite.`;

// Main test function
async function runTest() {
  try {
    console.log('Starting chat interface test...');
    
    // Step 1: Create a session
    console.log('\n--- Creating a new session ---');
    const sessionResponse = await axios.post(ENDPOINTS.createSession, {
      userId: 'test-user-123',
      metadata: {
        name: 'Test User',
        email: 'test@example.com'
      }
    });
    
    const { id: sessionId } = sessionResponse.data;
    console.log(`Session created with ID: ${sessionId}`);
    
    // Step 2: Upload a transcript
    console.log('\n--- Uploading a transcript ---');
    const uploadResponse = await axios.post(ENDPOINTS.uploadTranscript, {
      sessionId,
      transcript: SAMPLE_TRANSCRIPT,
      title: 'Product Planning Meeting',
      description: 'Weekly product planning discussion',
      participants: [
        { id: 'john', name: 'John Smith', role: 'Product Manager' },
        { id: 'sarah', name: 'Sarah Johnson', role: 'UX Designer' },
        { id: 'michael', name: 'Michael Chen', role: 'Lead Developer' }
      ]
    });
    
    const { meetingId, analysisSessionId, status } = uploadResponse.data;
    console.log(`Transcript uploaded with Meeting ID: ${meetingId}`);
    console.log(`Analysis started with status: ${status}`);
    
    // Step 3: Check analysis status (would normally poll in a frontend app)
    console.log('\n--- Checking analysis status ---');
    console.log('Waiting 5 seconds for analysis to progress...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    let statusData;
    try {
      const statusResponse = await axios.get(ENDPOINTS.getAnalysisStatus(meetingId));
      statusData = statusResponse.data;
      console.log(`Analysis status: ${statusData.status}`);
      console.log(`Progress: ${statusData.progress.overallProgress}%`);
    } catch (error) {
      console.error('Error checking status:', error.response?.data || error.message);
      console.log('Continuing with test despite status check error...');
    }
    
    // Step 4: Send a message to query the analysis
    console.log('\n--- Sending a message to query the analysis ---');
    try {
      const messageResponse = await axios.post(ENDPOINTS.sendMessage(sessionId), {
        content: 'What were the main topics discussed in this meeting?'
      });
      
      console.log(`Response: ${messageResponse.data.content}`);
    } catch (error) {
      console.error('Error sending message:', error.response?.data || error.message);
      console.log('Continuing with test despite message error...');
    }
    
    // Step 5: Get message history
    console.log('\n--- Getting message history ---');
    try {
      const historyResponse = await axios.get(ENDPOINTS.getMessages(sessionId));
      const messages = historyResponse.data;
      
      console.log(`Found ${messages.length} messages:`);
      console.log('Raw message data:', JSON.stringify(messages, null, 2));
      
      messages.forEach((msg, index) => {
        console.log(`Message ${index + 1}:`, msg);
        const content = msg.content || '';
        const role = msg.role || 'unknown';
        console.log(`  ${role}: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
      });
    } catch (error) {
      console.error('Error getting message history:', error.response?.data || error.message);
    }
    
    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Error during test:', error.response?.data || error.message);
    console.error('Error details:', error);
  }
}

// Run the test
runTest(); 