/**
 * Test script for action item processing
 * 
 * This script demonstrates how to use the action item processing API to extract
 * action items from meeting transcripts, resolve assignees, and integrate with
 * external systems.
 * 
 * IMPORTANT: This script requires the server to be running separately.
 * Start the server with 'yarn start' before running this test.
 */

const axios = require('axios');

// Configuration
const API_URL = 'http://localhost:3000';
const API_VERSION = 'v1';

// API endpoints
const ENDPOINTS = {
  processTranscript: `${API_URL}/api/${API_VERSION}/action-items/process`,
  getMeetingActionItems: `${API_URL}/api/${API_VERSION}/action-items`,
  updateActionItemStatus: `${API_URL}/api/${API_VERSION}/action-items`,
  resolveAssignee: `${API_URL}/api/${API_VERSION}/action-items/resolve-assignee`,
  setupIntegration: `${API_URL}/api/${API_VERSION}/action-items/integration/setup`,
  syncActionItems: `${API_URL}/api/${API_VERSION}/action-items/integration/sync`
};

// Sample data
const SAMPLE_USER_ID = 'test-user-123';
const SAMPLE_MEETING_ID = `meeting-${Date.now()}`;
const SAMPLE_MEETING_DATE = new Date().toISOString();

// Sample transcript with action items
const SAMPLE_TRANSCRIPT = `
Alex: Hello everyone, welcome to our product planning meeting.
Sarah: Thanks Alex. I think we should start by discussing the upcoming release.
Alex: Great idea. Based on the customer feedback, we need to prioritize the new dashboard feature.
Mike: I agree. I can work on the design for that.
Sarah: That's perfect. Mike, could you please create wireframes for the dashboard by next Friday?
Mike: Yes, I'll do that.
Alex: Great. John, I'd like you to research the competitor products and provide a comparison report.
John: Will do. When do you need it by?
Alex: Let's say within two weeks. It's important but not urgent.
Sarah: Perfect. I'll take the lead on coordinating with the marketing team for the launch.
Alex: Thank you, Sarah. I think we all need to update our project plans by end of this week.
Alex: Oh, and one more thing - we need to schedule a review meeting with the stakeholders. Emily, can you set this up for next month?
Emily: Sure, I'll send out calendar invites by tomorrow.
Mike: Should I also include the mobile mockups in my wireframes?
Alex: Yes, that would be great. Actually, that's a critical priority - we need those mobile mockups ASAP.
Sarah: Action item for me: draft the press release by next Wednesday.
Alex: Let's wrap up. Everyone please submit your status reports by Monday EOD.
`;

// Sample organizational data
const SAMPLE_ORG_DATA = [
  {
    id: 'user1',
    firstName: 'Alex',
    lastName: 'Johnson',
    fullName: 'Alex Johnson',
    email: 'alex.johnson@example.com',
    role: 'Product Manager',
    department: 'Product'
  },
  {
    id: 'user2',
    firstName: 'Sarah',
    lastName: 'Williams',
    fullName: 'Sarah Williams',
    email: 'sarah.williams@example.com',
    role: 'Marketing Director',
    department: 'Marketing'
  },
  {
    id: 'user3',
    firstName: 'Mike',
    lastName: 'Davis',
    fullName: 'Mike Davis',
    email: 'mike.davis@example.com',
    role: 'UI Designer',
    department: 'Design',
    aliases: ['Michael']
  },
  {
    id: 'user4',
    firstName: 'John',
    lastName: 'Smith',
    fullName: 'John Smith',
    email: 'john.smith@example.com',
    role: 'Product Analyst',
    department: 'Product'
  },
  {
    id: 'user5',
    firstName: 'Emily',
    lastName: 'Brown',
    fullName: 'Emily Brown',
    email: 'emily.brown@example.com',
    role: 'Executive Assistant',
    department: 'Operations'
  }
];

// Test functions
async function testProcessTranscript() {
  console.log('Testing action item extraction from transcript...');
  
  try {
    const response = await axios.post(ENDPOINTS.processTranscript, {
      userId: SAMPLE_USER_ID,
      meetingId: SAMPLE_MEETING_ID,
      transcript: SAMPLE_TRANSCRIPT,
      meetingDate: SAMPLE_MEETING_DATE,
      organizationalData: SAMPLE_ORG_DATA,
      participantIds: SAMPLE_ORG_DATA.map(user => user.id)
    });
    
    console.log(`Successfully extracted ${response.data.actionItems.length} action items`);
    console.log('\nAction Items:');
    
    response.data.actionItems.forEach((item, index) => {
      console.log(`\n${index + 1}. ${item.content}`);
      console.log(`   Assignee: ${item.assignee || 'Unassigned'}`);
      console.log(`   Deadline: ${item.deadline ? new Date(item.deadline).toLocaleDateString() : 'No deadline'}`);
      console.log(`   Priority: ${item.priority || 'Not specified'}`);
      console.log(`   Confidence: ${(item.confidence * 100).toFixed(0)}%`);
      console.log(`   Method: ${item.extractionMethod}`);
    });
    
    return response.data.actionItems;
  } catch (error) {
    console.error('Error processing transcript:', error.response?.data || error.message);
    return [];
  }
}

async function testGetActionItems(meetingId) {
  console.log('\nTesting retrieval of action items...');
  
  try {
    const response = await axios.get(`${ENDPOINTS.getMeetingActionItems}/${SAMPLE_USER_ID}/${meetingId}`);
    
    console.log(`Successfully retrieved ${response.data.actionItems.length} action items`);
    
    return response.data.actionItems;
  } catch (error) {
    console.error('Error getting action items:', error.response?.data || error.message);
    return [];
  }
}

async function testUpdateActionItemStatus(actionItemId, meetingId) {
  console.log('\nTesting update of action item status...');
  
  try {
    const response = await axios.put(`${ENDPOINTS.updateActionItemStatus}/${SAMPLE_USER_ID}/${actionItemId}/status`, {
      status: 'completed',
      meetingId
    });
    
    console.log(`Successfully updated action item status: ${JSON.stringify(response.data)}`);
    
    return response.data;
  } catch (error) {
    console.error('Error updating action item:', error.response?.data || error.message);
    return null;
  }
}

async function testResolveAssignee() {
  console.log('\nTesting assignee resolution...');
  
  try {
    const response = await axios.post(ENDPOINTS.resolveAssignee, {
      assigneeText: 'Mike',
      selectedUserId: 'user3',
      meetingId: SAMPLE_MEETING_ID
    });
    
    console.log(`Successfully resolved assignee: ${JSON.stringify(response.data)}`);
    
    return response.data;
  } catch (error) {
    console.error('Error resolving assignee:', error.response?.data || error.message);
    return null;
  }
}

// Run the tests
async function runTests() {
  console.log('Starting action item processing tests...');
  
  // 1. Extract action items from transcript
  const actionItems = await testProcessTranscript();
  
  if (actionItems.length === 0) {
    console.log('No action items extracted, skipping remaining tests');
    return;
  }
  
  // 2. Get action items for the meeting
  // await testGetActionItems(SAMPLE_MEETING_ID);
  
  // 3. Update status of the first action item
  // if (actionItems.length > 0) {
  //   await testUpdateActionItemStatus(actionItems[0].id, SAMPLE_MEETING_ID);
  // }
  
  // 4. Test assignee resolution
  // await testResolveAssignee();
  
  // Note: We're not testing integration setup and sync in this basic test
  // as they require actual external service credentials
  
  console.log('\nTests completed');
}

// Run the tests
runTests().catch(err => {
  console.error('Error running tests:', err);
}); 