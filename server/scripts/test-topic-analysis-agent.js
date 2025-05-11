/**
 * Test script for the Topic Analysis Agent
 * 
 * This script allows testing the TopicAnalysisAgent directly with a sample meeting transcript.
 * 
 * Usage:
 *   node scripts/test-topic-analysis-agent.js [--mock] [--verbose] [--transcript=<path>]
 * 
 * Options:
 *   --mock      Use mock mode (default: true)
 *   --verbose   Enable verbose logging
 *   --transcript=<path>  Path to a transcript file to use (default: uses built-in sample)
 */

// Set NODE_ENV to development to enable better error messages
process.env.NODE_ENV = 'development';

// Handle command line arguments
const args = process.argv.slice(2);
const useMockMode = args.includes('--no-mock') ? false : true;
const verbose = args.includes('--verbose');
const transcriptArg = args.find(arg => arg.startsWith('--transcript='));
const transcriptPath = transcriptArg ? transcriptArg.split('=')[1] : null;

// Import required modules
const fs = require('fs');
const path = require('path');
const { ConsoleLogger } = require('../dist/src/shared/logger/console-logger');
const { TopicAnalysisAgent } = require('../dist/src/langgraph/agentic-meeting-analysis/agents/topic/topic-analysis-agent');
const { OpenAIConnector } = require('../dist/src/connectors/openai-connector');
const { AgentConfigService } = require('../dist/src/shared/config/agent-config.service');
const { AgentExpertise, AnalysisGoalType, AnalysisTaskStatus } = require('../dist/src/langgraph/agentic-meeting-analysis/interfaces/agent.interface');

// Create logger
const logger = new ConsoleLogger();
logger.setVerbose(verbose);

/**
 * Sample meeting transcript
 */
const SAMPLE_TRANSCRIPT = `
Sarah (CEO): Good morning everyone. Today we need to discuss the Q3 product roadmap and make some decisions about resource allocation.

Michael (Product): I've analyzed user feedback from the last release. Users are asking for better mobile support and more intuitive UI.

Jane (Engineering): My team can work on the mobile improvements, but we'll need to delay the API upgrade if we prioritize that.

Sarah (CEO): What's the timeline impact if we delay the API work?

Jane (Engineering): About 2 months, but mobile improvements could be delivered in 6 weeks.

Michael (Product): Mobile should be our focus - metrics show 60% of users now access via mobile.

Tom (Marketing): I agree with Michael. Our competitors are all mobile-first now, and we're falling behind.

Sarah (CEO): Alright, let's prioritize mobile for Q3. Jane, please prepare a detailed plan by next week.

Jane (Engineering): Will do. I'll need some input from the UX team though.

Sarah (CEO): Good point. Tom, can you make sure the UX team is available to work with Jane?

Tom (Marketing): Yes, I'll coordinate with them. Also, we should prepare an announcement about this mobile focus for our customers.

Sarah (CEO): Great idea. Draft something and we'll review it next week. Anything else we need to cover?

Michael (Product): Just a reminder that we need to decide on the pricing model changes before the end of the month.

Sarah (CEO): Let's schedule a separate meeting for that - it deserves its own discussion. I'll send out an invite.

Tom (Marketing): Sounds good.

Sarah (CEO): Alright, thanks everyone. Action items: Jane to prepare mobile implementation plan, Tom to coordinate with UX and draft customer announcement, and I'll schedule the pricing discussion.
`;

/**
 * Read a transcript file
 */
function readTranscriptFile(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    logger.error(`Error reading transcript file: ${error.message}`);
    process.exit(1);
  }
}

/**
 * Parse transcript into segments
 */
function parseTranscript(transcript) {
  // Simple parser for "Speaker: Text" format
  const segments = [];
  const lines = transcript.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    const match = line.match(/^(.+?):\s+(.+)$/);
    if (match) {
      const [_, speaker, content] = match;
      segments.push({
        id: `seg-${segments.length + 1}`,
        speakerId: speaker.toLowerCase().replace(/[^a-z0-9]/g, ''),
        speakerName: speaker,
        content: content.trim()
      });
    }
  }
  
  return segments;
}

