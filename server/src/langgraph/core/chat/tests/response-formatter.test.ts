import { ResponseFormatterService, AnalysisResult, Visualization, Clarification } from '../response-formatter.service';

describe('ResponseFormatterService', () => {
  let formatter: ResponseFormatterService;
  
  beforeEach(() => {
    formatter = new ResponseFormatterService({
      maxResponseLength: 1000
    });
  });
  
  describe('formatTranscriptProcessingResult', () => {
    it('should format a transcript processing result with all data', () => {
      const result: AnalysisResult = {
        meetingId: 'meeting-123',
        timestamp: Date.now(),
        summary: {
          short: 'This is a brief summary'
        },
        participants: [
          { id: 'p1', name: 'John Doe', speakingTime: 300, contributions: 15 },
          { id: 'p2', name: 'Jane Smith', speakingTime: 240, contributions: 12 },
          { id: 'p3', name: 'Bob Johnson', speakingTime: 180, contributions: 10 },
          { id: 'p4', name: 'Alice Brown', speakingTime: 120, contributions: 8 }
        ],
        insights: [
          'First insight',
          'Second insight',
          'Third insight',
          'Fourth insight'
        ],
        actionItems: [
          { id: 'a1', description: 'Task 1', assignees: ['John'] },
          { id: 'a2', description: 'Task 2', assignees: ['Jane'] }
        ]
      };
      
      const response = formatter.formatTranscriptProcessingResult(result);
      
      expect(response.type).toBe('analysis');
      expect(response.content).toContain('meeting-123');
      expect(response.content).toContain('This is a brief summary');
      expect(response.content).toContain('John Doe');
      expect(response.content).toContain('Jane Smith');
      expect(response.content).toContain('Bob Johnson');
      expect(response.content).toContain('First insight');
      expect(response.content).toContain('Second insight');
      expect(response.content).toContain('Third insight');
      expect(response.content).toContain('2 action items');
    });
    
    it('should format a minimal transcript processing result', () => {
      const result: AnalysisResult = {
        meetingId: 'meeting-123',
        timestamp: Date.now()
      };
      
      const response = formatter.formatTranscriptProcessingResult(result);
      
      expect(response.type).toBe('analysis');
      expect(response.content).toContain('meeting-123');
      expect(response.content).not.toContain('Summary');
      expect(response.content).not.toContain('Participants');
      expect(response.content).not.toContain('Insights');
      expect(response.content).not.toContain('Action Items');
    });
    
    it('should include visualization attachment if available', () => {
      const result: AnalysisResult = {
        meetingId: 'meeting-123',
        timestamp: Date.now(),
        visualizations: [
          {
            type: 'participant_breakdown',
            data: '<svg>test visualization</svg>',
            metadata: {
              title: 'Participant Breakdown'
            }
          }
        ]
      };
      
      const response = formatter.formatTranscriptProcessingResult(result);
      
      expect(response.attachments).toBeDefined();
      expect(response.attachments?.length).toBe(1);
      expect(response.attachments?.[0].type).toBe('visualization');
      expect(response.attachments?.[0].data).toBe('<svg>test visualization</svg>');
      expect(response.attachments?.[0].metadata?.visualizationType).toBe('participant_breakdown');
    });
  });
  
  describe('formatAnalysisQueryResult', () => {
    it('should format a string result', () => {
      const result = 'This is a simple text response';
      
      const response = formatter.formatAnalysisQueryResult(result, 'What happened?');
      
      expect(response.type).toBe('text');
      expect(response.content).toBe('This is a simple text response');
    });
    
    it('should format an array of strings', () => {
      const result = ['Item 1', 'Item 2', 'Item 3'];
      
      const response = formatter.formatAnalysisQueryResult(result, 'List items');
      
      expect(response.type).toBe('text');
      expect(response.content).toContain('• Item 1');
      expect(response.content).toContain('• Item 2');
      expect(response.content).toContain('• Item 3');
    });
    
    it('should format a summary result', () => {
      const result = {
        summary: {
          detailed: 'This is a detailed summary'
        }
      };
      
      const response = formatter.formatAnalysisQueryResult(result, 'Show summary');
      
      expect(response.type).toBe('analysis');
      expect(response.content).toContain('Meeting Summary');
      expect(response.content).toContain('This is a detailed summary');
    });
    
    it('should format a participants result', () => {
      const result = {
        participants: [
          { id: 'p1', name: 'John Doe', speakingTime: 300, contributions: 15, role: 'Manager' },
          { id: 'p2', name: 'Jane Smith', speakingTime: 240, contributions: 12 }
        ]
      };
      
      const response = formatter.formatAnalysisQueryResult(result, 'Who participated?');
      
      expect(response.content).toContain('Participant Information');
      expect(response.content).toContain('John Doe');
      expect(response.content).toContain('5m 0s');
      expect(response.content).toContain('15 contributions');
      expect(response.content).toContain('Manager');
      expect(response.content).toContain('Jane Smith');
    });
    
    it('should format a topics result', () => {
      const result = {
        topics: [
          { id: 't1', name: 'Project Status', relevance: 0.8, keywords: ['deadline', 'progress'] },
          { id: 't2', name: 'Budget', relevance: 0.6 }
        ]
      };
      
      const response = formatter.formatAnalysisQueryResult(result, 'What topics were discussed?');
      
      expect(response.content).toContain('Topics Discussed');
      expect(response.content).toContain('Project Status');
      expect(response.content).toContain('80% relevance');
      expect(response.content).toContain('Keywords: deadline, progress');
      expect(response.content).toContain('Budget');
      expect(response.content).toContain('60% relevance');
    });
    
    it('should format an action items result', () => {
      const result = {
        actionItems: [
          { 
            id: 'a1', 
            description: 'Follow up with client', 
            assignees: ['John'], 
            dueDate: '2023-06-30',
            status: 'Pending'
          },
          { 
            id: 'a2', 
            description: 'Update documentation' 
          }
        ]
      };
      
      const response = formatter.formatAnalysisQueryResult(result, 'What are the action items?');
      
      expect(response.content).toContain('Action Items');
      expect(response.content).toContain('Follow up with client');
      expect(response.content).toContain('Assigned to: John');
      expect(response.content).toContain('Due: 2023-06-30');
      expect(response.content).toContain('Status: Pending');
      expect(response.content).toContain('Update documentation');
    });
    
    it('should include visualization attachment if provided', () => {
      const result = {
        visualization: {
          type: 'participant_breakdown',
          title: 'Participant Breakdown',
          data: '<svg>visualization data</svg>',
          description: 'Shows participant contributions'
        },
        description: 'Here is the visualization of participant contributions'
      };
      
      const response = formatter.formatAnalysisQueryResult(result, 'Show me participant visualization');
      
      expect(response.type).toBe('analysis');
      expect(response.content).toBe('Here is the visualization of participant contributions');
      expect(response.attachments).toBeDefined();
      expect(response.attachments?.[0].type).toBe('visualization');
      expect(response.attachments?.[0].data).toBe('<svg>visualization data</svg>');
    });
  });
  
  describe('formatVisualization', () => {
    it('should format a participant breakdown visualization', () => {
      const visualization: Visualization = {
        type: 'participant_breakdown',
        title: 'Participant Contributions',
        format: 'svg',
        data: '<svg>visualization data</svg>',
        description: 'Shows the speaking time for each participant'
      };
      
      const response = formatter.formatVisualization(visualization, 'participant_breakdown');
      
      expect(response.type).toBe('visualization');
      expect(response.content).toContain('Here\'s a breakdown of participant contributions');
      expect(response.content).toContain('Shows the speaking time for each participant');
      expect(response.attachments).toBeDefined();
      expect(response.attachments?.[0].type).toBe('visualization');
      expect(response.attachments?.[0].data).toBe('<svg>visualization data</svg>');
      expect(response.attachments?.[0].metadata?.title).toBe('Participant Contributions');
    });
    
    it('should format a topic distribution visualization', () => {
      const visualization: Visualization = {
        type: 'topic_distribution',
        title: 'Topic Distribution',
        format: 'svg',
        data: '<svg>visualization data</svg>'
      };
      
      const response = formatter.formatVisualization(visualization, 'topic_distribution');
      
      expect(response.type).toBe('visualization');
      expect(response.content).toContain('Here\'s the distribution of topics discussed');
      expect(response.attachments).toBeDefined();
      expect(response.attachments?.[0].metadata?.title).toBe('Topic Distribution');
    });
  });
  
  describe('formatClarification', () => {
    it('should format a clarification with all fields', () => {
      const clarification: Clarification = {
        topic: 'Agile Methodology',
        explanation: 'Agile is an iterative approach to project management and software development.',
        relatedConcepts: ['Scrum', 'Kanban', 'Sprint'],
        examples: [
          'Daily standups are a common Agile practice',
          'Sprints typically last 2-4 weeks'
        ]
      };
      
      const response = formatter.formatClarification(clarification, 'agile');
      
      expect(response.type).toBe('text');
      expect(response.content).toContain('Agile Methodology');
      expect(response.content).toContain('Agile is an iterative approach');
      expect(response.content).toContain('Examples');
      expect(response.content).toContain('Daily standups');
      expect(response.content).toContain('Sprints typically');
      expect(response.content).toContain('Related Concepts');
      expect(response.content).toContain('Scrum, Kanban, Sprint');
    });
    
    it('should format a clarification with minimal fields', () => {
      const clarification: Clarification = {
        topic: 'Minimal Topic',
        explanation: 'Just a simple explanation'
      };
      
      const response = formatter.formatClarification(clarification, 'topic');
      
      expect(response.type).toBe('text');
      expect(response.content).toContain('Minimal Topic');
      expect(response.content).toContain('Just a simple explanation');
      expect(response.content).not.toContain('Examples');
      expect(response.content).not.toContain('Related Concepts');
    });
  });
  
  describe('truncateMessage', () => {
    it('should truncate long messages', () => {
      // Create formatter with smaller max length
      const shortFormatter = new ResponseFormatterService({
        maxResponseLength: 50
      });
      
      const longMessage = 'This is a very long message that exceeds the maximum allowed length. It should be truncated in a smart way to preserve as much useful information as possible.';
      
      const result = shortFormatter['truncateMessage'](longMessage);
      
      expect(result.length).toBeLessThanOrEqual(50);
      expect(result).toContain('...');
      expect(result.startsWith('This is a very long message')).toBe(true);
    });
    
    it('should not truncate messages within the limit', () => {
      const shortMessage = 'This is a short message';
      
      const result = formatter['truncateMessage'](shortMessage);
      
      expect(result).toBe(shortMessage);
      expect(result).not.toContain('...');
    });
  });
}); 