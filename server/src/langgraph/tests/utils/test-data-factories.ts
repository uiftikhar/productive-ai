/**
 * Test Data Factories
 * 
 * This module provides factory functions to generate test data for different scenarios.
 * Using these factories ensures consistent test data across tests.
 */

/**
 * Creates a mock meeting transcript for testing
 */
interface MockTranscriptOptions {
  duration?: number;
  participants?: number;
  topics?: string[];
  speakers?: string[];
  technicalTerms?: string[];
  meetingId?: string;
}

export function createMockTranscript(options: MockTranscriptOptions = {}) {
  const { 
    duration = 30, 
    participants = 3, 
    topics = ['General Discussion'],
    speakers = ['Speaker 1', 'Speaker 2', 'Speaker 3'],
    technicalTerms = []
  } = options;
  
  // Generate mock transcript
  return {
    meetingId: options.meetingId || `mock-transcript-${Date.now()}`,
    duration,
    participants,
    topics,
    speakers,
    technicalTerms,
    segments: generateMockTranscriptSegments(duration, speakers, topics, technicalTerms)
  };
}

/**
 * Generate mock transcript segments
 */
function generateMockTranscriptSegments(
  duration: number, 
  speakers: string[], 
  topics: string[],
  technicalTerms: string[] = []
) {
  const segments = [];
  const segmentCount = Math.max(5, Math.floor(duration / 5));
  
  for (let i = 0; i < segmentCount; i++) {
    const speaker = speakers[i % speakers.length];
    const topic = topics[i % topics.length];
    const includesTechTerm = technicalTerms.length > 0 && (i % 3 === 0);
    const techTerm = includesTechTerm ? technicalTerms[i % technicalTerms.length] : '';
    
    segments.push({
      id: `segment-${i}`,
      speaker,
      timestamp: i * 5,
      content: `${speaker} discusses ${topic}${includesTechTerm ? ` mentioning ${techTerm}` : ''}.`,
      confidence: 0.95
    });
  }
  
  return segments;
}

/**
 * Creates a mock meeting analysis goal for testing
 */
interface MockAnalysisGoalOptions {
  primaryFocus?: string;
  extractActionItems?: boolean;
  identifyRisks?: boolean;
  generateSummary?: boolean;
  customInstructions?: string;
}

export function createMockAnalysisGoal(options: MockAnalysisGoalOptions = {}) {
  const {
    primaryFocus = 'summary',
    extractActionItems = true,
    identifyRisks = false,
    generateSummary = true
  } = options;
  
  return {
    primaryFocus,
    extractActionItems,
    identifyRisks,
    generateSummary,
    customInstructions: options.customInstructions || ''
  };
}

/**
 * Creates a mock team configuration for testing
 */
export function createMockTeamConfig(options: {
  size?: number;
  specialties?: string[];
} = {}) {
  const {
    size = 4,
    specialties = ['coordination', 'topic_analysis', 'action_item_extraction', 'summary_generation']
  } = options;
  
  return {
    size,
    specialties,
    collaborationStyle: 'cooperative',
    communicationProtocol: 'structured',
    adaptabilityLevel: 'high'
  };
}

/**
 * Creates mock analysis results for testing
 */
export function createMockAnalysisResults() {
  return {
    summary: 'This meeting covered product roadmap, technical architecture, and budget allocation. Key decisions were made about prioritization and next steps.',
    actionItems: [
      {
        description: 'Research technical options',
        assignee: 'Engineering Team',
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        priority: 'high'
      },
      {
        description: 'Prepare budget proposal',
        assignee: 'Finance Team',
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        priority: 'medium'
      }
    ],
    topics: [
      {
        name: 'Product Roadmap',
        confidence: 0.9,
        keyPoints: ['Q3 deliverables', 'Feature prioritization', 'Customer feedback']
      },
      {
        name: 'Technical Architecture',
        confidence: 0.85,
        keyPoints: ['Scalability concerns', 'Integration requirements', 'Tech stack decisions']
      },
      {
        name: 'Budget Allocation',
        confidence: 0.8,
        keyPoints: ['Q3 budget', 'Resource allocation', 'Cost-saving measures']
      }
    ],
    sentimentAnalysis: {
      overall: 'positive',
      byTopic: {
        'Product Roadmap': 'very positive',
        'Technical Architecture': 'neutral',
        'Budget Allocation': 'slightly negative'
      }
    }
  };
} 