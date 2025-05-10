/**
 * Test script to verify direct routes to meeting analysis controller
 * This tests the routes that are directly registered in server.ts
 */
const fetch = require('node-fetch');

// Base URL and test session ID
const BASE_URL = 'http://localhost:3001';
const TEST_SESSION_ID = 'test-session-' + Date.now();

// Function to test a specific endpoint with both path patterns
async function testEndpoint(path, method = 'GET', body = null) {
  const paths = [
    `/api/analysis/sessions${path}`,
    `/api/v1/analysis/sessions${path}`
  ];
  
  console.log(`\nTesting endpoint: ${path}`);
  console.log('----------------------------------------');
  
  for (const testPath of paths) {
    try {
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      if (body) {
        options.body = JSON.stringify(body);
      }
      
      console.log(`${method} ${BASE_URL}${testPath}`);
      const response = await fetch(`${BASE_URL}${testPath}`, options);
      const status = response.status;
      
      console.log(`Status: ${status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2).substring(0, 200) + '...');
      } else {
        const text = await response.text();
        console.log('Error:', text.substring(0, 200) + (text.length > 200 ? '...' : ''));
      }
    } catch (error) {
      console.error(`Error testing ${testPath}:`, error.message);
    }
    
    console.log('----------------------------------------');
  }
}

// Main test function
async function runTests() {
  console.log('=== MEETING ANALYSIS DIRECT ROUTES TEST ===');
  
  // Test listing sessions
  await testEndpoint('');
  
  // Test creating a session
  console.log('\nCreating a test session...');
  const createResponse = await fetch(`${BASE_URL}/api/analysis/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      analysisGoal: 'MEETING_SUMMARY',
      enabledExpertise: ['GENERAL']
    })
  });
  
  let sessionId = TEST_SESSION_ID;
  if (createResponse.ok) {
    const data = await createResponse.json();
    sessionId = data.data?.sessionId || TEST_SESSION_ID;
    console.log(`Created session: ${sessionId}`);
  } else {
    console.log('Failed to create session, using fallback ID');
  }
  
  // Test getting a specific session
  await testEndpoint(`/${sessionId}`);
  
  // Test the analyze endpoint 
  await testEndpoint(`/${sessionId}/analyze`, 'POST', {
    transcript: 'This is a test transcript for meeting analysis. We discussed project updates, timeline, and budget concerns.'
  });
  
  // Wait for processing
  console.log('\nWaiting for analysis to complete...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Test results endpoint
  await testEndpoint(`/${sessionId}/results`);
  
  console.log('=== TEST COMPLETE ===');
}

// Run tests
runTests(); 