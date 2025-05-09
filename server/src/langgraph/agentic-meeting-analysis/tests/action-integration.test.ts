/**
 * Tests for action item integration functionality
 * Part of Milestone 3.2: Action Item Processing
 */

import { ActionItemIntegrationServiceImpl, SupportedExternalSystem } from '../services/action-item-integration.service';
import { ActionItemTrackingServiceImpl } from '../services/action-item-tracking.service';
import { 
  ActionItem, 
  ActionItemPriority, 
  ActionItemStatus, 
  VerificationStatus 
} from '../interfaces/action-items.interface';
import { v4 as uuidv4 } from 'uuid';

describe('Action Item Integration Service', () => {
  let integrationService: ActionItemIntegrationServiceImpl;
  let trackingService: ActionItemTrackingServiceImpl;
  
  // Sample action item for testing
  const sampleActionItem: ActionItem = {
    id: `action-${uuidv4()}`,
    description: 'Implement new login flow for mobile app',
    meetingId: 'meeting-123',
    meetingTitle: 'Mobile App Planning',
    createdAt: new Date(),
    updatedAt: new Date(),
    status: ActionItemStatus.PENDING,
    priority: ActionItemPriority.HIGH,
    assignees: [
      {
        id: 'user-1',
        name: 'John Doe',
        role: 'Mobile Developer',
        confidence: 0.9,
        detectionMethod: 'direct_mention',
        verificationStatus: VerificationStatus.VERIFIED
      }
    ],
    deadline: {
      type: 'absolute',
      date: '2023-05-30',
      originalText: 'by end of May',
      confidence: 0.9,
      verificationStatus: VerificationStatus.VERIFIED
    },
    verificationStatus: VerificationStatus.VERIFIED,
    extractionConfidence: 0.9
  };
  
  beforeEach(() => {
    // Create a tracking service first
    trackingService = new ActionItemTrackingServiceImpl({
      storageType: 'memory',
      persistChanges: false
    });
    
    // Create integration service with tracking service
    integrationService = new ActionItemIntegrationServiceImpl({
      actionItemTrackingService: trackingService,
      enableRealIntegrations: false // Use simulated mode for tests
    });
  });
  
  test('should connect to external systems', async () => {
    // Connect to JIRA (should always succeed in simulated mode)
    const jiraConnected = await integrationService.connectToExternalSystem(
      SupportedExternalSystem.JIRA,
      {
        baseUrl: 'https://example.atlassian.net',
        projectKey: 'TEST',
        apiToken: 'dummy-token'
      }
    );
    
    expect(jiraConnected).toBe(true);
    
    // Connect to GitHub (should always succeed in simulated mode)
    const githubConnected = await integrationService.connectToExternalSystem(
      SupportedExternalSystem.GITHUB,
      {
        token: 'dummy-token',
        owner: 'testorg',
        repo: 'testrepo'
      }
    );
    
    expect(githubConnected).toBe(true);
    
    // Test with bad parameters (should fail)
    try {
      await integrationService.connectToExternalSystem(
        SupportedExternalSystem.JIRA,
        {} // Missing required params
      );
      
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      // Expected error
      expect(error).toBeDefined();
    }
  });
  
  test('should list available integration systems', async () => {
    const systems = await integrationService.getAvailableIntegrationSystems();
    
    // Should include all built-in systems
    expect(systems).toContain(SupportedExternalSystem.JIRA);
    expect(systems).toContain(SupportedExternalSystem.ASANA);
    expect(systems).toContain(SupportedExternalSystem.TRELLO);
    expect(systems).toContain(SupportedExternalSystem.GITHUB);
    
    // Custom systems would be added after connection, not testing that here
  });
  
  test('should integrate action items with external systems', async () => {
    // First store the action item
    const actionItemId = await trackingService.storeActionItem(sampleActionItem);
    
    // Connect to system
    await integrationService.connectToExternalSystem(
      SupportedExternalSystem.JIRA,
      {
        baseUrl: 'https://example.atlassian.net',
        projectKey: 'TEST',
        apiToken: 'dummy-token'
      }
    );
    
    // Integrate the action item
    const integration = await integrationService.integrateActionItem(
      actionItemId,
      SupportedExternalSystem.JIRA,
      { issueType: 'Task' }
    );
    
    // Verify integration succeeded
    expect(integration.success).toBe(true);
    expect(integration.externalId).toBeDefined();
    expect(integration.externalId.startsWith('jira-')).toBe(true);
    
    // Check integration status
    const status = await integrationService.getIntegrationStatus(SupportedExternalSystem.JIRA);
    expect(status.connected).toBe(true);
    expect(status.itemCount).toBe(1);
  });
  
  test('should sync action items from external systems', async () => {
    // First store and integrate an action item
    const actionItemId = await trackingService.storeActionItem(sampleActionItem);
    
    await integrationService.connectToExternalSystem(
      SupportedExternalSystem.JIRA,
      {
        baseUrl: 'https://example.atlassian.net',
        projectKey: 'TEST',
        apiToken: 'dummy-token'
      }
    );
    
    await integrationService.integrateActionItem(
      actionItemId,
      SupportedExternalSystem.JIRA,
      { issueType: 'Task' }
    );
    
    // Sync from external system
    const syncResult = await integrationService.syncFromExternalSystem(
      actionItemId,
      SupportedExternalSystem.JIRA
    );
    
    // In simulated mode, this should succeed and return a random status
    expect(syncResult.success).toBe(true);
    expect(syncResult.updatedStatus).toBeDefined();
    expect(Object.values(ActionItemStatus)).toContain(syncResult.updatedStatus);
    
    // Verify the action item was updated
    const updatedItem = await trackingService.getActionItemById(actionItemId);
    expect(updatedItem).not.toBeNull();
    if (updatedItem) {
      expect(updatedItem.status).toBe(syncResult.updatedStatus);
      if (syncResult.updatedProgress !== undefined) {
        expect(updatedItem.progressPercentage).toBe(syncResult.updatedProgress);
      }
    }
  });
  
  test('should push action item updates to external systems', async () => {
    // First store and integrate an action item
    const actionItemId = await trackingService.storeActionItem(sampleActionItem);
    
    await integrationService.connectToExternalSystem(
      SupportedExternalSystem.JIRA,
      {
        baseUrl: 'https://example.atlassian.net',
        projectKey: 'TEST',
        apiToken: 'dummy-token'
      }
    );
    
    await integrationService.integrateActionItem(
      actionItemId,
      SupportedExternalSystem.JIRA,
      { issueType: 'Task' }
    );
    
    // Update the action item
    await trackingService.updateActionItemStatus(
      actionItemId, 
      ActionItemStatus.IN_PROGRESS,
      25
    );
    
    // Push updates to external system
    const pushResult = await integrationService.pushUpdatesToExternalSystem(
      actionItemId,
      SupportedExternalSystem.JIRA
    );
    
    // In simulated mode, this should succeed
    expect(pushResult).toBe(true);
  });
  
  test('should handle errors gracefully', async () => {
    // Try to sync non-existent action item
    const syncResult = await integrationService.syncFromExternalSystem(
      'non-existent-id',
      SupportedExternalSystem.JIRA
    );
    
    // Should fail gracefully
    expect(syncResult.success).toBe(false);
    
    // Try to push updates for non-existent action item
    const pushResult = await integrationService.pushUpdatesToExternalSystem(
      'non-existent-id',
      SupportedExternalSystem.JIRA
    );
    
    // Should fail gracefully
    expect(pushResult).toBe(false);
    
    // Try to integrate with non-connected system
    const integrationResult = await integrationService.integrateActionItem(
      'some-id',
      SupportedExternalSystem.ASANA,
      {}
    );
    
    // Should fail gracefully
    expect(integrationResult.success).toBe(false);
    expect(integrationResult.externalId).toBe('');
  });
}); 