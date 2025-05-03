/**
 * Test file to demonstrate the Phase 3 Collaborative Framework
 * for the Agentic Meeting Analysis System
 */
import { AgenticMeetingAnalysis } from './src/langgraph/agentic-meeting-analysis';
import {
  ConflictStatus,
  ConflictSeverity,
  ConflictType,
  Conflict,
} from './src/langgraph/agentic-meeting-analysis/communication/conflict-resolution.service';
import path from 'path';
import fs from 'fs';

// Sample meeting transcript
const SAMPLE_TRANSCRIPT = `
John: Good morning everyone, let's start our weekly product meeting.
Sarah: Thanks John. I've prepared the new feature roadmap we discussed last time.
Michael: I have some concerns about the timeline for the Q3 release.
Sarah: What specifically concerns you, Michael?
Michael: I think we're trying to fit too many features into the release. We should prioritize.
John: I agree with Michael. Let's focus on the core features first.
Emily: From a marketing perspective, we need the social sharing feature for the Q3.
John: That's a good point. Let's make sure social sharing is included.
Michael: I can shift resources to prioritize that feature.
Sarah: Great, I'll update the roadmap to reflect these priorities.
John: Perfect. Let's also discuss the bug reports from last week.
Emily: We've seen several reports about the checkout process failing.
Michael: My team is already working on that. We should have a fix by Friday.
John: Excellent. Sarah, can you organize a bug triage session tomorrow?
Sarah: Yes, I'll schedule it and send out invites after this meeting.
John: Thanks everyone. Let's meet again next week.
`;

interface HumanFeedbackData {
  taskId: string;
  feedbackId: string;
  agentId: string;
}

interface ConflictEscalatedData {
  conflictId: string;
  conflict: Conflict;
  reason: string;
}

interface AnalysisPhase {
  phase: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
  participants: number;
}

interface AnalysisStatus {
  meetingId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  workflow: 'collaborative' | 'traditional';
  currentPhase?: string;
  phases?: AnalysisPhase[];
  started: number;
  completed?: number;
}

interface PendingHumanTasks {
  feedbackRequests: any[];
  escalatedConflicts: Conflict[];
}

/**
 * Test the collaborative framework
 */
async function testCollaborativeFramework(): Promise<void> {
  console.log('Starting collaborative framework test');

  // Create the AgenticMeetingAnalysis system with collaborative framework enabled
  const analyzer = new AgenticMeetingAnalysis({
    useCollaborativeFramework: true,
    enableHumanFeedback: true,
  });

  // Initialize the system
  console.log('Initializing analyzer...');
  await analyzer.initialize();
  console.log('Analyzer initialized successfully');

  // Set up event listeners to monitor the analysis process
  analyzer.on('human_feedback_needed', (data: HumanFeedbackData) => {
    console.log(`\n[HUMAN FEEDBACK NEEDED] Task: ${data.taskId}`);
    console.log('Automatically providing human feedback');

    // Simulate human feedback
    setTimeout(async () => {
      try {
        await analyzer.submitHumanFeedback(
          data.feedbackId,
          4, // 4/5 rating
          'The analysis looks good, but could include more specific details about action items.',
          true, // Accept the output
        );
        console.log(`Human feedback submitted for ${data.feedbackId}`);
      } catch (error) {
        console.error('Error submitting human feedback:', error);
      }
    }, 2000);
  });

  analyzer.on('conflict_escalated', (data: ConflictEscalatedData) => {
    console.log(
      `\n[CONFLICT ESCALATED] ID: ${data.conflictId}, Topic: ${data.conflict.topic}`,
    );
    console.log(
      `Severity: ${data.conflict.severity}, Type: ${data.conflict.type}`,
    );
    console.log('Claims:');
    for (const claim of data.conflict.claims) {
      console.log(
        `- Agent ${claim.agentId}: ${JSON.stringify(claim.claim).substring(0, 100)}...`,
      );
    }

    console.log('Automatically resolving conflict with human decision');

    // Simulate human decision
    setTimeout(async () => {
      try {
        await analyzer.submitHumanDecision(
          data.conflictId,
          "Integrate both perspectives with emphasis on agent A's claim",
          'Both claims have merit, but agent A provides more specific details and context.',
        );
        console.log(`Human decision submitted for conflict ${data.conflictId}`);
      } catch (error) {
        console.error('Error submitting human decision:', error);
      }
    }, 2000);
  });

  // Start analyzing a sample meeting
  console.log('\nStarting meeting analysis...');
  const meetingId = 'sample-meeting-123';
  const result = await analyzer.analyzeMeeting(meetingId, SAMPLE_TRANSCRIPT, {
    previousMeetings: [],
    additionalContext:
      'Weekly product planning meeting to discuss Q3 roadmap and bug fixes.',
  });

  console.log(`Analysis started: ${JSON.stringify(result, null, 2)}`);

  // Monitor progress
  console.log('\nMonitoring analysis progress...');

  // Check status every 10 seconds
  const checkStatus = async (): Promise<void> => {
    try {
      const status = (await analyzer.getAnalysisStatus(
        meetingId,
      )) as AnalysisStatus;
      console.log(`\n--- Status Update (${new Date().toISOString()}) ---`);
      console.log(`Status: ${status.status}`);
      console.log(`Current Phase: ${status.currentPhase}`);

      if (status.phases) {
        console.log('\nPhase Progress:');
        for (const phase of status.phases) {
          const phaseStatus =
            phase.status === 'completed'
              ? '✅'
              : phase.status === 'in_progress'
                ? '🔄'
                : '⏳';
          console.log(`${phaseStatus} ${phase.phase}`);
        }
      }

      // Check pending human tasks
      const pendingTasks = analyzer.getPendingHumanTasks() as PendingHumanTasks;

      if (
        pendingTasks.feedbackRequests.length > 0 ||
        pendingTasks.escalatedConflicts.length > 0
      ) {
        console.log('\nPending Human Tasks:');
        console.log(
          `- Feedback Requests: ${pendingTasks.feedbackRequests.length}`,
        );
        console.log(
          `- Escalated Conflicts: ${pendingTasks.escalatedConflicts.length}`,
        );
      }

      // Continue checking if not complete
      if (status.status !== 'completed') {
        setTimeout(checkStatus, 10000); // Check again in 10 seconds
      } else {
        console.log('\n✅ Analysis completed successfully!');

        // Output summary of conflicts and quality control actions
        console.log('\n----- COLLABORATIVE FRAMEWORK SUMMARY -----');
        // Detailed reporting would go here in a real implementation

        process.exit(0);
      }
    } catch (error) {
      console.error('Error checking status:', error);
      setTimeout(checkStatus, 10000); // Try again in 10 seconds
    }
  };

  // Start checking status
  setTimeout(checkStatus, 5000); // First check after 5 seconds
}

// Run the test
testCollaborativeFramework().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
