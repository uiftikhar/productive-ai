import { HierarchicalStateRepository, MeetingAnalysisResult } from '../hierarchical-state-repository';
import { PersistentStateManager } from '../persistent-state-manager';
import { MemoryStorageAdapter } from '../storage-adapters/memory-storage.adapter';

describe('HierarchicalStateRepository', () => {
  let stateManager: PersistentStateManager;
  let repository: HierarchicalStateRepository;
  
  // Sample meeting data
  const meeting1: MeetingAnalysisResult = {
    meetingId: 'meeting1',
    title: 'Product Planning',
    timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
    duration: 3600,
    participants: [
      { id: 'user1', name: 'Alice', role: 'Product Manager', speakingTime: 1200 },
      { id: 'user2', name: 'Bob', role: 'Engineer', speakingTime: 900 },
      { id: 'user3', name: 'Charlie', role: 'Designer', speakingTime: 600 }
    ],
    topics: [
      { id: 'topic1', name: 'Roadmap', relevance: 0.9, keywords: ['planning', 'timeline', 'features'] },
      { id: 'topic2', name: 'Technical Debt', relevance: 0.7, keywords: ['refactoring', 'quality'] }
    ],
    actionItems: [
      { id: 'action1', description: 'Create wireframes', assignees: ['user3'], status: 'pending' },
      { id: 'action2', description: 'Update roadmap', assignees: ['user1'], status: 'pending' }
    ],
    tags: ['planning', 'product', 'q3-goals']
  };
  
  const meeting2: MeetingAnalysisResult = {
    meetingId: 'meeting2',
    title: 'Technical Review',
    timestamp: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
    duration: 1800,
    participants: [
      { id: 'user2', name: 'Bob', role: 'Engineer', speakingTime: 1000 },
      { id: 'user4', name: 'David', role: 'Engineer', speakingTime: 700 }
    ],
    topics: [
      { id: 'topic3', name: 'Architecture', relevance: 0.8, keywords: ['design', 'patterns'] },
      { id: 'topic4', name: 'Technical Debt', relevance: 0.5, keywords: ['code quality', 'refactoring'] }
    ],
    actionItems: [
      { id: 'action3', description: 'Refactor authentication service', assignees: ['user2'], status: 'pending' }
    ],
    tags: ['technical', 'architecture', 'refactoring']
  };
  
  const meeting3: MeetingAnalysisResult = {
    meetingId: 'meeting3',
    title: 'Design Review',
    timestamp: Date.now() - 1 * 24 * 60 * 60 * 1000, // Yesterday
    duration: 2700,
    participants: [
      { id: 'user1', name: 'Alice', role: 'Product Manager', speakingTime: 800 },
      { id: 'user3', name: 'Charlie', role: 'Designer', speakingTime: 1500 }
    ],
    topics: [
      { id: 'topic5', name: 'UI Components', relevance: 0.9, keywords: ['design system', 'consistency'] },
      { id: 'topic6', name: 'User Feedback', relevance: 0.8, keywords: ['usability', 'testing'] }
    ],
    actionItems: [
      { id: 'action4', description: 'Update design system', assignees: ['user3'], status: 'pending' },
      { id: 'action5', description: 'Review user feedback', assignees: ['user1', 'user3'], status: 'pending' }
    ],
    tags: ['design', 'ux', 'feedback']
  };
  
  beforeEach(async () => {
    // Create a fresh storage adapter for each test
    const storageAdapter = new MemoryStorageAdapter({
      namespace: 'test',
      simulateNetworkDelay: false
    });
    
    // Create a state manager using the memory adapter
    stateManager = new PersistentStateManager({
      storageAdapter,
      namespace: 'test'
    });
    
    // Create a repository using the state manager
    repository = new HierarchicalStateRepository({
      stateManager,
      buildIndices: true
    });
    
    // Initialize the repository
    await repository.initialize();
    
    // Store sample meetings
    await repository.storeMeetingResult(meeting1);
    await repository.storeMeetingResult(meeting2);
    await repository.storeMeetingResult(meeting3);
  });
  
  test('should find related meetings by participant', async () => {
    // Find meetings related to meeting1 (implicitly by participants)
    const relatedToMeeting1 = await repository.findRelatedMeetings('meeting1');
    
    // Should find meeting2 (Bob) and meeting3 (Alice, Charlie)
    expect(relatedToMeeting1).toHaveLength(2);
    expect(relatedToMeeting1).toContain('meeting2');
    expect(relatedToMeeting1).toContain('meeting3');
    
    // Find meetings with specific participants
    const meetingsWithAlice = await repository.findRelatedMeetings('meeting2', {
      participants: ['user1']
    });
    
    // Should find meeting1 and meeting3 (both have Alice)
    expect(meetingsWithAlice).toHaveLength(2);
    expect(meetingsWithAlice).toContain('meeting1');
    expect(meetingsWithAlice).toContain('meeting3');
  });
  
  test('should find related meetings by topic', async () => {
    // Find meetings related to meeting1 (implicitly by topics)
    const relatedToMeeting1 = await repository.findRelatedMeetings('meeting1', {
      // Focus only on topics, not participants
      participants: []
    });
    
    // Should find meeting2 (Technical Debt)
    expect(relatedToMeeting1).toContain('meeting2');
    
    // Find meetings with specific topics
    const meetingsWithDesign = await repository.findRelatedMeetings('meeting1', {
      topics: ['UI Components', 'Design System']
    });
    
    // Should include meeting3 at minimum which has UI Components
    expect(meetingsWithDesign.length).toBeGreaterThanOrEqual(1);
    expect(meetingsWithDesign).toContain('meeting3');
  });
  
  test('should find related meetings by tags', async () => {
    // Find meetings with specific tags
    const technicalMeetings = await repository.findRelatedMeetings('meeting3', {
      tags: ['technical', 'architecture']
    });
    
    // Should include meeting2 at minimum
    expect(technicalMeetings.length).toBeGreaterThanOrEqual(1);
    expect(technicalMeetings).toContain('meeting2');
  });
  
  test('should find related meetings by time range', async () => {
    // Find recent meetings (last 5 days)
    const recentMeetings = await repository.findRelatedMeetings('meeting1', {
      timeRange: {
        start: Date.now() - 5 * 24 * 60 * 60 * 1000
      }
    });
    
    // Should find meeting2 and meeting3
    expect(recentMeetings).toHaveLength(2);
    expect(recentMeetings).toContain('meeting2');
    expect(recentMeetings).toContain('meeting3');
  });
  
  test('should get common topics across meetings', async () => {
    // Get common topics across all meetings
    const commonTopics = await repository.getCommonTopics(['meeting1', 'meeting2', 'meeting3']);
    
    // Should find Technical Debt as the most common topic
    expect(commonTopics.length).toBeGreaterThan(0);
    
    // Check first topic is Technical Debt (appears in meeting1 and meeting2)
    const mostCommon = commonTopics[0];
    expect(mostCommon.name.toLowerCase()).toContain('technical debt');
    expect(mostCommon.frequency).toBe(2);
    expect(mostCommon.meetingIds).toContain('meeting1');
    expect(mostCommon.meetingIds).toContain('meeting2');
  });
  
  test('should get participant history', async () => {
    // Get history for Alice (user1)
    const aliceHistory = await repository.getParticipantHistory('user1');
    
    // Verify basic information
    expect(aliceHistory).not.toBeNull();
    expect(aliceHistory?.name).toBe('Alice');
    
    // Verify meetings
    expect(aliceHistory?.meetings).toHaveLength(2);
    expect(aliceHistory?.meetings.map(m => m.meetingId)).toContain('meeting1');
    expect(aliceHistory?.meetings.map(m => m.meetingId)).toContain('meeting3');
    
    // Verify action items
    expect(aliceHistory?.actionItems).toBeDefined();
    expect(aliceHistory?.actionItems?.length).toBeGreaterThan(0);
    
    // Verify collaborators
    expect(aliceHistory?.collaborators).toBeDefined();
    expect(aliceHistory?.collaborators?.map(c => c.id)).toContain('user2');
    expect(aliceHistory?.collaborators?.map(c => c.id)).toContain('user3');
    
    // Get history for Bob (user2)
    const bobHistory = await repository.getParticipantHistory('user2');
    
    // Verify basic information
    expect(bobHistory).not.toBeNull();
    expect(bobHistory?.name).toBe('Bob');
    
    // Verify meetings
    expect(bobHistory?.meetings).toHaveLength(2);
    expect(bobHistory?.meetings.map(m => m.meetingId)).toContain('meeting1');
    expect(bobHistory?.meetings.map(m => m.meetingId)).toContain('meeting2');
  });
}); 