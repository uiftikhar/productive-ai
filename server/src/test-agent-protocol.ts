/**
 * Test script for Agent Protocol implementation
 * This script tests the new Agent Protocol implementation for meeting analysis
 * 
 * Run with: ts-node src/test-agent-protocol.ts
 */

import dotenv from 'dotenv';
import { ConsoleLogger } from './shared/logger/console-logger';
import { OpenAIConnector } from './connectors/openai-connector';
import { PineconeConnector } from './connectors/pinecone-connector';
import { MeetingAnalysisAgentProtocol } from './langgraph/agent-protocol/meeting-analysis-agent-protocol';
import { AgentProtocolTools } from './langgraph/agent-protocol/agent-protocol-tools';
import { RunStatus } from './langgraph/agent-protocol/agent-protocol.interface';
import { AnalysisGoalType } from './langgraph/agentic-meeting-analysis/interfaces/agent.interface';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config();

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

async function testAgentProtocol() {
  const logger = new ConsoleLogger();
  
  logger.info('Starting Agent Protocol test');
  
  try {
    // Initialize OpenAI connector
    const openAiConnector = new OpenAIConnector({
      logger,
      modelConfig: {
        model: process.env.OPENAI_MODEL || 'gpt-4o',
        temperature: 0.2,
        maxTokens: 2000
      },
      embeddingConfig: {
        model: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-large'
      }
    });
    
    // Initialize Pinecone connector
    const pineconeConnector = new PineconeConnector({ logger });
    
    // Initialize Agent Protocol Tools
    const agentTools = new AgentProtocolTools({
      logger,
      openAiConnector,
      pineconeConnector
    });
    
    // Initialize Meeting Analysis Agent Protocol
    const agentProtocol = new MeetingAnalysisAgentProtocol({
      logger,
      openAiConnector,
      pineconeConnector,
      enableRag: true
    });
    
    // Create a test meeting ID
    const meetingId = `test-meeting-${uuidv4().substring(0, 8)}`;
    
    logger.info('Starting meeting analysis', { meetingId });
    
    // Test meeting analysis
    const analysisResponse = await agentProtocol.analyzeMeeting({
      meetingId,
      transcript: SAMPLE_TRANSCRIPT,
      title: 'Project Status Update',
      participants: [
        { id: 'john', name: 'John', role: 'Project Manager' },
        { id: 'sarah', name: 'Sarah', role: 'Frontend Developer' },
        { id: 'michael', name: 'Michael', role: 'Backend Developer' }
      ],
      userId: 'testuser',
      goals: [
        AnalysisGoalType.EXTRACT_TOPICS,
        AnalysisGoalType.EXTRACT_ACTION_ITEMS,
        AnalysisGoalType.GENERATE_SUMMARY
      ],
      options: {
        visualization: true,
        teamComposition: {
          maxTeamSize: 5
        }
      }
    });
    
    logger.info('Meeting analysis started', {
      meetingId,
      runId: analysisResponse.runId,
      threadId: analysisResponse.threadId,
      status: analysisResponse.status
    });
    
    // Poll for status until completed
    let status = analysisResponse.status;
    let attempts = 0;
    const maxAttempts = 30;
    
    while (status !== RunStatus.COMPLETED && status !== RunStatus.FAILED && attempts < maxAttempts) {
      // Wait 2 seconds between polls
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get status
      const statusResponse = await agentProtocol.getMeetingAnalysisStatus(analysisResponse.runId);
      status = statusResponse.status;
      
      logger.info('Meeting analysis status', {
        meetingId,
        runId: analysisResponse.runId,
        status,
        attempt: attempts + 1
      });
      
      attempts++;
    }
    
    // Get final results
    if (status === RunStatus.COMPLETED) {
      const resultResponse = await agentProtocol.getMeetingAnalysisStatus(analysisResponse.runId);
      
      logger.info('Meeting analysis completed successfully', {
        meetingId,
        runId: analysisResponse.runId,
        resultSample: JSON.stringify(resultResponse.results).substring(0, 200) + '...'
      });
    } else if (status === RunStatus.FAILED) {
      logger.error('Meeting analysis failed', {
        meetingId,
        runId: analysisResponse.runId
      });
    } else {
      logger.warn('Meeting analysis timed out', {
        meetingId,
        runId: analysisResponse.runId,
        status
      });
    }
    
    // Test tool execution
    logger.info('Testing topic extraction tool');
    const topicResult = await agentTools.executeTool('extract_topics', {
      transcript: SAMPLE_TRANSCRIPT
    });
    
    logger.info('Topic extraction result', {
      topics: topicResult.topics ? topicResult.topics.length : 0
    });
    
    logger.info('Testing action item extraction tool');
    const actionItemResult = await agentTools.executeTool('identify_action_items', {
      transcript: SAMPLE_TRANSCRIPT,
      topics: topicResult.topics
    });
    
    logger.info('Action item extraction result', {
      actionItems: actionItemResult.actionItems ? actionItemResult.actionItems.length : 0
    });
    
    logger.info('Agent Protocol test completed successfully');
  } catch (error) {
    logger.error('Error in Agent Protocol test', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
  }
}

// Run the test
testAgentProtocol().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
}); 