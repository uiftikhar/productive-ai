# Enhanced Topic Extraction System

## Milestone 3.1: Enhanced Topic Extraction

This component provides advanced topic extraction, relationship mapping, and visualization capabilities for meeting analysis. It identifies key topics discussed in meetings, establishes relationships between them, and presents them in various visualization formats.

## Architecture

The topic extraction system includes the following components:

1. **Interfaces**: Defines the data models and service interfaces
2. **Topic Extraction Service**: Implements the core topic extraction functionality
3. **Topic Visualization Service**: Provides visualization capabilities for extracted topics
4. **Service Registry Integration**: Integrates with the existing service registry

## Key Features

### Topic Extraction
- Precision-focused topic extraction with confidence scores
- Context weighting mechanisms for relevance scoring
- Hierarchical topic mapping (parent-child relationships)
- Related topic identification with relationship strength
- Topic timeline generation showing topic evolution over time
- Speaker contributions to topics

### Context Weighting
The system uses multiple factors to determine topic relevance:
- Recency of mentions (more recent mentions increase relevance)
- Frequency of mentions (more mentions increase relevance)
- Speaker role importance (mentions by important speakers increase relevance)
- Organizational context (alignment with business objectives increases relevance)
- Previous meeting history (continuity from previous meetings increases relevance)

### Organizational Context
Topics are analyzed for their relevance to:
- Departments
- Projects
- Teams
- Business objectives
- Strategic alignment

### Visualization
The system provides multiple visualization formats:
- **Graph Visualization**: Shows topics as nodes and relationships as edges
- **Timeline Visualization**: Shows topic evolution over time
- **Heatmap Visualization**: Shows speaker contributions to different topics

### Export Formats
Graph visualizations can be exported in formats compatible with popular visualization libraries:
- JSON (generic)
- Cytoscape.js
- D3.js
- Sigma.js

## Usage

### Basic Topic Extraction

```typescript
import { TopicExtractionServiceImpl } from '../services/topic-extraction.service';

// Create service instance
const topicExtractionService = new TopicExtractionServiceImpl();

// Extract topics
const extractionResult = await topicExtractionService.extractTopics('meeting-123');

// Access extracted topics
console.log(`Extracted ${extractionResult.topics.length} topics`);
console.log(`Dominant topics: ${extractionResult.dominantTopics.map(t => t.name).join(', ')}`);
```

### Custom Configuration

```typescript
// Configure extraction parameters
const config = {
  maxTopicsPerMeeting: 10,
  minConfidenceThreshold: 0.7,
  enableHierarchicalExtraction: true,
  enableOrganizationalContext: true,
  contextWeighting: {
    recencyWeight: 0.4,
    frequencyWeight: 0.3,
    speakerRoleWeight: 0.1,
    organizationalContextWeight: 0.1,
    previousMeetingsWeight: 0.1
  }
};

// Extract topics with custom configuration
const extractionResult = await topicExtractionService.extractTopics('meeting-123', config);
```

### Creating Visualizations

```typescript
import { TopicVisualizationService } from '../visualization/topic-visualization.service';

// Create service instance
const visualizationService = new TopicVisualizationService();

// Create graph visualization
const graphVisualization = visualizationService.createGraphVisualization(
  extractionResult.topicGraph
);

// Create timeline visualization
const timelineVisualization = visualizationService.createTimelineVisualization(
  extractionResult
);

// Create heatmap visualization
const heatmapVisualization = visualizationService.createHeatmapVisualization(
  extractionResult
);

// Export for use with visualization libraries
const d3Format = visualizationService.exportGraphForVisualization(
  graphVisualization, 'd3'
);
```

### Using the Service Registry

```typescript
import { ServiceRegistry } from '../services/service-registry';

// Get services from registry
const registry = new ServiceRegistry();
const topicExtractor = registry.getTopicExtractionService();
const visualizer = registry.getTopicVisualizationService();

// Use services
const result = await topicExtractor.extractTopics('meeting-123');
const visualization = visualizer.createGraphVisualization(result.topicGraph);
```

## Running the Demo

You can run the topic extraction demonstration script:

```bash
# Compile TypeScript
npm run build

# Run the demo
node dist/langgraph/agentic-meeting-analysis/examples/topic-extraction-demo.js
```

The demo will:
1. Extract topics from a simulated meeting
2. Create various visualizations
3. Export the results to the `visualizations/topic-extraction` directory

## Data Model

### Topic
```typescript
interface Topic {
  id: string;
  name: string;
  description?: string;
  keywords: string[];
  relevanceScore: number; // 0-1 score
  confidence: number; // 0-1 score
  mentionCount: number;
  firstMentionTime?: number;
  lastMentionTime?: number;
  speakerIds: string[];
  segments: TopicSegment[];
  parentTopicId?: string;
  childTopicIds: string[];
  relatedTopicIds: Map<string, number>;
  organizationalContext?: OrganizationalContext;
  metadata: Record<string, any>;
}
```

### Topic Relationship
```typescript
interface TopicRelationship {
  sourceTopicId: string;
  targetTopicId: string;
  relationshipType: 'hierarchy' | 'related' | 'sequence' | 'causal';
  strength: number; // 0-1 score
  description?: string;
}
```

See the interface definitions for complete data models.

## Implementation Notes

- The current implementation provides a simplified version using mock data generation
- In a production environment, the topic extraction would use NLP and LLM techniques to analyze actual meeting transcripts
- The service is designed to be extensible for integration with more sophisticated NLP pipelines

## Future Enhancements

Planned enhancements include:
- Integration with real speech-to-text transcription services
- Advanced NLP for more accurate topic extraction
- Topic clustering and semantic similarity calculation
- Real-time topic extraction during ongoing meetings
- Integration with the action item processing system 