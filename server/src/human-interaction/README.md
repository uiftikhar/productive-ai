# Human-in-the-Loop Integration

This module provides a comprehensive system for integrating human oversight, feedback, and interaction into automated AI workflows built with LangGraph. The system enables AI agents to request human approval for critical actions, allows humans to intervene in automated processes, collect feedback, and communicate with humans through notifications and interactive UI elements.

## Overview

The Human-in-the-Loop Integration (Milestone 2.3) consists of four primary subsystems:

1. **Approval System**: Manages approval workflows for critical actions
2. **Interruption System**: Handles workflow checkpoints and external interruptions
3. **Feedback System**: Collects and analyzes user feedback
4. **UI Integration**: Provides notification and interaction capabilities

Each subsystem can be used independently or together through the unified `HumanLoopIntegration` class.

## Installation

The Human-in-the-Loop Integration is part of the server codebase. Ensure you have built the TypeScript code:

```bash
npm run build
```

## Usage

### Basic Setup

```typescript
import { HumanLoopIntegration } from './src/human-interaction';

// Create a new integration instance
const humanLoop = new HumanLoopIntegration({
  // Configuration options
  approvalEnabled: true,
  feedbackEnabled: true,
  interruptionEnabled: true,
  uiEnabled: true,
  defaultApprovers: ['user1@example.com', 'user2@example.com']
});
```

### Approval Workflow

Request approval for critical actions:

```typescript
// Request approval for a critical action
const requestId = await humanLoop.requestApproval({
  title: 'Approve database deletion',
  description: 'This action will delete 1000 records from the production database.',
  actionType: 'data_access',
  priority: 'high',
  agentId: 'agent-123',
  requestedBy: 'system',
  actionPayload: {
    operation: 'delete',
    target: 'productionDb',
    recordCount: 1000
  },
  expiresIn: 3600000 // 1 hour
});

// Check if the request has been approved
const isApproved = await humanLoop.isApproved(requestId);

// Wait for approval (with timeout)
const approved = await humanLoop.waitForApproval(requestId, {
  timeoutMs: 600000, // 10 minutes
  pollIntervalMs: 1000 // 1 second
});

if (approved) {
  // Proceed with the action
} else {
  // Handle rejection or timeout
}
```

### Interruption Management

Register checkpoints and handle interruptions in workflows:

```typescript
// Register a checkpoint in the workflow
const checkpointId = await humanLoop.registerCheckpoint({
  name: 'Before sending email',
  description: 'Checkpoint before sending email to external recipients',
  nodeId: 'send-email-node',
  condition: {
    type: 'always'
  },
  requiredApproval: true
});

// Create an interruption at a checkpoint
const interruptionId = await humanLoop.createInterruption({
  type: 'checkpoint',
  workflowId: 'workflow-123',
  agentId: 'agent-123',
  nodeId: 'send-email-node',
  checkpointId,
  createdBy: 'user-456',
  reason: 'Email content needs to be reviewed by human',
  state: {
    emailContent: 'Dear customer, Thank you for your inquiry...',
    recipients: ['customer@example.com'],
    subject: 'Response to your inquiry'
  },
  expiresIn: 3600000 // 1 hour
});

// Resolve an interruption
await humanLoop.resolveInterruption(
  interruptionId,
  'resume',
  {
    resolvedBy: 'user-456',
    comments: 'Email content looks good'
  }
);
```

### Feedback Collection

Collect and analyze user feedback:

```typescript
// Request feedback from a user
const feedbackRequestId = await humanLoop.requestFeedback('user-123', {
  type: 'quality',
  agentId: 'agent-123',
  sessionId: 'session-123',
  context: {
    interactionType: 'email-response',
    duration: 120
  }
});

// Collect feedback from a user
const feedbackId = await humanLoop.collectFeedback({
  userId: 'user-123',
  agentId: 'agent-123',
  sessionId: 'session-123',
  type: 'quality',
  source: 'direct',
  rating: 4,
  text: 'The agent was very helpful, but could be faster.',
  category: ['response_quality', 'helpfulness']
});

// Get the feedback analyzer for more advanced analysis
const analyzer = humanLoop.getFeedbackAnalyzer();
if (analyzer) {
  const recommendations = await analyzer.generateRecommendations('agent-123');
  console.log('Improvement recommendations:', recommendations);
}
```

### Notifications and UI Integration

Send notifications and interact with users:

```typescript
// Send a notification to a user
const notificationId = await humanLoop.sendNotification({
  userId: 'user-123',
  type: 'info',
  title: 'Task completed',
  message: 'Your requested task has been completed successfully.',
  actionable: true,
  priority: 'medium',
  channels: ['in_app'],
  actions: [
    {
      id: 'view',
      label: 'View Results',
      type: 'primary',
      action: 'view_results',
      payload: { resultId: 'result-123' }
    }
  ],
  expiresIn: 86400000 // 24 hours
});

// Get UI services for more advanced UI integration
const notificationService = humanLoop.getNotificationService();
const interactionService = humanLoop.getInteractionService();
```

## Architecture

### Approval System

The approval system consists of:

- **ApprovalRequest**: Represents a request for human approval of an action
- **ApprovalWorkflowService**: Manages the approval lifecycle
- **ApprovalRule**: Enables conditional auto-approval/rejection

Approvals can be requested for various action types (tool execution, data access, etc.) with different priority levels. Approvers can approve, reject, or modify requests.

### Interruption System

The interruption system consists of:

- **Checkpoint**: Defines points in a workflow where interruptions may occur
- **Interruption**: Represents a paused workflow requiring human attention
- **CheckpointService**: Manages checkpoint registration and evaluation
- **InterruptionHandlerService**: Handles the lifecycle of interruptions
- **StateCaptureService**: Captures and restores workflow state

Interruptions can be triggered by checkpoints (planned) or external events (unplanned).

### Feedback System

The feedback system consists of:

- **Feedback**: Represents user feedback on agent performance
- **FeedbackCollectorService**: Collects feedback from users
- **FeedbackAnalyzerService**: Analyzes feedback for insights and recommendations

Feedback can be collected in various formats (ratings, text, structured questions) and analyzed to improve agent performance.

### UI Integration

The UI integration consists of:

- **Notification**: Represents a message to a user
- **InteractionPoint**: Defines a point of interaction in the UI
- **NotificationService**: Manages notification delivery
- **InteractionService**: Manages interactive UI elements

UI integration enables communication with users through notifications and interactive UI components.

## Integration with LangGraph

The Human-in-the-Loop Integration is designed to integrate seamlessly with LangGraph:

```typescript
// In a LangGraph node
async function exampleNode(state) {
  // ...
  
  // Check if we need human approval
  if (needsApproval) {
    const requestId = await humanLoop.requestApproval({
      title: 'Approve action',
      // ...
    });
    
    const approved = await humanLoop.waitForApproval(requestId);
    if (!approved) {
      return { ...state, status: 'rejected' };
    }
  }
  
  // Continue with the workflow
  // ...
}
```

## Testing

A test script is provided to demonstrate the functionality of the Human-in-the-Loop Integration:

```bash
node test-human-loop-integration.js
```

## License

This component is part of the main project and is subject to the same license. 