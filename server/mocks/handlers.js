/**
 * Mock Service Worker handlers for the chat API
 * 
 * This file defines handlers for the chat API endpoints used in testing,
 * but delegates to the real hierarchical agent implementation for processing.
 */

const { http, HttpResponse, delay } = require('msw');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Store mock data for test sessions and meetings
const mockSessions = new Map();
const mockMeetings = new Map();
const mockMessages = new Map();

// API version
const API_VERSION = 'v1';

// Helper to create IDs
const createSessionId = () => `session-${uuidv4().substring(0, 8)}`;
const createMeetingId = () => `meeting-${uuidv4().substring(0, 24)}`;
const createAnalysisSessionId = () => `analysis-${uuidv4().substring(0, 12)}`;
const createMessageId = () => `msg-${uuidv4().substring(0, 12)}`;

// Initialize the hierarchical agent team
let hierarchicalTeam;
let isAgentTeamInitialized = false;

// Helper to initialize the agent team if not already done
async function ensureAgentTeamInitialized() {
  if (isAgentTeamInitialized) return;
  
  try {
    // This is a mock testing environment, so we need to require dynamically
    // In a real TS environment, this would be imported properly
    console.log('Initializing hierarchical agent team...');
    
    // We're running in a JS context, so we need to access the compiled JS version
    // of the factory from dist (assuming it's been built)
    // If this fails, it means the project needs to be built first
    const factory = require('../dist/src/langgraph/agentic-meeting-analysis/factories/hierarchical-team-factory');
    
    hierarchicalTeam = factory.createHierarchicalAgentTeam({
      debugMode: true,
      llmConfig: {
        model: 'gpt-3.5-turbo', // Use a faster model for testing
        temperature: 0.1
      }
    });
    
    console.log('Hierarchical agent team initialized with:');
    console.log(`- 1 Supervisor: ${hierarchicalTeam.supervisor.id}`);
    console.log(`- ${hierarchicalTeam.managers.length} Managers`);
    console.log(`- ${hierarchicalTeam.workers.length} Workers`);
    
    isAgentTeamInitialized = true;
  } catch (error) {
    console.error('Failed to initialize hierarchical agent team:', error);
    console.error('Using simulated agent behavior instead.');
    
    // Create a mock team structure as fallback
    hierarchicalTeam = {
      supervisor: { 
        id: 'mock-supervisor',
        name: 'Mock Supervisor',
        analyzeTranscript: async (transcript, options) => {
          return {
            status: 'completed',
            progress: 100,
            summary: 'Mock analysis summary',
            topics: ['roadmap', 'reporting feature', 'api update'],
            actionItems: [
              { description: 'Update JIRA board', assignee: 'Mark' },
              { description: 'Schedule API update meeting', assignee: 'John' }
            ]
          };
        }
      }
    };
  }
}

// Reset state for testing
exports.resetMockState = () => {
  mockSessions.clear();
  mockMeetings.clear();
  mockMessages.clear();
  isAgentTeamInitialized = false;
  hierarchicalTeam = null;
};

// Analysis state for each meeting
const analysisState = new Map();

// Process a transcript through the hierarchical agent system
async function processTranscript(meetingId, transcript, title, participants) {
  await ensureAgentTeamInitialized();
  
  // Create analysis state
  const analysisState = {
    meetingId,
    status: 'pending',
    progress: 0,
    startTime: Date.now(),
    results: null
  };
  
  // Store state
  mockMeetings.get(meetingId).status = 'pending';
  mockMeetings.get(meetingId).progress.overallProgress = 0;
  
  // Start analysis in the background
  (async () => {
    try {
      // Update to in_progress
      analysisState.status = 'in_progress';
      analysisState.progress = 25;
      mockMeetings.get(meetingId).status = 'in_progress';
      mockMeetings.get(meetingId).progress.overallProgress = 25;
      
      // Run the actual analysis with the supervisor agent
      const results = await hierarchicalTeam.supervisor.analyzeTranscript(transcript, {
        title,
        participants: participants.map(p => ({ 
          id: p.id, 
          name: p.name,
          role: p.role
        })),
        onProgress: (progress) => {
          analysisState.progress = progress;
          if (mockMeetings.has(meetingId)) {
            mockMeetings.get(meetingId).progress.overallProgress = progress;
          }
        }
      });
      
      // Store results
      analysisState.results = results;
      analysisState.status = 'completed';
      analysisState.progress = 100;
      
      // Update meeting status
      if (mockMeetings.has(meetingId)) {
        mockMeetings.get(meetingId).status = 'completed';
        mockMeetings.get(meetingId).progress.overallProgress = 100;
        mockMeetings.get(meetingId).results = results;
      }
      
      console.log(`Analysis completed for meeting ${meetingId}`);
    } catch (error) {
      console.error(`Analysis failed for meeting ${meetingId}:`, error);
      analysisState.status = 'failed';
      analysisState.error = error.message;
      
      // Update meeting status
      if (mockMeetings.has(meetingId)) {
        mockMeetings.get(meetingId).status = 'failed';
        mockMeetings.get(meetingId).error = error.message;
      }
    }
  })();
  
  return analysisState;
}

