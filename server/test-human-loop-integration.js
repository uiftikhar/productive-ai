/**
 * Test Script for Human-in-the-Loop Integration (Milestone 2.3)
 * 
 * This script tests the integration of the human-in-the-loop system with LangGraph
 */
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');

// Import the human-in-the-loop integration
const {
  HumanLoopIntegration
} = require('./dist/human-interaction/integration/langgraph-human-loop-integration');

// Import other required modules
const {
  ApprovalActionType,
  ApprovalPriority
} = require('./dist/human-interaction/interfaces/approval.interface');

const {
  InterruptionType
} = require('./dist/human-interaction/interfaces/interruption.interface');

const {
  FeedbackType,
  FeedbackSource
} = require('./dist/human-interaction/interfaces/feedback.interface');

const {
  NotificationType,
  NotificationChannel
} = require('./dist/human-interaction/interfaces/ui.interface');

// Simplified console logger
class TestLogger {
  info(message, meta) {
    console.log(`[INFO] ${message}`, meta || '');
  }
  
  debug(message, meta) {
    console.log(`[DEBUG] ${message}`, meta || '');
  }
  
  warn(message, meta) {
    console.log(`[WARN] ${message}`, meta || '');
  }
  
  error(message, meta) {
    console.error(`[ERROR] ${message}`, meta || '');
  }
  
  log(level, message, meta) {
    console.log(`[${level}] ${message}`, meta || '');
  }
}

/**
 * Simulated human response handler
 */
class SimulatedHumanResponseHandler {
  constructor(integration) {
    this.integration = integration;
    this.approvedRequestIds = new Set();
    this.rejectedRequestIds = new Set();
    this.resolvedInterruptionIds = new Set();
    this.collectedFeedbackIds = new Set();
  }
  
  // Simulate automatic approval after a delay
  simulateApprovalResponse(requestId, approve = true, delayMs = 2000) {
    setTimeout(async () => {
      const approvalService = this.integration.getApprovalService();
      if (!approvalService) return;
      
      try {
        const request = await approvalService.getRequest(requestId);
        if (!request) {
          console.log(`Request ${requestId} not found`);
          return;
        }
        
        const approverId = 'simulated-approver-1';
        
        if (approve) {
          await approvalService.processResponse({
            requestId,
            approverId,
            status: 'approved',
            timestamp: new Date(),
            comments: 'Automatically approved by simulated human'
          });
          
          this.approvedRequestIds.add(requestId);
          console.log(`Simulated human APPROVED request: ${requestId}`);
        } else {
          await approvalService.processResponse({
            requestId,
            approverId,
            status: 'rejected',
            timestamp: new Date(),
            comments: 'Automatically rejected by simulated human'
          });
          
          this.rejectedRequestIds.add(requestId);
          console.log(`Simulated human REJECTED request: ${requestId}`);
        }
      } catch (error) {
        console.error('Error simulating approval response:', error);
      }
    }, delayMs);
  }
  
  // Simulate resolving an interruption after a delay
  simulateResolveInterruption(interruptionId, delayMs = 3000) {
    setTimeout(async () => {
      try {
        await this.integration.resolveInterruption(
          interruptionId,
          'resume',
          {
            resolvedBy: 'simulated-human-1',
            comments: 'Automatically resolved by simulated human'
          }
        );
        
        this.resolvedInterruptionIds.add(interruptionId);
        console.log(`Simulated human RESOLVED interruption: ${interruptionId}`);
      } catch (error) {
        console.error('Error simulating interruption resolution:', error);
      }
    }, delayMs);
  }
  
  // Simulate providing feedback after a delay
  simulateProvideFeedback(userId, sessionId, delayMs = 4000) {
    setTimeout(async () => {
      try {
        const feedback = await this.integration.collectFeedback({
          userId,
          sessionId,
          type: FeedbackType.QUALITY,
          source: FeedbackSource.DIRECT,
          rating: 4,
          text: 'The agent was very helpful, but could be faster.',
          category: ['response_quality', 'helpfulness']
        });
        
        this.collectedFeedbackIds.add(feedback);
        console.log(`Simulated human PROVIDED feedback: ${feedback}`);
      } catch (error) {
        console.error('Error simulating feedback provision:', error);
      }
    }, delayMs);
  }
}

/**
 * Main test function
 */
