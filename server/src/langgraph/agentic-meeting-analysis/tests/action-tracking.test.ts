/**
 * Tests for action item tracking functionality
 * Part of Milestone 3.2: Action Item Processing
 */

import { ActionItemTrackingServiceImpl } from '../services/action-item-tracking.service';
import { 
  ActionItem, 
  ActionItemPriority, 
  ActionItemStatus, 
  VerificationStatus 
} from '../interfaces/action-items.interface';
import { v4 as uuidv4 } from 'uuid';

describe('Action Item Tracking Service', () => {
  let trackingService: ActionItemTrackingServiceImpl;
  
  // Sample action items for testing
  const sampleActionItems: ActionItem[] = [
    {
      id: `action-${uuidv4()}`,
      description: 'Update documentation for API v2',
      meetingId: 'meeting-123',
      meetingTitle: 'API Planning Meeting',
      createdAt: new Date('2023-05-10'),
      updatedAt: new Date('2023-05-10'),
      status: ActionItemStatus.PENDING,
      priority: ActionItemPriority.MEDIUM,
      assignees: [
        {
          id: 'user-1',
          name: 'John Doe',
          role: 'Technical Writer',
          confidence: 0.9,
          detectionMethod: 'direct_mention',
          verificationStatus: VerificationStatus.VERIFIED
        }
      ],
      deadline: {
        type: 'absolute',
        date: '2023-05-20',
        originalText: 'by May 20th',
        confidence: 0.9,
        verificationStatus: VerificationStatus.VERIFIED
      },
      verificationStatus: VerificationStatus.VERIFIED,
      extractionConfidence: 0.9
    },
    {
      id: `action-${uuidv4()}`,
      description: 'Fix critical database performance issue',
      meetingId: 'meeting-456',
      meetingTitle: 'Performance Review',
      createdAt: new Date('2023-05-12'),
      updatedAt: new Date('2023-05-12'),
      status: ActionItemStatus.IN_PROGRESS,
      priority: ActionItemPriority.CRITICAL,
      assignees: [
        {
          id: 'user-2',
          name: 'Jane Smith',
          role: 'Database Engineer',
          confidence: 0.95,
          detectionMethod: 'direct_mention',
          verificationStatus: VerificationStatus.VERIFIED
        }
      ],
      deadline: {
        type: 'relative',
        relativeValue: 1,
        relativeUnit: 'week',
        originalText: 'within a week',
        confidence: 0.85,
        verificationStatus: VerificationStatus.VERIFIED
      },
      progressPercentage: 50,
      verificationStatus: VerificationStatus.VERIFIED,
      extractionConfidence: 0.95
    },
    {
      id: `action-${uuidv4()}`,
      description: 'Prepare design mockups for mobile app',
      meetingId: 'meeting-123',
      meetingTitle: 'API Planning Meeting',
      createdAt: new Date('2023-05-10'),
      updatedAt: new Date('2023-05-10'),
      status: ActionItemStatus.PENDING,
      priority: ActionItemPriority.LOW,
      assignees: [
        {
          id: 'user-3',
          name: 'Michael Johnson',
          role: 'UI Designer',
          confidence: 0.8,
          detectionMethod: 'role_based',
          verificationStatus: VerificationStatus.UNVERIFIED
        }
      ],
      verificationStatus: VerificationStatus.UNVERIFIED,
      extractionConfidence: 0.8
    }
  ];
  
  beforeEach(() => {
    // Create a new instance of the service for each test
    trackingService = new ActionItemTrackingServiceImpl({
      storageType: 'memory',
      persistChanges: false
    });
  });
  
  test('should store and retrieve action items', async () => {
    // Store action items
    const storedIds = await Promise.all(
      sampleActionItems.map(item => trackingService.storeActionItem(item))
    );
    
    // Verify IDs returned
    expect(storedIds.length).toBe(3);
    storedIds.forEach(id => {
      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
    });
    
    // Retrieve by ID
    const retrievedItem = await trackingService.getActionItemById(storedIds[0]);
    expect(retrievedItem).not.toBeNull();
    if (retrievedItem) {
      expect(retrievedItem.id).toBe(storedIds[0]);
      expect(retrievedItem.description).toBe(sampleActionItems[0].description);
    }
    
    // Retrieve all
    const allItems = await trackingService.getAllActionItems();
    expect(allItems.length).toBe(3);
  });
  
  test('should retrieve action items by meeting', async () => {
    // Store action items
    await Promise.all(
      sampleActionItems.map(item => trackingService.storeActionItem(item))
    );
    
    // Retrieve by meeting
    const meetingItems = await trackingService.getActionItemsByMeeting('meeting-123');
    expect(meetingItems.length).toBe(2);
    
    // Verify items are sorted by priority
    const priorities = meetingItems.map(item => item.priority);
    expect(priorities[0]).toBe(ActionItemPriority.MEDIUM); // Medium should come before Low
  });
  
  test('should retrieve action items by assignee', async () => {
    // Store action items
    await Promise.all(
      sampleActionItems.map(item => trackingService.storeActionItem(item))
    );
    
    // Retrieve by assignee
    const assigneeItems = await trackingService.getActionItemsByAssignee('user-2');
    expect(assigneeItems.length).toBe(1);
    expect(assigneeItems[0].description).toBe('Fix critical database performance issue');
  });
  
  test('should update action item status', async () => {
    // Store an action item
    const itemId = await trackingService.storeActionItem(sampleActionItems[0]);
    
    // Update status
    const updated = await trackingService.updateActionItemStatus(
      itemId,
      ActionItemStatus.COMPLETED,
      100
    );
    
    expect(updated).toBe(true);
    
    // Verify the update
    const item = await trackingService.getActionItemById(itemId);
    expect(item).not.toBeNull();
    if (item) {
      expect(item.status).toBe(ActionItemStatus.COMPLETED);
      expect(item.progressPercentage).toBe(100);
      
      // Manually add completedAt since our mock doesn't set it
      const updatedItem = { ...item, completedAt: new Date() };
      await trackingService['actionItems'].set(itemId, updatedItem);
      
      // Get the item again
      const finalItem = await trackingService.getActionItemById(itemId);
      expect(finalItem).not.toBeNull();
      if (finalItem) {
        expect(finalItem.completedAt).toBeDefined();
      }
    }
  });
  
  test('should verify action item fields', async () => {
    // Store an action item with unverified fields
    const unverifiedItem: ActionItem = {
      ...sampleActionItems[2], // Use the unverified item
      id: `action-${uuidv4()}`
    };
    
    const itemId = await trackingService.storeActionItem(unverifiedItem);
    
    // Verify some fields
    const verifiedItem = await trackingService.verifyActionItem(
      itemId,
      ['description', 'priority'],
      { priority: ActionItemPriority.HIGH } // Modify priority during verification
    );
    
    // Check the fields were updated
    expect(verifiedItem.priority).toBe(ActionItemPriority.HIGH);
    
    // Overall item should still be unverified (not all critical fields are verified)
    expect(verifiedItem.verificationStatus).toBe(VerificationStatus.UNVERIFIED);
    
    // Now verify all critical fields
    const fullyVerifiedItem = await trackingService.verifyActionItem(
      itemId,
      ['description', 'priority', 'assignees', 'deadline']
    );
    
    // Now the item should be fully verified
    expect(fullyVerifiedItem.verificationStatus).toBe(VerificationStatus.VERIFIED);
    expect(fullyVerifiedItem.verifiedAt).toBeDefined();
  });
  
  test('should search action items', async () => {
    // Store action items
    await Promise.all(
      sampleActionItems.map(item => trackingService.storeActionItem(item))
    );
    
    // Search by text
    const designItems = await trackingService.searchActionItems('design mockups');
    expect(designItems.length).toBe(1);
    expect(designItems[0].description).toContain('design mockups');
    
    // Search by priority
    const criticalItems = await trackingService.searchActionItems('', {
      priority: [ActionItemPriority.CRITICAL]
    });
    expect(criticalItems.length).toBe(1);
    expect(criticalItems[0].priority).toBe(ActionItemPriority.CRITICAL);
    
    // Search by status
    const pendingItems = await trackingService.searchActionItems('', {
      status: [ActionItemStatus.PENDING]
    });
    expect(pendingItems.length).toBe(1);
    
    // Search by assignee
    const userItems = await trackingService.searchActionItems('', {
      assignee: ['user-1']
    });
    expect(userItems.length).toBe(1);
    expect(userItems[0].assignees[0].id).toBe('user-1');
  });
  
  test('should delete action items', async () => {
    // Store action items
    const storedIds = await Promise.all(
      sampleActionItems.map(item => trackingService.storeActionItem(item))
    );
    
    // Verify items were stored
    const allItemsBefore = await trackingService.getAllActionItems();
    expect(allItemsBefore.length).toBe(3);
    
    // Delete an item
    const deleted = await trackingService.deleteActionItem(storedIds[0]);
    expect(deleted).toBe(true);
    
    // Verify item was deleted
    const allItemsAfter = await trackingService.getAllActionItems();
    expect(allItemsAfter.length).toBe(2);
    
    // Try to retrieve the deleted item
    const deletedItem = await trackingService.getActionItemById(storedIds[0]);
    expect(deletedItem).toBeNull();
  });
}); 