// Answer a question about a meeting using the hierarchical agent
async function answerQuestion(meetingId, question) {
  await ensureAgentTeamInitialized();
  
  try {
    const meeting = mockMeetings.get(meetingId);
    
    if (!meeting) {
      return "I don't have information about this meeting.";
    }
    
    if (meeting.status !== 'completed') {
      return `The meeting analysis is ${meeting.status}. Please wait for it to complete.`;
    }
    
    // Use the supervisor agent to answer the question
    const answer = await hierarchicalTeam.supervisor.answerQuestion(question, {
      context: meeting.results,
      transcript: meeting.transcript
    });
    
    return answer;
  } catch (error) {
    console.error(`Failed to answer question for meeting ${meetingId}:`, error);
    return "I'm having trouble answering that question right now. Please try again later.";
  }
}

// Mock handlers for the chat API
exports.handlers = [
  // Create Session
  http.post(`/api/${API_VERSION}/chat/session`, async ({ request }) => {
    await delay(100);
    
    const data = await request.json();
    const { userId, metadata } = data;
    
    if (!userId) {
      return HttpResponse.json(
        { 
          error: {
            type: 'BAD_REQUEST',
            message: 'userId is required',
            timestamp: Date.now()
          } 
        },
        { status: 400 }
      );
    }
    
    const sessionId = createSessionId();
    const now = Date.now();
    const session = {
      id: sessionId,
      userId,
      createdAt: now,
      expiresAt: now + 86400000, // 24 hours from now
      metadata
    };
    
    mockSessions.set(sessionId, session);
    
    return HttpResponse.json({
      data: session,
      timestamp: now
    });
  }),
  
  // Upload Transcript
  http.post(`/api/${API_VERSION}/chat/transcript`, async ({ request }) => {
    await delay(200);
    
    const data = await request.json();
    const { sessionId, userId, transcript, title, description, participants } = data;
    
    if (!sessionId && !userId) {
      return HttpResponse.json(
        { 
          error: {
            type: 'BAD_REQUEST',
            message: 'Either sessionId or userId is required',
            timestamp: Date.now()
          } 
        },
        { status: 400 }
      );
    }
    
    // Handle session
    let actualSessionId = sessionId;
    if (!sessionId && userId) {
      actualSessionId = createSessionId();
      const session = {
        id: actualSessionId,
        userId,
        createdAt: Date.now(),
        expiresAt: Date.now() + 86400000
      };
      mockSessions.set(actualSessionId, session);
    } else if (!mockSessions.has(sessionId)) {
      return HttpResponse.json(
        { 
          error: {
            type: 'NOT_FOUND',
            message: `Session ${sessionId} not found`,
            timestamp: Date.now()
          } 
        },
        { status: 404 }
      );
    }
    
    // Create meeting record
    const meetingId = createMeetingId();
    const analysisSessionId = createAnalysisSessionId();
    const now = Date.now();
    
    const meeting = {
      id: meetingId,
      analysisSessionId,
      sessionId: actualSessionId,
      transcript,
      title,
      description,
      participants,
      status: 'pending',
      progress: {
        overallProgress: 0,
        goals: []
      },
      createdAt: now
    };
    
    mockMeetings.set(meetingId, meeting);
    
    // Create and store system message
    const messageId = createMessageId();
    const systemMessage = {
      id: messageId,
      sessionId: actualSessionId,
      content: `Uploaded transcript "${title}" for analysis. Analysis is now in progress.`,
      role: 'system',
      timestamp: now,
      attachments: [],
      metadata: {
        meetingId,
        analysisSessionId
      }
    };
    
    if (!mockMessages.has(actualSessionId)) {
      mockMessages.set(actualSessionId, []);
    }
    mockMessages.get(actualSessionId).push(systemMessage);
    
    // Start processing with real hierarchical agent
    processTranscript(meetingId, transcript, title, participants)
      .then(() => {
        // Add completion message when analysis is done
        const completionMessageId = createMessageId();
        const completionMessage = {
          id: completionMessageId,
          sessionId: actualSessionId,
          content: `Analysis of "${title}" is complete. You can now ask questions about the meeting.`,
          role: 'system',
          timestamp: Date.now(),
          attachments: [],
          metadata: {
            meetingId,
            analysisSessionId,
            type: 'analysis_complete'
          }
        };
        
        if (!mockMessages.has(actualSessionId)) {
          mockMessages.set(actualSessionId, []);
        }
        mockMessages.get(actualSessionId).push(completionMessage);
      });
    
    return HttpResponse.json({
      meetingId,
      analysisSessionId,
      status: 'pending',
      progress: {
        overallProgress: 0,
        goals: []
      },
      sessionId: actualSessionId,
      timestamp: now
    });
  }),
  
  // Get Analysis Status
  http.get(`/api/${API_VERSION}/chat/analysis/:meetingId/status`, ({ params }) => {
    const { meetingId } = params;
    const meeting = mockMeetings.get(meetingId);
    
    if (!meeting) {
      return HttpResponse.json(
        { 
          error: {
            type: 'NOT_FOUND',
            message: `Meeting ${meetingId} not found`,
            timestamp: Date.now()
          } 
        },
        { status: 404 }
      );
    }
    
    return HttpResponse.json({
      meetingId,
      analysisSessionId: meeting.analysisSessionId,
      status: meeting.status,
      progress: meeting.progress
    });
  }),
  
  // Send Message
  http.post(`/api/${API_VERSION}/chat/session/:sessionId/message`, async ({ params, request }) => {
    await delay(300);
    
    const { sessionId } = params;
    const session = mockSessions.get(sessionId);
    
    if (!session) {
      return HttpResponse.json(
        { 
          error: {
            type: 'NOT_FOUND',
            message: `Session ${sessionId} not found`,
            timestamp: Date.now()
          } 
        },
        { status: 404 }
      );
    }
    
    const data = await request.json();
    const { content } = data;
    const now = Date.now();
    
    // Store user message
    const userMsgId = createMessageId();
    const userMessage = {
      id: userMsgId,
      sessionId,
      content,
      role: 'user',
      timestamp: now,
      attachments: [],
      metadata: {}
    };
    
    if (!mockMessages.has(sessionId)) {
      mockMessages.set(sessionId, []);
    }
    mockMessages.get(sessionId).push(userMessage);
    
    // Find active meeting for this session
    const activeMeeting = Array.from(mockMeetings.values())
      .find(m => m.sessionId === sessionId);
    
    // Generate AI response
    let aiResponse;
    
    if (activeMeeting) {
      if (activeMeeting.status === 'completed') {
        // Use real agent to answer the question
        aiResponse = await answerQuestion(activeMeeting.id, content);
      } else if (activeMeeting.status === 'in_progress') {
        aiResponse = `The meeting analysis is still in progress (${activeMeeting.progress.overallProgress}% complete). I'll be able to answer questions about it once the analysis is complete.`;
      } else if (activeMeeting.status === 'failed') {
        aiResponse = "I'm sorry, there was an error analyzing the meeting transcript. Please try uploading it again.";
      } else {
        aiResponse = "The meeting analysis is pending. Please check back in a moment.";
      }
    } else {
      aiResponse = "No meeting transcript has been uploaded. Please upload a transcript first.";
    }
    
    // Store AI message
    const aiMsgId = createMessageId();
    const aiMessage = {
      id: aiMsgId,
      sessionId,
      content: aiResponse,
      role: 'assistant',
      timestamp: now + 2,
      attachments: [],
      metadata: {}
    };
    
    mockMessages.get(sessionId).push(aiMessage);
    
    return HttpResponse.json(aiMessage);
  }),
  
  // Get Messages
  http.get(`/api/${API_VERSION}/chat/session/:sessionId/messages`, ({ params }) => {
    const { sessionId } = params;
    const session = mockSessions.get(sessionId);
    
    if (!session) {
      return HttpResponse.json(
        { 
          error: {
            type: 'NOT_FOUND',
            message: `Session ${sessionId} not found`,
            timestamp: Date.now()
          } 
        },
        { status: 404 }
      );
    }
    
    const messages = mockMessages.get(sessionId) || [];
    
    // Sort messages by timestamp (newest first according to the API docs)
    const sortedMessages = [...messages].sort((a, b) => b.timestamp - a.timestamp);
    
    return HttpResponse.json(sortedMessages);
  })
]; 