import { MeetingAnalysisAgent } from '../specialized/meeting-analysis-agent';
import { UnifiedMeetingAnalysisAdapter } from '../../langgraph/core/adapters/unified-meeting-analysis.adapter';
import { v4 as uuidv4 } from 'uuid';

/**
 * Example meeting transcript
 */
const SAMPLE_MEETING_TRANSCRIPT = `
John (CEO): Good morning everyone, thanks for joining our quarterly planning meeting. Today we need to discuss our Q3 results and plan for Q4. Let's start with Sarah from Marketing.

Sarah (Marketing): Thanks John. In Q3, our marketing campaigns resulted in a 15% increase in lead generation compared to Q2. The social media campaign was particularly successful, driving 40% of the new leads. For Q4, we're planning to focus more on content marketing and SEO.

John (CEO): That's impressive, Sarah. What's the budget you're looking at for Q4?

Sarah (Marketing): We're requesting a 10% increase from our Q3 budget to expand our content team.

John (CEO): Let's table that for now and discuss it when we get to budget allocations. Michael, how did sales perform?

Michael (Sales): We closed 82% of the qualified leads from Marketing, which is up 7% from last quarter. Total revenue is up 12.5% from Q2. For Q4, we want to focus on enterprise clients, as they have higher LTV and retention rates.

John (CEO): Great work, Michael. Does anyone have questions for the marketing or sales teams?

Emily (Product): I have a question for Sarah. Did you track which specific content drove the most qualified leads? That would help us focus our product documentation efforts.

Sarah (Marketing): Yes, our data shows that comparison guides and case studies had the highest conversion rates. I'll share the complete report after the meeting.

Emily (Product): Thanks, that's very helpful.

John (CEO): Let's move on to product updates. Emily, what's the status on the new features we discussed last quarter?

Emily (Product): We've completed development on the analytics dashboard and mobile app integration. Both will be ready for release by end of next week. The AI recommendation engine is taking longer than expected due to some data quality issues, so we've pushed that to November.

John (CEO): Is there anything you need from other departments to get the AI feature back on track?

Emily (Product): We need help from the data team to clean up our historical customer data. David, can your team allocate some resources to this in the next two weeks?

David (Data): We're stretched thin right now with the data warehouse migration, but I can assign someone part-time starting next Monday. Will that work?

Emily (Product): That would be very helpful, thanks David.

John (CEO): Great. Let's make the AI feature a priority for November. Now, let's discuss Q4 budgets.

[Budget discussion continues for 20 minutes]

John (CEO): Based on our discussion, I'm approving the marketing budget increase of 7% instead of the requested 10%. Sales will maintain their current budget, and product will get the additional developer they requested. Is everyone clear on their Q4 objectives and budgets?

[General agreement]

John (CEO): Great. I need everyone to submit their detailed Q4 plans by next Friday. Also, Emily, please schedule a separate meeting with David to discuss the data requirements for the AI feature.

Emily (Product): Will do, John.

John (CEO): Any other questions or topics we need to cover today?

Michael (Sales): When will the new analytics dashboard be available for the sales team to use?

Emily (Product): We'll roll it out to the sales team first for beta testing on October 15th, then to all departments by October 30th.

Michael (Sales): Looking forward to it. That's all from me.

John (CEO): If there's nothing else, let's wrap up. Thank you everyone for your contributions this quarter. Let's make Q4 even better!
`;

/**
 * Run the example
 */
async function runMeetingAnalysisExample() {
  console.log('=== Meeting Analysis Example ===\n');
  
  // 1. Create the agent with capabilities for meeting analysis
  const meetingAnalysisAgent = new MeetingAnalysisAgent(
    'Meeting Analyst',
    'Specialized agent for analyzing meeting transcripts',
    {
      // Optional configuration here
    }
  );
  
  // 2. Initialize the agent
  await meetingAnalysisAgent.initialize();
  console.log(`Agent initialized: ${meetingAnalysisAgent.name}`);
  
  // 3. Create the LangGraph adapter
  const adapter = new UnifiedMeetingAnalysisAdapter(meetingAnalysisAgent, {
    maxChunkSize: 1500, // Process in smaller chunks for this example
    chunkOverlap: 150,
  });
  
  // 4. Prepare meeting parameters
  const meetingId = uuidv4();
  const meetingParams = {
    meetingId,
    transcript: SAMPLE_MEETING_TRANSCRIPT,
    title: 'Quarterly Planning Meeting',
    participantIds: ['John', 'Sarah', 'Michael', 'Emily', 'David'],
    userId: 'example-user',
    includeTopics: true,
    includeActionItems: true,
    includeSentiment: true,
  };
  
  console.log(`Processing meeting: ${meetingParams.title} (${meetingId})`);
  console.log(`Transcript length: ${meetingParams.transcript.length} characters\n`);
  
  // 5. Process the meeting transcript
  console.log('Starting analysis...');
  const startTime = Date.now();
  
  try {
    const result = await adapter.processMeetingTranscript(meetingParams);
    
    const executionTime = Date.now() - startTime;
    console.log(`\nAnalysis completed in ${executionTime / 1000} seconds`);
    console.log(`Success: ${result.success}`);
    
    if (result.metrics) {
      console.log(`Tokens used: ${result.metrics.tokensUsed || 'N/A'}`);
      console.log(`Execution time: ${result.metrics.executionTimeMs ? result.metrics.executionTimeMs / 1000 : 'N/A'} seconds`);
    }
    
    // 6. Print the results
    console.log('\n=== Analysis Results ===\n');
    
    if (result.success) {
      // For pretty printing
      console.log(JSON.stringify(result.output, null, 2));
      
      // Extract specific elements if available
      if (result.output.topics) {
        console.log('\nMain Topics:');
        result.output.topics.forEach((topic: string, i: number) => {
          console.log(`${i + 1}. ${topic}`);
        });
      }
      
      if (result.output.actionItems) {
        console.log('\nAction Items:');
        result.output.actionItems.forEach((item: any, i: number) => {
          console.log(`${i + 1}. ${item.task || item.description} - Assigned to: ${item.owner || item.assignee || 'Unassigned'}`);
        });
      }
      
      if (result.output.decisions) {
        console.log('\nDecisions:');
        result.output.decisions.forEach((decision: any, i: number) => {
          console.log(`${i + 1}. ${decision.text || decision}`);
        });
      }
    } else {
      console.log('Analysis failed:');
      console.log(result.output.error);
    }
  } catch (error: any) {
    console.error('Error processing meeting transcript:', error.message);
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runMeetingAnalysisExample().catch(error => {
    console.error('Error running example:', error);
  });
}

export { runMeetingAnalysisExample }; 