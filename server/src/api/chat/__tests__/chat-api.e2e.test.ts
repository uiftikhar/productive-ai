/**
 * End-to-end test for Chat API with hierarchical agent integration
 */
import request from 'supertest';
import { Express } from 'express';
import { createServer } from '../../../server';
import { ServiceRegistry } from '../../../langgraph/agentic-meeting-analysis/services/service-registry';
import { setupMockServices } from '../../../test/helpers/mock-service-setup';

describe('Chat API Integration Tests', () => {
  let app: Express;
  let serviceRegistry: ServiceRegistry;
  let mockSessionId: string;
  let mockMeetingId: string;

  beforeAll(async () => {
    // Setup mock services for testing
    serviceRegistry = setupMockServices();
    
    // Create Express app
    app = await createServer({
      serviceRegistry,
      enableCors: true,
      enableLogging: false
    });
  });

  beforeEach(() => {
    // Reset mocks between tests if needed
    jest.clearAllMocks();
  });

  it('Should create a session', async () => {
    const res = await request(app)
      .post('/api/v1/chat/session')
      .send({
        userId: 'test-user-123',
        metadata: { name: 'Test User' }
      });
    
    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    
    mockSessionId = res.body.data.id;
  });

  it('Should upload a transcript', async () => {
    const transcript = `John: We need to finalize the product roadmap for Q3.
Sarah: I agree. We should prioritize the new reporting feature.
John: Customers have been asking for that for months.
Mark: What about the mobile app redesign?
Sarah: That should be secondary. Let's focus on functionality first.
John: Good point. We'll put reporting as our top priority for Q3.
Mark: I'll update the JIRA board with these priorities.
Sarah: Can we also discuss the timeline for the API update?
John: Let's schedule a separate meeting for that next week.
Mark: Sounds good. I'll send out a calendar invite.`;

    const res = await request(app)
      .post('/api/v1/chat/transcript')
      .send({
        sessionId: mockSessionId,
        transcript,
        title: 'Product Planning Meeting',
        participants: [
          { id: 'john', name: 'John Smith', role: 'Product Manager' },
          { id: 'sarah', name: 'Sarah Johnson', role: 'UX Designer' },
          { id: 'mark', name: 'Mark Chen', role: 'Lead Developer' }
        ]
      });
    
    expect(res.status).toBe(202);
    expect(res.body).toHaveProperty('meetingId');
    expect(res.body).toHaveProperty('analysisSessionId');
    expect(res.body.status).toBe('pending');
    
    mockMeetingId = res.body.meetingId;
  });

  it('Should retrieve analysis status', async () => {
    // Wait a moment to ensure analysis has started
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const res = await request(app)
      .get(`/api/v1/chat/analysis/${mockMeetingId}/status`);
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(['pending', 'in_progress', 'completed', 'failed']).toContain(res.body.status);
    expect(res.body).toHaveProperty('progress');
    expect(res.body.progress).toHaveProperty('overallProgress');
  });

  it('Should send a message and receive a response', async () => {
    const res = await request(app)
      .post(`/api/v1/chat/session/${mockSessionId}/message`)
      .send({
        content: 'What were the main topics discussed in this meeting?'
      });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('content');
    expect(res.body.role).toBe('assistant');
  });

  it('Should retrieve conversation history', async () => {
    const res = await request(app)
      .get(`/api/v1/chat/session/${mockSessionId}/messages`);
    
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
}); 