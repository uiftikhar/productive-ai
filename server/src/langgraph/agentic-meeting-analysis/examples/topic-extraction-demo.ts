/**
 * Topic Extraction Demonstration
 * Part of Milestone 3.1: Enhanced Topic Extraction
 */
import { v4 as uuidv4 } from 'uuid';
import { TopicExtractionServiceImpl } from '../services/topic-extraction.service';
import { TopicVisualizationService } from '../visualization/topic-visualization.service';
import { 
  TopicExtractionConfig 
} from '../interfaces/topic-extraction.interface';
import fs from 'fs';
import path from 'path';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { LogLevel } from '../../../shared/logger/logger.interface';
/**
 * Main function to demonstrate topic extraction
 */
async function runTopicExtractionDemo() {
  // Create a logger
  const logger = new ConsoleLogger({
    level: LogLevel.INFO,
    includeTimestamps: true,
    namespace: 'topic-demo',
    colorize: true
  });
  
  logger.info('Starting Topic Extraction Demonstration');
  
  // Create service instances
  const topicExtractionService = new TopicExtractionServiceImpl(logger);
  const topicVisualizationService = new TopicVisualizationService(logger);
  
  // Generate a meeting ID for demonstration
  const meetingId = uuidv4();
  logger.info(`Generated meeting ID: ${meetingId}`);
  
  // Configure topic extraction
  const config: Partial<TopicExtractionConfig> = {
    maxTopicsPerMeeting: 10,
    minConfidenceThreshold: 0.6,
    enableHierarchicalExtraction: true,
    enableOrganizationalContext: true,
    contextWeighting: {
      recencyWeight: 0.3,
      frequencyWeight: 0.3,
      speakerRoleWeight: 0.2,
      organizationalContextWeight: 0.1,
      previousMeetingsWeight: 0.1
    },
    enableCrossMeetingTopics: true
  };
  
  try {
    // Extract topics
    logger.info('Extracting topics from meeting transcript...');
    const extractionResult = await topicExtractionService.extractTopics(meetingId, config);
    
    // Log extraction results
    logger.info(`Extracted ${extractionResult.topics.length} topics`);
    logger.info(`Dominant topics: ${extractionResult.dominantTopics.map(t => t.name).join(', ')}`);
    logger.info(`Average confidence: ${extractionResult.metricsSummary.averageConfidence.toFixed(2)}`);
    
    // Create visualizations
    logger.info('Creating visualizations...');
    
    // 1. Graph visualization
    const graphVisualization = topicVisualizationService.createGraphVisualization(
      extractionResult.topicGraph
    );
    
    // 2. Timeline visualization
    const timelineVisualization = topicVisualizationService.createTimelineVisualization(
      extractionResult
    );
    
    // 3. Heatmap visualization
    const heatmapVisualization = topicVisualizationService.createHeatmapVisualization(
      extractionResult
    );
    
    // Export visualizations to files
    const outputDir = path.join(__dirname, '..', '..', '..', '..', 'visualizations', 'topic-extraction');
    
    // Ensure directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Export graph visualization in different formats
    const formats = ['json', 'cytoscape', 'd3', 'sigma'] as const;
    
    for (const format of formats) {
      const graphData = topicVisualizationService.exportGraphForVisualization(
        graphVisualization,
        format
      );
      
      const filePath = path.join(outputDir, `topic-graph-${format}.json`);
      fs.writeFileSync(filePath, graphData);
      logger.info(`Exported graph visualization to ${filePath}`);
    }
    
    // Export timeline visualization
    const timelinePath = path.join(outputDir, 'topic-timeline.json');
    fs.writeFileSync(
      timelinePath,
      JSON.stringify(timelineVisualization, null, 2)
    );
    logger.info(`Exported timeline visualization to ${timelinePath}`);
    
    // Export heatmap visualization
    const heatmapPath = path.join(outputDir, 'topic-heatmap.json');
    fs.writeFileSync(
      heatmapPath,
      JSON.stringify(heatmapVisualization, null, 2)
    );
    logger.info(`Exported heatmap visualization to ${heatmapPath}`);
    
    // Export extraction results
    const resultsPath = path.join(outputDir, 'extraction-results.json');
    fs.writeFileSync(
      resultsPath,
      JSON.stringify(extractionResult, null, 2)
    );
    logger.info(`Exported extraction results to ${resultsPath}`);
    
    logger.info('Topic extraction demonstration completed successfully');
  } catch (error) {
    logger.error('Error in topic extraction demonstration', {
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

// Run the demonstration
if (require.main === module) {
  runTopicExtractionDemo()
    .then(() => {
      console.log('Demonstration completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Error in demonstration:', error);
      process.exit(1);
    });
}

export { runTopicExtractionDemo }; 