/**
 * Run the test
 */
async function runTest() {
  try {
    logger.info(`Running Topic Analysis Agent test in ${useMockMode ? 'MOCK' : 'REAL API'} mode`);
    
    // Read transcript from file or use sample
    const transcriptText = transcriptPath 
      ? readTranscriptFile(transcriptPath)
      : SAMPLE_TRANSCRIPT;
    
    logger.info(`Using transcript with ${transcriptText.split('\n').filter(l => l.trim()).length} lines`);
    
    // Parse transcript into segments
    const segments = parseTranscript(transcriptText);
    logger.info(`Parsed ${segments.length} segments from transcript`);
    
    // Initialize the config service
    const configService = AgentConfigService.getInstance();
    configService.updateConfig({
      useMockMode,
      openai: {
        ...configService.getOpenAIConfig(),
        modelName: process.env.OPENAI_MODEL_NAME || 'gpt-3.5-turbo'
      }
    });
    
    // Create OpenAI connector
    const openAiConnector = new OpenAIConnector({
      logger,
      modelConfig: configService.getOpenAIConfig()
    });
    
    // Create the agent
    const agent = new TopicAnalysisAgent({
      name: 'Topic Analysis Agent',
      expertise: [AgentExpertise.TOPIC_ANALYSIS],
      capabilities: [AnalysisGoalType.EXTRACT_TOPICS],
      logger,
      openAiConnector,
      useMockMode,
      enableKeywordExtraction: true,
      enableTopicSegmentation: true
    });
    
    logger.info(`Created agent with ID: ${agent.id}`);
    
    // Create a task for the agent
    const task = {
      id: `task-${Date.now()}`,
      type: AnalysisGoalType.EXTRACT_TOPICS,
      status: AnalysisTaskStatus.PENDING,
      priority: 1,
      created: Date.now(),
      updated: Date.now(),
      input: {
        transcript: {
          meetingId: `meeting-${Date.now()}`,
          rawText: transcriptText,
          segments
        },
        metadata: {
          title: 'Test Meeting',
          participants: segments
            .map(s => s.speakerName)
            .filter((v, i, a) => a.indexOf(v) === i) // Unique values
            .map(name => ({
              id: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
              name
            }))
        }
      }
    };
    
    // Process the task
    logger.info('Processing topic analysis task...');
    const startTime = Date.now();
    const result = await agent.processTask(task);
    const endTime = Date.now();
    
    // Print results
    logger.info(`Analysis completed in ${(endTime - startTime) / 1000} seconds`);
    logger.info(`Found ${result.content.topics.length} topics with confidence: ${result.confidence}`);
    
    console.log('\n=== TOPICS ===');
    result.content.topics.forEach((topic, index) => {
      console.log(`\n[${index + 1}] ${topic.name} (relevance: ${topic.relevance.toFixed(2)})`);
      console.log(`    ${topic.description}`);
      if (topic.keywords && topic.keywords.length) {
        console.log(`    Keywords: ${topic.keywords.join(', ')}`);
      }
    });
    
    console.log('\n=== REASONING ===');
    console.log(result.reasoning);
    
    // Print token usage if not in mock mode
    if (!useMockMode) {
      const tokenUsage = agent.getTokenUsage();
      console.log('\n=== TOKEN USAGE ===');
      console.log(`Prompt tokens: ${tokenUsage.prompt}`);
      console.log(`Completion tokens: ${tokenUsage.completion}`);
      console.log(`Total tokens: ${tokenUsage.total}`);
      console.log(`Estimated cost: $${(tokenUsage.prompt * 0.0000001 + tokenUsage.completion * 0.0000002).toFixed(4)}`);
    }
    
    logger.info('Test completed successfully');
  } catch (error) {
    logger.error(`Test failed: ${error.message}`);
    logger.error(error.stack);
    process.exit(1);
  }
}

// Run the test
runTest(); 