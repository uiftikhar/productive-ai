import { Test } from '@nestjs/testing';
import { MeetingAnalysisService } from './meeting-analysis.service';
import { GraphService } from '../graph/graph.service';
import { StateService } from '../state/state.service';
import { WorkflowService } from '../graph/workflow.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { server } from '../../test/mocks/server';
import { http, HttpResponse } from 'msw';

describe('Meeting Analysis Integration', () => {
  let meetingAnalysisService: MeetingAnalysisService;
  
  beforeEach(async () => {
    // Mock OpenAI API calls for agent responses
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
              content: JSON.stringify({
                topics: [{ name: 'Project Timeline', description: 'Discussion about project milestones' }],
                actionItems: [{ description: 'Finalize Q3 report', assignee: 'John' }]
              })
            },
            index: 0,
            finish_reason: 'stop'
          }]
        });
      })
    );
    
    const moduleRef = await Test.createTestingModule({
      providers: [
        MeetingAnalysisService,
        {
          provide: GraphService,
          useValue: {
            analyzeMeeting: jest.fn().mockResolvedValue({
              topics: [{ name: 'Project Timeline' }],
              actionItems: [{ description: 'Finalize Q3 report' }],
              sentiment: { overall: 'positive' },
              summary: { title: 'Project Planning Meeting' }
            })
          }
        },
        {
          provide: StateService,
          useValue: { createMeetingAnalysisState: jest.fn() }
        },
        {
          provide: WorkflowService,
          useValue: {
            analyzeMeeting: jest.fn().mockResolvedValue({
              sessionId: 'session-123',
              result: {
                topics: [{ name: 'Project Timeline' }],
                actionItems: [{ description: 'Finalize Q3 report' }]
              }
            }),
            getSessionInfo: jest.fn().mockReturnValue({
              id: 'session-123',
              status: 'completed',
              startTime: new Date()
            }),
            listSessions: jest.fn().mockReturnValue([
              {
                id: 'session-123',
                status: 'completed',
                startTime: new Date()
              }
            ]),
            loadAnalysisResults: jest.fn().mockResolvedValue({
              sessionId: 'session-123',
              topics: [{ name: 'Project Timeline' }],
              actionItems: [{ description: 'Finalize Q3 report' }],
              sentiment: { overall: 'positive' },
              status: 'completed'
            })
          }
        },
        {
          provide: EventEmitter2,
          useValue: { emit: jest.fn() }
        }
      ]
    }).compile();
    
    meetingAnalysisService = moduleRef.get<MeetingAnalysisService>(MeetingAnalysisService);
  });
  
  it('should process transcript and return analysis results', async () => {
    // Arrange
    const transcript = 'Alice: Let\'s discuss the project timeline for Q3.\nBob: I think we should finalize the report by next week.';
    
    // Act
    const result = await meetingAnalysisService.analyzeTranscript(transcript);
    
    // Assert
    expect(result).toBeDefined();
    expect(result.sessionId).toBeDefined();
    expect(result.status).toBeDefined();
  });

  it('should get analysis results for a session', async () => {
    // Arrange
    const sessionId = 'session-123';
    
    // Act
    const result = await meetingAnalysisService.getAnalysisResults(sessionId);
    
    // Assert
    expect(result).toBeDefined();
    expect(result.sessionId).toBe(sessionId);
  });

  it('should list all analysis sessions', async () => {
    // Act
    const sessions = await meetingAnalysisService.getAllSessions();
    
    // Assert
    expect(sessions).toBeDefined();
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0].id).toBe('session-123');
  });
}); 