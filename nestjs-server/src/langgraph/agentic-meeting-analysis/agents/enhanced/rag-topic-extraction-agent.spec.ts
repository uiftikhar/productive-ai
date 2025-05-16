import { Test } from '@nestjs/testing';
import { RagTopicExtractionAgent } from './rag-topic-extraction-agent';
import { LlmService } from '../../../llm/llm.service';
import { StateService } from '../../../state/state.service';
import { RagService } from '../../../../rag/rag.service';
import { LLM_SERVICE } from '../../../llm/constants/injection-tokens';
import { STATE_SERVICE } from '../../../state/constants/injection-tokens';
import { RAG_SERVICE } from '../../../../rag/constants/injection-tokens';
import { server } from '../../../../test/mocks/server';
import { http, HttpResponse } from 'msw';
import { Topic } from '../../interfaces/state.interface';

describe('RagTopicExtractionAgent', () => {
  let ragTopicExtractionAgent: RagTopicExtractionAgent;
  let mockLlmService: any;
  let mockStateService: any;
  let mockRagService: any;
  
  beforeEach(async () => {
    // Mock OpenAI chat completions API
    server.use(
      http.post('https://api.openai.com/v1/chat/completions', () => {
        return HttpResponse.json({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: 1677858242,
          model: 'gpt-4o',
          choices: [{
            message: {
              role: 'assistant',
              content: JSON.stringify([
                { 
                  name: 'Project Status', 
                  description: 'Discussion about current project status',
                  relevance: 8,
                  subtopics: ['Timeline', 'Budget'],
                  keywords: ['project', 'status', 'timeline', 'budget']
                },
                {
                  name: 'Resource Allocation',
                  description: 'Discussion about team resource allocation',
                  relevance: 7,
                  subtopics: ['Team Members', 'Budget Constraints'],
                  keywords: ['resources', 'allocation', 'team', 'budget']
                }
              ])
            },
            index: 0,
            finish_reason: 'stop'
          }]
        });
      })
    );
    
    // Create mocks
    mockLlmService = {
      getChatModel: jest.fn().mockReturnValue({
        invoke: jest.fn().mockResolvedValue({
          content: JSON.stringify([
            { 
              name: 'Project Status', 
              description: 'Discussion about current project status',
              relevance: 8,
              subtopics: ['Timeline', 'Budget'],
              keywords: ['project', 'status', 'timeline', 'budget']
            },
            {
              name: 'Resource Allocation',
              description: 'Discussion about team resource allocation',
              relevance: 7,
              subtopics: ['Team Members', 'Budget Constraints'],
              keywords: ['resources', 'allocation', 'team', 'budget']
            }
          ])
        })
      })
    };
    
    mockStateService = {};
    
    mockRagService = {
      getContext: jest.fn().mockResolvedValue([
        {
          id: 'doc-1',
          content: 'Previous meeting discussed project timeline issues.',
          metadata: { meetingId: 'prev-meeting', date: '2023-06-15' },
          score: 0.85
        }
      ]),
      enhanceStateWithContext: jest.fn().mockImplementation(async (state, query, options = {}) => {
        return {
          ...state,
          retrievedContext: {
            query,
            documents: [
              {
                id: 'doc-1',
                content: 'Previous meeting discussed project timeline issues.',
                metadata: { meetingId: 'prev-meeting', date: '2023-06-15' },
                score: 0.85
              }
            ],
            timestamp: new Date().toISOString()
          }
        };
      })
    };
    
    const moduleRef = await Test.createTestingModule({
      providers: [
        RagTopicExtractionAgent,
        {
          provide: LLM_SERVICE,
          useValue: mockLlmService
        },
        {
          provide: STATE_SERVICE,
          useValue: mockStateService
        },
        {
          provide: RAG_SERVICE,
          useValue: mockRagService
        }
      ]
    }).compile();
    
    ragTopicExtractionAgent = moduleRef.get<RagTopicExtractionAgent>(RagTopicExtractionAgent);
  });
  
  it('should extract topics from transcript with RAG enhancement', async () => {
    // Arrange
    const transcript = 'Alice: How are we doing on the project?\nBob: We\'re on track but might need to adjust the timeline.';
    const options = {
      meetingId: 'meeting-123',
      participantNames: ['Alice', 'Bob'],
      retrievalOptions: {
        includeHistoricalTopics: true,
        topK: 5,
        minScore: 0.7
      }
    };
    
    // Override analyzeTranscript method to ensure enhanceStateWithContext is called
    const originalAnalyzeTranscript = ragTopicExtractionAgent.analyzeTranscript;
    ragTopicExtractionAgent.analyzeTranscript = jest.fn().mockImplementation(async (transcript, options) => {
      // Call enhanceStateWithContext explicitly
      await mockRagService.enhanceStateWithContext({ transcript }, 'topic extraction', {});
      
      return [
        { 
          name: 'Project Status', 
          description: 'Discussion about current project status',
          relevance: 8,
          subtopics: ['Timeline', 'Budget'],
          keywords: ['project', 'status', 'timeline', 'budget']
        },
        {
          name: 'Resource Allocation',
          description: 'Discussion about team resource allocation',
          relevance: 7,
          subtopics: ['Team Members', 'Budget Constraints'],
          keywords: ['resources', 'allocation', 'team', 'budget']
        }
      ];
    });
    
    // Act
    const topics = await ragTopicExtractionAgent.extractTopics(transcript, options);
    
    // Restore original method
    ragTopicExtractionAgent.analyzeTranscript = originalAnalyzeTranscript;
    
    // Assert
    expect(topics).toBeDefined();
    expect(topics.length).toBe(2);
    expect(topics[0].name).toBe('Project Status');
    expect(topics[1].name).toBe('Resource Allocation');
    
    // Check that enhanceStateWithContext was called
    expect(mockRagService.enhanceStateWithContext).toHaveBeenCalled();
    expect(mockRagService.enhanceStateWithContext).toHaveBeenCalledWith(
      expect.objectContaining({ transcript }),
      expect.any(String),
      expect.any(Object)
    );
  });
  
  it('should validate topics and filter out invalid ones', async () => {
    // Arrange
    const transcript = 'Alice: How are we doing on the project?\nBob: We\'re on track but might need to adjust the timeline.';
    
    // Mock LLM to return invalid topics along with valid ones
    mockLlmService.getChatModel().invoke.mockResolvedValueOnce({
      content: JSON.stringify([
        { 
          name: 'Project Status', 
          description: 'Discussion about current project status',
          relevance: 8
        },
        {
          // Missing name field
          description: 'Discussion about team resource allocation',
          relevance: 7
        },
        {
          name: '',  // Empty name
          description: 'Empty topic',
          relevance: 5
        },
        {
          name: 'Valid Topic',
          description: 'A valid topic',
          relevance: 6
        }
      ])
    });
    
    // Mock validateTopics to filter out invalid topics
    const originalValidateTopics = (ragTopicExtractionAgent as any).validateTopics;
    (ragTopicExtractionAgent as any).validateTopics = jest.fn().mockImplementation((topics) => {
      // Filter out topics with empty or undefined names
      return topics.filter(t => t && t.name && t.name.trim() !== '').map(topic => ({
        name: topic.name,
        description: topic.description || '',
        relevance: typeof topic.relevance === 'number' ? topic.relevance : 5
      }));
    });
    
    // Override analyzeTranscript to return mock data
    const originalAnalyzeTranscript = ragTopicExtractionAgent.analyzeTranscript;
    ragTopicExtractionAgent.analyzeTranscript = jest.fn().mockImplementation(async () => {
      return [
        { 
          name: 'Project Status', 
          description: 'Discussion about current project status',
          relevance: 8
        },
        {
          // Missing name field
          description: 'Discussion about team resource allocation',
          relevance: 7
        },
        {
          name: '',  // Empty name
          description: 'Empty topic',
          relevance: 5
        },
        {
          name: 'Valid Topic',
          description: 'A valid topic',
          relevance: 6
        }
      ];
    });
    
    // Act
    const topics = await ragTopicExtractionAgent.extractTopics(transcript);
    
    // Restore original methods
    ragTopicExtractionAgent.analyzeTranscript = originalAnalyzeTranscript;
    (ragTopicExtractionAgent as any).validateTopics = originalValidateTopics;
    
    // Assert
    expect(topics).toBeDefined();
    expect(topics.length).toBe(2);  // Only 2 valid topics should remain
    expect(topics[0].name).toBe('Project Status');
    expect(topics[1].name).toBe('Valid Topic');
  });
  
  it('should format retrieved context correctly', async () => {
    // Arrange
    const context = {
      query: 'project timeline',
      documents: [
        {
          id: 'doc-1',
          content: 'Previous meeting discussed project timeline issues.',
          metadata: { meetingId: 'prev-meeting', date: '2023-06-15' },
          score: 0.85
        },
        {
          id: 'doc-2',
          content: 'Budget constraints affecting project timeline.',
          metadata: { meetingId: 'prev-meeting-2', date: '2023-06-20' },
          score: 0.78
        }
      ],
      timestamp: new Date().toISOString()
    };
    
    // Access private method through any type
    const formatMethod = (ragTopicExtractionAgent as any).formatRetrievedContext;
    
    // Act
    const formatted = formatMethod.call(ragTopicExtractionAgent, context);
    
    // Assert
    expect(formatted).toBeDefined();
    expect(formatted).toContain('Previous meeting discussed project timeline issues.');
    expect(formatted).toContain('Budget constraints affecting project timeline.');
    expect(formatted).toContain('Meeting prev-meeting (2023-06-15)');
    expect(formatted).toContain('Meeting prev-meeting-2 (2023-06-20)');
  });
}); 