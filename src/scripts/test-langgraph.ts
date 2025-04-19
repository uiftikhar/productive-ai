import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { MeetingAnalysisAgent } from '../agents/specialized/meeting-analysis-agent';
import { MeetingAnalysisAdapter } from '../langgraph/core/adapters/meeting-analysis.adapter';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { OpenAIAdapter } from '../agents/adapters/openai-adapter';
import { MeetingContextService } from '../shared/user-context/services/meeting-context.service';
import { EmbeddingService } from '../shared/embedding/embedding.service';
import { RagPromptManager } from '../shared/services/rag-prompt-manager.service';
import { AgentRequest } from '../agents/interfaces/agent.interface';

// Set up dotenv for environment variables if needed
try {
  require('dotenv').config();
} catch (err) {
  console.warn("dotenv not available, using existing environment variables");
}

// Initialize services
const logger = new ConsoleLogger();
const openaiAdapter = new OpenAIAdapter();
const meetingContextService = new MeetingContextService();
const embeddingService = new EmbeddingService(openaiAdapter, logger);
const ragPromptManager = new RagPromptManager();

async function main() {
  try {
    console.log("Initializing MeetingAnalysisAgent...");
    
    // Initialize the agent
    const meetingAnalysisAgent = new MeetingAnalysisAgent({
      id: 'meeting-analysis-agent',
      logger,
      openaiAdapter,
      meetingContextService,
      embeddingService,
      ragPromptManager,
    });
    
    await meetingAnalysisAgent.initialize();
    console.log("Agent initialized successfully.");
    
    // Create the LangGraph adapter
    console.log("Creating MeetingAnalysisAdapter with LangGraph...");
    const adapter = new MeetingAnalysisAdapter(meetingAnalysisAgent, {
      tracingEnabled: true,
      includeStateInLogs: true,
      maxChunkSize: 2000,
      chunkOverlap: 200
    });
    
    // Read a sample transcript file
    console.log("Reading sample transcript...");
    const sampleTranscriptPath = path.join(__dirname, '../examples/sample-transcript.txt');
    let transcript;
    
    try {
      transcript = await fs.readFile(sampleTranscriptPath, 'utf8');
    } catch (error) {
      // If the example file doesn't exist, create a simple sample transcript
      console.warn("Sample transcript file not found, using a simple example.");
      transcript = 
`John: Welcome everyone to our quarterly planning meeting. Today we'll discuss our roadmap for the next quarter.
Alice: I think we should focus on improving our AI features first.
Bob: I agree, but we also need to address the technical debt in our backend services.
John: Good points. Let's allocate 40% of our resources to AI features and 30% to technical debt.
Alice: That sounds reasonable. What about the remaining 30%?
John: Let's use it for customer-requested features from our backlog.
Bob: Agreed. I'll start working on a detailed plan for the technical debt work.
Alice: I'll do the same for the AI features by Friday.
John: Great, let's reconvene next week to review the detailed plans. Meeting adjourned.`;
    }
    
    // Create a meeting ID for this test
    const meetingId = uuidv4();
    
    // Create request for the adapter - convert to string to match AgentRequest interface
    const meetingData = {
      meetingId,
      transcript,
      meetingTitle: "Quarterly Planning Meeting",
      participants: [
        { id: "1", name: "John", role: "Manager" },
        { id: "2", name: "Alice", role: "Product Manager" },
        { id: "3", name: "Bob", role: "Tech Lead" }
      ]
    };
    
    // Properly create an AgentRequest
    const request: AgentRequest = {
      input: JSON.stringify(meetingData),
      capability: "analyze_meeting",
      parameters: {
        includeTopics: true,
        includeActionItems: true,
        includeSentiment: true,
        trackDecisions: true
      },
      context: {
        userId: "test-user",
        metadata: {
          organizationId: "test-org"
        }
      }
    };
    
    console.log(`Processing meeting with ID: ${meetingId}`);
    console.log("Starting analysis with LangGraph adapter...");
    
    // Execute the analysis using our LangGraph adapter
    const startTime = Date.now();
    const response = await adapter.execute(request);
    const duration = (Date.now() - startTime) / 1000;
    
    console.log(`Analysis completed in ${duration.toFixed(2)} seconds.`);
    
    // Output results
    console.log("\n=== ANALYSIS RESULTS ===");
    
    // Parse the output if it's a string
    const analysis = typeof response.output === 'string' 
                   ? JSON.parse(response.output) 
                   : response.output;
    
    // Display summary and some key sections
    console.log("\nSUMMARY:");
    console.log(analysis.summary);
    
    if (analysis.actionItems && analysis.actionItems.length > 0) {
      console.log("\nACTION ITEMS:");
      analysis.actionItems.forEach((item: any, index: number) => {
        console.log(`${index + 1}. ${item.text} (Assignee: ${item.assignee})`);
      });
    }
    
    if (analysis.decisions && analysis.decisions.length > 0) {
      console.log("\nDECISIONS:");
      analysis.decisions.forEach((decision: any, index: number) => {
        console.log(`${index + 1}. ${decision.text}`);
      });
    }
    
    console.log("\nMETRICS:");
    console.log(`Execution Time: ${(response.metrics?.executionTimeMs || 0) / 1000} seconds`);
    console.log(`Tokens Used: ${response.metrics?.tokensUsed || 'N/A'}`);
    console.log(`Step Count: ${response.metrics?.stepCount || 'N/A'}`);
    
    console.log("\nTest completed successfully!");
  } catch (error) {
    console.error("Error in test:", error);
  }
}

// Run the test
main().catch(console.error); 