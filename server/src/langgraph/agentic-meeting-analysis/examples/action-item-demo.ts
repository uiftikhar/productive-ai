/**
 * Action Item Processing Demo
 * Demonstrates the functionality of the Action Item processing system
 * Part of Milestone 3.2: Action Item Processing
 */

import { ServiceRegistry } from '../services/service-registry';
import { ActionItemPriority, ActionItemStatus, VerificationStatus } from '../interfaces/action-items.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

// Sample meeting transcript
const SAMPLE_TRANSCRIPT = `
Meeting: Q2 Product Planning
Date: May 15, 2023
Participants: John (Product Manager), Sarah (Engineering Lead), Michael (Design), Emma (Marketing)

John: Welcome everyone to our Q2 product planning meeting. Today we need to finalize our roadmap for the next quarter.

Sarah: Before we dive in, I wanted to follow up on some action items from our last meeting. Did we make a decision about the new authentication system?

John: Yes, we decided to go with OAuth 2.0. Michael, can you make sure the design team updates the login flow mockups by the end of this week?

Michael: Sure, I'll have the design team update the mockups by Friday.

Emma: Great. For the marketing campaign, I need input from engineering on the new features we're launching. Sarah, could you send me a list of all the user-facing features that will be ready for the Q2 release?

Sarah: I'll compile that list and share it with you by Wednesday.

John: Thanks. Now, regarding the performance issues we've been facing, I think we need to prioritize fixing the database query optimization. Sarah, can your team investigate this ASAP? It's becoming a critical issue for our enterprise customers.

Sarah: Yes, I'll assign Alex to investigate the database performance issues. We should have an initial assessment by next Monday.

Michael: While we're talking about urgent matters, the UI lag in the dashboard is generating a lot of user complaints. I think we need to address this soon.

John: I agree. Sarah, can you also look into the UI performance issues? Maybe not as urgent as the database problem, but still important.

Sarah: Sure, we'll tackle both issues. UI lag will be assigned to Jason, and we should have some improvements in the next sprint.

Emma: For the product launch, I need final copy for the new features by June 1st. Who can I work with on that?

John: I'll take ownership of the product copy. I'll work with the product team to get you what you need by June 1st.

Michael: One more thing - we need to update our design system to include the new components we've been creating. I'll work on this, but I need input from everyone by the end of the month.

John: That works. Let's also make sure we schedule the user testing sessions for the new features. Emma, can you coordinate with the UX research team to set that up sometime in the next two weeks?

Emma: Yes, I'll coordinate the user testing sessions within the next two weeks.

Sarah: Before we wrap up, we should also decide on how to address the technical debt that's accumulating in the payment processing module. It's not urgent right now, but could become problematic if left unaddressed for too long.

John: Good point. Let's put that on our backlog for now, but aim to address it in Q3. Sarah, can you document the issues so we don't forget about them?

Sarah: I'll document the technical debt issues in our backlog for Q3 planning.

John: Great, I think we've covered everything. Any final thoughts?

Emma: Just a reminder that we need to align on messaging for the upcoming industry conference next month.

John: Good catch. Emma, please draft a messaging document and share it with the team for review by next Tuesday.

Emma: Will do.

John: Thanks everyone. Let's reconvene next week to check progress on these items.
`;

// Sample participant information
const PARTICIPANTS = [
  { name: 'John', role: 'Product Manager', id: 'user-1' },
  { name: 'Sarah', role: 'Engineering Lead', id: 'user-2' },
  { name: 'Michael', role: 'Design', id: 'user-3' },
  { name: 'Emma', role: 'Marketing', id: 'user-4' }
];

/**
 * Main demo function
 */
