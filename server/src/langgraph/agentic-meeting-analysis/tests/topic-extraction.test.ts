/**
 * Tests for Topic Extraction Service
 * Part of Milestone 3.1: Enhanced Topic Extraction
 */
import { v4 as uuidv4 } from 'uuid';
import { TopicExtractionServiceImpl } from '../services/topic-extraction.service';
import { 
  Topic, 
  TopicExtractionConfig 
} from '../interfaces/topic-extraction.interface';

describe('TopicExtractionService', () => {
  let topicExtractionService: TopicExtractionServiceImpl;
  const meetingId = uuidv4();
  
  beforeEach(() => {
    topicExtractionService = new TopicExtractionServiceImpl();
  });
  
  test('should extract topics from meeting transcript', async () => {
    const result = await topicExtractionService.extractTopics(meetingId);
    
    expect(result).toBeDefined();
    expect(result.meetingId).toBe(meetingId);
    expect(result.topics.length).toBeGreaterThan(0);
    expect(result.topicGraph).toBeDefined();
    expect(result.dominantTopics.length).toBeGreaterThan(0);
    expect(result.metricsSummary).toBeDefined();
  });
  
  test('should respect configuration options', async () => {
    const config: Partial<TopicExtractionConfig> = {
      maxTopicsPerMeeting: 2,
      minConfidenceThreshold: 0.8,
      enableHierarchicalExtraction: false
    };
    
    const result = await topicExtractionService.extractTopics(meetingId, config);
    
    expect(result.dominantTopics.length).toBeLessThanOrEqual(2);
    expect(result.topics.every(t => t.confidence >= 0.8)).toBe(true);
  });
  
  test('should retrieve topics for a meeting', async () => {
    // Extract topics first
    const extractionResult = await topicExtractionService.extractTopics(meetingId);
    
    // Get topics for meeting
    const topics = await topicExtractionService.getTopicsForMeeting(meetingId);
    
    expect(topics.length).toBe(extractionResult.topics.length);
    expect(topics[0].id).toBe(extractionResult.topics[0].id);
  });
  
  test('should get topic by ID', async () => {
    // Extract topics first
    const extractionResult = await topicExtractionService.extractTopics(meetingId);
    const firstTopicId = extractionResult.topics[0].id;
    
    // Get topic by ID
    const topic = await topicExtractionService.getTopicById(firstTopicId);
    
    expect(topic).toBeDefined();
    expect(topic?.id).toBe(firstTopicId);
  });
  
  test('should update topic metadata', async () => {
    // Extract topics first
    const extractionResult = await topicExtractionService.extractTopics(meetingId);
    const firstTopicId = extractionResult.topics[0].id;
    
    // Update metadata
    const updatedMetadata = {
      isReviewed: true,
      reviewedBy: 'user1',
      importance: 'high'
    };
    
    const updatedTopic = await topicExtractionService.updateTopicMetadata(
      firstTopicId,
      updatedMetadata
    );
    
    expect(updatedTopic.metadata).toMatchObject(updatedMetadata);
    
    // Verify the update persisted
    const retrievedTopic = await topicExtractionService.getTopicById(firstTopicId);
    expect(retrievedTopic?.metadata).toMatchObject(updatedMetadata);
  });
  
  test('should get topic graph for a meeting', async () => {
    // Extract topics first
    await topicExtractionService.extractTopics(meetingId);
    
    // Get topic graph
    const topicGraph = await topicExtractionService.getTopicGraph(meetingId);
    
    expect(topicGraph).toBeDefined();
    expect(topicGraph.topics.length).toBeGreaterThan(0);
    expect(topicGraph.relationships.length).toBeGreaterThan(0);
  });
  
  test('should find related topics', async () => {
    // Extract topics for two meetings
    const meeting1Id = uuidv4();
    const meeting2Id = uuidv4();
    
    const result1 = await topicExtractionService.extractTopics(meeting1Id);
    const result2 = await topicExtractionService.extractTopics(meeting2Id);
    
    // Find related topics for the first topic from meeting 1
    const firstTopicId = result1.topics[0].id;
    const relatedTopics = await topicExtractionService.findRelatedTopics(firstTopicId, 5);
    
    expect(relatedTopics).toBeDefined();
    expect(Array.isArray(relatedTopics)).toBe(true);
  });
}); 