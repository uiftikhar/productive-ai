/**
 * Tests for Topic Visualization Service
 * Part of Milestone 3.1: Enhanced Topic Extraction
 */
import { v4 as uuidv4 } from 'uuid';
import { TopicExtractionServiceImpl } from '../services/topic-extraction.service';
import { TopicVisualizationService } from '../visualization/topic-visualization.service';
import { TopicGraph } from '../interfaces/topic-extraction.interface';

describe('TopicVisualizationService', () => {
  let topicExtractionService: TopicExtractionServiceImpl;
  let topicVisualizationService: TopicVisualizationService;
  const meetingId = uuidv4();
  
  beforeEach(() => {
    topicExtractionService = new TopicExtractionServiceImpl();
    topicVisualizationService = new TopicVisualizationService();
  });
  
  test('should create graph visualization from topic graph', async () => {
    // Extract topics first
    const extractionResult = await topicExtractionService.extractTopics(meetingId);
    const topicGraph = extractionResult.topicGraph;
    
    // Create graph visualization
    const graphVisualization = topicVisualizationService.createGraphVisualization(topicGraph);
    
    expect(graphVisualization).toBeDefined();
    expect(graphVisualization.nodes.length).toBe(topicGraph.topics.length);
    expect(graphVisualization.edges.length).toBe(topicGraph.relationships.length);
    
    // Check node properties
    expect(graphVisualization.nodes[0]).toHaveProperty('id');
    expect(graphVisualization.nodes[0]).toHaveProperty('label');
    expect(graphVisualization.nodes[0]).toHaveProperty('size');
    expect(graphVisualization.nodes[0]).toHaveProperty('color');
    
    // Check edge properties
    if (graphVisualization.edges.length > 0) {
      expect(graphVisualization.edges[0]).toHaveProperty('id');
      expect(graphVisualization.edges[0]).toHaveProperty('source');
      expect(graphVisualization.edges[0]).toHaveProperty('target');
      expect(graphVisualization.edges[0]).toHaveProperty('width');
    }
  });
  
  test('should create timeline visualization from extraction results', async () => {
    // Extract topics first
    const extractionResult = await topicExtractionService.extractTopics(meetingId);
    
    // Create timeline visualization
    const timelineVisualization = topicVisualizationService.createTimelineVisualization(extractionResult);
    
    expect(timelineVisualization).toBeDefined();
    expect(timelineVisualization.timeline.length).toBeGreaterThan(0);
    
    // Check timeline entry properties
    const firstEntry = timelineVisualization.timeline[0];
    expect(firstEntry).toHaveProperty('time');
    expect(firstEntry).toHaveProperty('topics');
    expect(Array.isArray(firstEntry.topics)).toBe(true);
    
    // Check topic properties in timeline
    if (firstEntry.topics.length > 0) {
      expect(firstEntry.topics[0]).toHaveProperty('id');
      expect(firstEntry.topics[0]).toHaveProperty('name');
      expect(firstEntry.topics[0]).toHaveProperty('isDominant');
      expect(firstEntry.topics[0]).toHaveProperty('relevance');
    }
  });
  
  test('should create heatmap visualization from extraction results', async () => {
    // Extract topics first
    const extractionResult = await topicExtractionService.extractTopics(meetingId);
    
    // Create heatmap visualization
    const heatmapVisualization = topicVisualizationService.createHeatmapVisualization(extractionResult);
    
    expect(heatmapVisualization).toBeDefined();
    expect(heatmapVisualization.speakers.length).toBeGreaterThan(0);
    expect(heatmapVisualization.topics.length).toBe(extractionResult.topics.length);
    expect(heatmapVisualization.heatmap.length).toBe(heatmapVisualization.speakers.length);
    
    // Check heatmap dimensions
    if (heatmapVisualization.heatmap.length > 0) {
      expect(heatmapVisualization.heatmap[0].length).toBe(heatmapVisualization.topics.length);
    }
  });
  
  test('should export graph in different formats', async () => {
    // Extract topics first
    const extractionResult = await topicExtractionService.extractTopics(meetingId);
    const topicGraph = extractionResult.topicGraph;
    
    // Create graph visualization
    const graphVisualization = topicVisualizationService.createGraphVisualization(topicGraph);
    
    // Export in different formats
    const jsonFormat = topicVisualizationService.exportGraphForVisualization(graphVisualization, 'json');
    const cytoscapeFormat = topicVisualizationService.exportGraphForVisualization(graphVisualization, 'cytoscape');
    const d3Format = topicVisualizationService.exportGraphForVisualization(graphVisualization, 'd3');
    const sigmaFormat = topicVisualizationService.exportGraphForVisualization(graphVisualization, 'sigma');
    
    expect(jsonFormat).toBeDefined();
    expect(cytoscapeFormat).toBeDefined();
    expect(d3Format).toBeDefined();
    expect(sigmaFormat).toBeDefined();
    
    // Check that each format is valid JSON
    expect(() => JSON.parse(jsonFormat)).not.toThrow();
    expect(() => JSON.parse(cytoscapeFormat)).not.toThrow();
    expect(() => JSON.parse(d3Format)).not.toThrow();
    expect(() => JSON.parse(sigmaFormat)).not.toThrow();
  });
  
  test('should handle custom configuration options', async () => {
    // Extract topics first
    const extractionResult = await topicExtractionService.extractTopics(meetingId);
    const topicGraph = extractionResult.topicGraph;
    
    // Custom configuration
    const config = {
      colorScheme: ['#ff0000', '#00ff00', '#0000ff'],
      minNodeSize: 5,
      maxNodeSize: 25,
      includeMetadata: false
    };
    
    // Create graph visualization with custom config
    const graphVisualization = topicVisualizationService.createGraphVisualization(topicGraph, config);
    
    expect(graphVisualization).toBeDefined();
    expect(graphVisualization.nodes[0]).not.toHaveProperty('metadata');
    expect(graphVisualization.nodes[0].size).toBeGreaterThanOrEqual(config.minNodeSize);
    expect(graphVisualization.nodes[0].size).toBeLessThanOrEqual(config.maxNodeSize);
    expect(['#ff0000', '#00ff00', '#0000ff']).toContain(graphVisualization.nodes[0].color);
  });
}); 