async function runDemo() {
  const logger = new ConsoleLogger();
  logger.info('Starting Action Item Processing Demo');
  
  // Initialize services
  const serviceRegistry = ServiceRegistry.getInstance({
    logger,
    enableNotifications: true
  });
  
  // Get required services
  const extractionService = serviceRegistry.getActionItemExtractionService();
  const trackingService = serviceRegistry.getActionItemTrackingService();
  const integrationService = serviceRegistry.getActionItemIntegrationService();
  const notificationService = serviceRegistry.getActionItemNotificationService();
  
  // Step 1: Extract action items from meeting transcript
  logger.info('Step 1: Extracting action items from meeting transcript...');
  const actionItems = await extractionService.extractActionItems(
    SAMPLE_TRANSCRIPT,
    'meeting-123',
    'Q2 Product Planning',
    PARTICIPANTS
  );
  
  logger.info(`Extracted ${actionItems.length} action items:`);
  actionItems.forEach((item, index) => {
    logger.info(`${index + 1}. ${item.description} (Assigned to: ${item.assignees.map(a => a.name).join(', ')})`);
  });
  
  // Step 2: Store and verify action items
  logger.info('\nStep 2: Storing and verifying action items...');
  for (const item of actionItems) {
    const itemId = await trackingService.storeActionItem(item);
    logger.info(`Stored action item: ${itemId} - ${item.description}`);
    
    // Verify some fields
    const verifiedItem = await trackingService.verifyActionItem(
      itemId,
      ['description', 'priority'],
      // Adjust priority for database issue to CRITICAL
      item.description.includes('database') ? 
        { priority: ActionItemPriority.CRITICAL } : 
        undefined
    );
    
    logger.info(`Verified action item: ${verifiedItem.id} - Priority: ${verifiedItem.priority}`);
  }
  
  // Step 3: Update status of an action item
  logger.info('\nStep 3: Updating action item status...');
  const allItems = await trackingService.getAllActionItems();
  if (allItems.length > 0) {
    const targetItem = allItems[0];
    logger.info(`Updating status of item: ${targetItem.id} - ${targetItem.description}`);
    
    const previousStatus = targetItem.status;
    const updated = await trackingService.updateActionItemStatus(
      targetItem.id,
      ActionItemStatus.IN_PROGRESS,
      25 // 25% progress
    );
    
    if (updated) {
      logger.info(`Updated status to IN_PROGRESS (25% complete)`);
      
      // Step 4: Send notification about status change
      logger.info('\nStep 4: Sending notification about status change...');
      
      // Set some user preferences for notifications
      await notificationService.setUserPreferences('user-1', {
        channels: ['email'],
        emailAddress: 'john@example.com'
      });
      
      await notificationService.setUserPreferences('user-2', {
        channels: ['email', 'slack'],
        emailAddress: 'sarah@example.com',
        slackMemberId: 'U123456'
      });
      
      // Send notification
      const notification = await notificationService.notifyStatusChange(
        targetItem,
        previousStatus,
        ['user-1', 'user-2'],
        'The engineering team has started working on this item.'
      );
      
      logger.info(`Sent notifications: ${notification.notificationIds.join(', ')}`);
    }
  }
  
  // Step 5: Integrate with external system
  logger.info('\nStep 5: Integrating with external systems...');
  
  // Connect to JIRA (simulated)
  const connected = await integrationService.connectToExternalSystem('jira', {
    baseUrl: 'https://example.atlassian.net',
    projectKey: 'PROD',
    apiToken: 'dummy-token'
  });
  
  if (connected) {
    logger.info('Connected to JIRA successfully');
    
    // Integrate an action item
    if (allItems.length > 0) {
      const integration = await integrationService.integrateActionItem(
        allItems[0].id,
        'jira',
        { issueType: 'Task' }
      );
      
      if (integration.success) {
        logger.info(`Integrated action item with JIRA: ${integration.externalId}`);
      }
    }
  }
  
  // Step 6: Search for action items
  logger.info('\nStep 6: Searching for action items...');
  
  // Search for high priority items
  const highPriorityItems = await trackingService.searchActionItems('', {
    priority: [ActionItemPriority.HIGH, ActionItemPriority.CRITICAL]
  });
  
  logger.info(`Found ${highPriorityItems.length} high/critical priority items`);
  
  // Search by text
  const designItems = await trackingService.searchActionItems('design');
  logger.info(`Found ${designItems.length} items related to "design"`);
  
  // Step 7: Summarize statistics
  logger.info('\nAction Item Statistics:');
  const items = await trackingService.getAllActionItems();
  
  const priorityStats = items.reduce((acc, item) => {
    acc[item.priority] = (acc[item.priority] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  logger.info('By Priority:');
  Object.entries(priorityStats).forEach(([priority, count]) => {
    logger.info(`- ${priority}: ${count}`);
  });
  
  const assigneeStats = new Map<string, number>();
  items.forEach(item => {
    item.assignees.forEach(assignee => {
      const name = assignee.name;
      assigneeStats.set(name, (assigneeStats.get(name) || 0) + 1);
    });
  });
  
  logger.info('By Assignee:');
  Array.from(assigneeStats.entries()).forEach(([name, count]) => {
    logger.info(`- ${name}: ${count}`);
  });
  
  logger.info('\nDemo completed successfully!\n');
}

// Run the demo
runDemo().catch(error => {
  console.error('Error running demo:', error);
  process.exit(1);
}); 