const fs = require('fs');
const path = require('path');
const http = require('http');

// Get the visualization filename from the visualizations directory
const visualizationsPath = path.join(process.cwd(), 'visualizations');
const files = fs.readdirSync(visualizationsPath);
const htmlFiles = files.filter(file => file.endsWith('.html'));

if (htmlFiles.length === 0) {
  console.error('No HTML visualization files found in:', visualizationsPath);
  process.exit(1);
}

// Use the first HTML file for testing
const testFile = htmlFiles[0];
console.log('Testing access to visualization file:', testFile);

// Create a simple HTTP request to test if the file is accessible
const options = {
  hostname: 'localhost',
  port: process.env.PORT || 3000,
  path: `/visualizations/${testFile}`,
  method: 'GET'
};

const req = http.request(options, (res) => {
  console.log(`Status Code: ${res.statusCode}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('Visualization is accessible!');
      // Check if it contains visualization content
      if (data.includes('LangGraphViz') && data.includes('drawGraph')) {
        console.log('Visualization content is valid!');
      } else {
        console.error('Visualization content does not appear to be a LangGraph visualization');
      }
    } else {
      console.error('Failed to access visualization:', res.statusCode);
      console.error('Response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('Error testing visualization access:', error.message);
});

req.end(); 