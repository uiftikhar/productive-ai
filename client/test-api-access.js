// Simple test script to verify client API access
const fetch = require('node-fetch');

async function testApiAccess() {
  try {
    console.log('Testing API access...');
    
    // Try to access the meeting analysis sessions endpoint
    const response = await fetch('http://localhost:3001/api/v1/analysis/sessions', {
      headers: {
        'Content-Type': 'application/json',
        'x-bypass-auth': '1'
      }
    });
    
    if (!response.ok) {
      console.error(`Error accessing API: ${response.status} ${response.statusText}`);
      const text = await response.text();
      console.error('Response:', text);
      return;
    }
    
    const data = await response.json();
    console.log('API Response:', JSON.stringify(data, null, 2));
    console.log('API access test successful!');
  } catch (error) {
    console.error('Error testing API access:', error.message);
  }
}

testApiAccess(); 