// Simple test script for visualization generator
const fs = require('fs');
const path = require('path');

// Mock the visualization data
const testState = {
  runId: 'test-run-123',
  status: 'completed',
  meetingId: 'meeting-123',
  transcript: 'This is a sample meeting transcript',
  meetingTitle: 'Test Meeting',
  participantIds: ['user1', 'user2', 'user3'],
  userId: 'user1',
  chunks: ['chunk1', 'chunk2', 'chunk3'],
  currentChunkIndex: 3,
  partialAnalyses: ['analysis1', 'analysis2', 'analysis3'],
  analysisResult: {
    summary: 'This is a summary of the meeting',
    topics: ['Topic 1', 'Topic 2', 'Topic 3'],
    actionItems: ['Action 1', 'Action 2', 'Action 3']
  },
  startTime: Date.now() - 60000, // 1 minute ago
  endTime: Date.now(),
  metrics: {
    tokensUsed: 1234,
    executionTimeMs: 60000
  }
};

// Mock the logger
const logger = {
  info: console.log,
  debug: console.log,
  warn: console.warn,
  error: console.error
};

// Generate the HTML directly
function generateVisualization() {
  try {
    // Ensure directory exists
    const visualizationsPath = 'test-visualizations';
    const dirPath = path.join(process.cwd(), visualizationsPath);
    
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    
    // Get the template content
    const templatePath = path.join(__dirname, 'src', 'langgraph', 'core', 'utils', 'graph-html-template.ts');
    let templateContent = fs.readFileSync(templatePath, 'utf8');
    
    // Extract the function content - simple approach
    const functionStart = templateContent.indexOf('return `');
    const functionEnd = templateContent.lastIndexOf('`;');
    
    if (functionStart === -1 || functionEnd === -1) {
      throw new Error('Could not find template in file');
    }
    
    let template = templateContent.substring(functionStart + 8, functionEnd);
    
    // Replace variables
    template = template.replace('${title}', 'Workflow Visualization: ' + testState.runId);
    template = template.replace('${stateJSON}', JSON.stringify(testState, null, 2));
    
    // Write to file
    const fileName = `${testState.runId}.html`;
    const filePath = path.join(dirPath, fileName);
    fs.writeFileSync(filePath, template, 'utf8');
    
    console.log(`Visualization generated at: ${filePath}`);
    return `/${visualizationsPath}/${fileName}`;
  } catch (error) {
    console.error('Error generating visualization:', error);
    return null;
  }
}

// Run the test
const result = generateVisualization();
console.log('Visualization URL:', result); 