async function runTest() {
  console.log('Starting Human-in-the-Loop Integration Test');
  
  // Initialize the human-in-the-loop integration
  const humanLoop = new HumanLoopIntegration({
    logger: new TestLogger(),
    defaultApprovers: ['simulated-approver-1', 'simulated-approver-2']
  });
  
  // Create the simulated human response handler
  const simulatedHuman = new SimulatedHumanResponseHandler(humanLoop);
  
  // Generate unique IDs for the test
  const testSessionId = uuidv4();
  const workflowId = uuidv4();
  const agentId = 'agent-123';
  const userId = 'user-456';
  
  console.log(`Test Session ID: ${testSessionId}`);
  console.log(`Workflow ID: ${workflowId}`);
  
  try {
    // Test 1: Approval workflow
    console.log('\n--- Test 1: Approval Workflow ---');
    const approvalRequestId = await humanLoop.requestApproval({
      title: 'Approve critical database operation',
      description: 'This operation will delete 1000 records from the production database.',
      actionType: ApprovalActionType.DATA_ACCESS,
      priority: ApprovalPriority.HIGH,
      agentId,
      requestedBy: 'system',
      actionPayload: {
        operation: 'delete',
        target: 'productionDb',
        recordCount: 1000
      },
      expiresIn: 60000 // 1 minute
    });
    
    console.log(`Created approval request: ${approvalRequestId}`);
    
    // Simulate human approving the request
    simulatedHuman.simulateApprovalResponse(approvalRequestId, true, 2000);
    
    // Wait for approval (will block for at most 10 seconds)
    console.log('Waiting for approval response...');
    const isApproved = await humanLoop.waitForApproval(approvalRequestId, {
      timeoutMs: 10000,
      pollIntervalMs: 500
    });
    
    console.log(`Approval result: ${isApproved ? 'APPROVED' : 'NOT APPROVED'}`);
    
    // Test 2: Checkpoint and interruption
    console.log('\n--- Test 2: Checkpoint and Interruption ---');
    
    // Register a checkpoint
    const checkpointId = await humanLoop.registerCheckpoint({
      name: 'Before sending email',
      description: 'Checkpoint before sending email to external recipients',
      nodeId: 'send-email-node',
      condition: {
        type: 'always'
      },
      requiredApproval: true
    });
    
    console.log(`Registered checkpoint: ${checkpointId}`);
    
    // Create an interruption at the checkpoint
    const interruptionId = await humanLoop.createInterruption({
      type: InterruptionType.CHECKPOINT,
      workflowId,
      agentId,
      nodeId: 'send-email-node',
      checkpointId,
      createdBy: userId,
      reason: 'Email content needs to be reviewed by human',
      state: {
        emailContent: 'Dear customer, Thank you for your inquiry...',
        recipients: ['customer@example.com'],
        subject: 'Response to your inquiry'
      },
      expiresIn: 120000 // 2 minutes
    });
    
    console.log(`Created interruption: ${interruptionId}`);
    
    // Simulate human resolving the interruption
    simulatedHuman.simulateResolveInterruption(interruptionId, 3000);
    
    // Test 3: Feedback collection
    console.log('\n--- Test 3: Feedback Collection ---');
    
    // Request feedback from user
    const feedbackRequestId = await humanLoop.requestFeedback(userId, {
      type: FeedbackType.QUALITY,
      agentId,
      sessionId: testSessionId,
      context: {
        interactionType: 'email-response',
        duration: 120
      }
    });
    
    console.log(`Requested feedback: ${feedbackRequestId}`);
    
    // Simulate human providing feedback
    simulatedHuman.simulateProvideFeedback(userId, testSessionId, 4000);
    
    // Test 4: Notifications
    console.log('\n--- Test 4: Notifications ---');
    
    // Send a notification to user
    const notificationId = await humanLoop.sendNotification({
      userId,
      type: NotificationType.INFO,
      title: 'Task completed',
      message: 'Your requested task has been completed successfully.',
      actionable: true,
      priority: 'medium',
      channels: [NotificationChannel.IN_APP],
      actions: [
        {
          id: 'view',
          label: 'View Results',
          type: 'primary',
          action: 'view_results',
          payload: { resultId: 'result-123' }
        },
        {
          id: 'dismiss',
          label: 'Dismiss',
          type: 'secondary',
          action: 'dismiss_notification'
        }
      ],
      expiresIn: 86400000 // 24 hours
    });
    
    console.log(`Sent notification: ${notificationId}`);
    
    // Wait for simulated responses to complete
    console.log('\n--- Waiting for all simulated responses to complete ---');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Print final summary
    console.log('\n=== Test Summary ===');
    console.log(`Approved requests: ${simulatedHuman.approvedRequestIds.size}`);
    console.log(`Rejected requests: ${simulatedHuman.rejectedRequestIds.size}`);
    console.log(`Resolved interruptions: ${simulatedHuman.resolvedInterruptionIds.size}`);
    console.log(`Collected feedback: ${simulatedHuman.collectedFeedbackIds.size}`);
    
    console.log('\nHuman-in-the-Loop Integration Test completed successfully!');
  } catch (error) {
    console.error('Error in test:', error);
  }
}

// Run the test
runTest().then(() => {
  console.log('Test script completed');
}).catch(error => {
  console.error('Error running test script:', error);
}); 