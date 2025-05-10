/**
 * Test script to verify both route patterns are working for meeting analysis API
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
        console.log('Error:', text);
      }
    } catch (error) {
      console.error(`Error testing ${testPath}:`, error.message);
    }
    
    console.log('----------------------------------------');
  }
}

// Main test function
async function runTests() {
  console.log('=== MEETING ANALYSIS API ROUTE TEST ===');
  
  // Test listing sessions
  await testEndpoint('');
  
  // Test creating a session
  await testEndpoint('', 'POST', {
    analysisGoal: 'MEETING_SUMMARY',
    enabledExpertise: ['GENERAL']
  });
  
  // Test getting a specific session (this might 404 if no actual session with this ID exists)
  await testEndpoint(`/${TEST_SESSION_ID}`);
  
  // Test the analyze endpoint (this will 404 if the session doesn't exist)
  await testEndpoint(`/${TEST_SESSION_ID}/analyze`, 'POST', {
    transcript: 'This is a test transcript for meeting analysis.'
  });
  
  console.log('=== TEST COMPLETE ===');
}

// Run tests
runTests(); 