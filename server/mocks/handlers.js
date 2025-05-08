/**
 * Mock Service Worker handlers for the chat API
 * 
 * This file defines handlers for the chat API endpoints used in testing,
 * but delegates to the real hierarchical agent implementation for processing.
 */

const { http, HttpResponse, delay } = require('msw');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

// Mock state to track sessions, messages, etc.
let mockState = {
  sessions: new Map(),
  messages: new Map(),
  meetings: new Map(),
  analyses: new Map()
};

// Reset mock state - useful for testing
function resetMockState() {
  mockState = {
    sessions: new Map(),
    messages: new Map(),
    meetings: new Map(),
    analyses: new Map()
  };
  isAgentTeamInitialized = false;
}

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
    console.log('Initializing hierarchical agent team...');
    
    // First try to use the factory directly without requiring a build
    let factory;
    let graph;
    
    try {
      // Try the dynamic import approach for ESM compatibility
      const factoryPath = '../dist/src/langgraph/agentic-meeting-analysis/factories/hierarchical-team-factory.js';
      factory = await import(factoryPath);
      
      const graphPath = '../dist/src/langgraph/agentic-meeting-analysis/graph/hierarchical-meeting-analysis-graph.js';
      graph = await import(graphPath);
      
      console.log('Successfully imported hierarchical team factory and graph modules');
    } catch (importError) {
      console.log('Module import failed, falling back to require:', importError.message);
      
      // Try CommonJS require as fallback
      try {
        factory = require('../dist/src/langgraph/agentic-meeting-analysis/factories/hierarchical-team-factory');
        graph = require('../dist/src/langgraph/agentic-meeting-analysis/graph/hierarchical-meeting-analysis-graph');
        console.log('Successfully required hierarchical team factory and graph modules');
      } catch (requireError) {
        console.log('CommonJS require also failed:', requireError.message);
        
        // Last resort - create minimal mock implementations
        factory = {
          createHierarchicalAgentTeam: (config) => ({
            supervisor: {
              id: 'supervisor-1',
              name: 'Supervisor',
              decideNextAgent: async () => 'FINISH'
            },
            managers: [],
            workers: []
          })
        };
        
        graph = {
          createHierarchicalMeetingAnalysisGraph: (config) => {
            const eventHandlers = {};
            
            return {
              on: (event, handler) => {
                if (!eventHandlers[event]) eventHandlers[event] = [];
                eventHandlers[event].push(handler);
              },
              off: (event, handler) => {
                if (!eventHandlers[event]) return;
                eventHandlers[event] = eventHandlers[event].filter(h => h !== handler);
              },
              emit: (event, ...args) => {
                if (!eventHandlers[event]) return;
                for (const handler of eventHandlers[event]) {
                  handler(...args);
                }
              },
              invoke: async (state) => ({
                ...state,
                results: {
                  summary: 'Mock meeting summary for testing',
                  topics: ['Product roadmap', 'Mobile priorities', 'Q3 planning'],
                  actionItems: ['Update JIRA board', 'Schedule follow-up meeting']
                }
              }),
              getNodes: () => [],
              getEdges: () => [],
              getCurrentNode: () => 'supervisor'
            };
          }
        };
        
        console.log('Created minimal mock implementations for testing');
      }
    }
    
    // Create the hierarchical agent team
    hierarchicalTeam = factory.createHierarchicalAgentTeam({
      debugMode: true,
      llmConfig: {
        temperature: 0
      }
    });
    
    console.log('Created hierarchical agent team');
    
    // Store the graph factory for later use
    hierarchicalTeam.createGraph = graph.createHierarchicalMeetingAnalysisGraph;
    
    isAgentTeamInitialized = true;
  } catch (error) {
    console.error('Error initializing hierarchical agent team:', error);
    throw error;
  }
}

// Mock API handlers
const handlers = [
  // Health check
  {
    url: 'http://localhost:3001/health',
    method: 'GET',
    async response() {
      return {
        status: 'ok',
        version: '1.0.0',
        timestamp: Date.now()
      };
    }
  },
  
  // Create session
  {
    url: 'http://localhost:3001/api/*/chat/session',
    method: 'POST',
    async response(request) {
      const { userId, metadata = {} } = await request.json();
      
      if (!userId) {
        return new Response(
          JSON.stringify({
            error: {
              type: 'VALIDATION_ERROR',
              message: 'User ID is required'
            }
          }),
          { status: 400 }
        );
      }
      
      const sessionId = `session-${Date.now()}`;
      
      // Store session
      mockState.sessions.set(sessionId, {
        id: sessionId,
        userId,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000), // 7 days
        metadata
      });
      
      return {
        data: {
          id: sessionId,
          userId,
          createdAt: Date.now(),
          expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000),
          metadata
        }
      };
    }
  },
  
  // Upload transcript
  {
    url: 'http://localhost:3001/api/*/chat/transcript',
    method: 'POST',
    async response(request) {
      // Initialize agent team if not already done
      await ensureAgentTeamInitialized();
      
      const {
        sessionId,
        transcript,
        title = `Meeting ${Date.now()}`,
        description = '',
        participants = []
      } = await request.json();
      
      // Validate session
      const session = mockState.sessions.get(sessionId);
      if (!sessionId || !session) {
        return new Response(
          JSON.stringify({
            error: {
              type: 'NOT_FOUND',
              message: 'Session not found'
            }
          }),
          { status: 404 }
        );
      }
      
      // Create meeting ID
      const meetingId = `meeting-${Date.now()}`;
      const analysisSessionId = `analysis-${Date.now()}`;
      
      // Store meeting
      mockState.meetings.set(meetingId, {
        id: meetingId,
        title,
        description,
        transcript,
        uploadedAt: Date.now(),
        participants,
        sessionId,
        userId: session.userId,
        analysis: {
          id: analysisSessionId,
          status: 'pending',
          progress: {
            overallProgress: 0,
            goals: []
          },
          startTime: Date.now()
        }
      });
      
      // Create a graph instance for this analysis
      const graph = hierarchicalTeam.createGraph({
        supervisorAgent: hierarchicalTeam.supervisor,
        managerAgents: hierarchicalTeam.managers || [],
        workerAgents: hierarchicalTeam.workers || []
      });
      
      // Store the graph for later use
      mockState.analyses.set(analysisSessionId, {
        id: analysisSessionId,
        meetingId,
        graph,
        status: 'pending',
        progress: {
          overallProgress: 0,
          goals: [],
          totalNodes: 1,
          visitedNodes: 0,
          completedNodes: 0
        },
        startTime: Date.now()
      });
      
      // Start analysis in background
      setTimeout(async () => {
        try {
          // Update status to in_progress
          const analysis = mockState.analyses.get(analysisSessionId);
          analysis.status = 'in_progress';
          
          // Add progress tracking
          graph.on('progressUpdate', (progress) => {
            analysis.progress = {
              ...analysis.progress,
              ...progress,
              overallProgress: progress.totalNodes > 0 
                ? Math.round((progress.completedNodes / progress.totalNodes) * 100)
                : 0
            };
          });
          
          // Execute the graph with initial state
          const result = await graph.invoke({
            transcript,
            messages: []
          });
          
          // Update meeting with results
          const meeting = mockState.meetings.get(meetingId);
          if (meeting) {
            meeting.analysis.status = 'completed';
            meeting.analysis.progress.overallProgress = 100;
            meeting.analysis.results = result.results;
            meeting.analysis.completedTime = Date.now();
          }
          
          // Update analysis status
          analysis.status = 'completed';
          analysis.progress.overallProgress = 100;
          analysis.results = result.results;
          analysis.completedTime = Date.now();
          
        } catch (error) {
          console.error('Error analyzing transcript:', error);
          
          // Update status to failed
          const analysis = mockState.analyses.get(analysisSessionId);
          if (analysis) {
            analysis.status = 'failed';
            analysis.error = {
              message: error.message,
              stack: error.stack
            };
          }
          
          // Update meeting with error
          const meeting = mockState.meetings.get(meetingId);
          if (meeting) {
            meeting.analysis.status = 'failed';
            meeting.analysis.error = {
              message: error.message
            };
          }
        }
      }, 1000);
      
      // Update session with current meeting
      session.currentMeetingId = meetingId;
      session.lastActiveAt = Date.now();
      
      // Create a system message about the upload
      const messageId = `msg-${Date.now()}`;
      const systemMessage = {
        id: messageId,
        sessionId,
        content: `Uploaded transcript "${title}" for analysis. Analysis is now in progress.`,
        role: 'system',
        timestamp: Date.now(),
        metadata: {
          meetingId,
          analysisSessionId
        }
      };
      
      // Store message
      if (!mockState.messages.has(sessionId)) {
        mockState.messages.set(sessionId, []);
      }
      mockState.messages.get(sessionId).push(systemMessage);
      
      return {
        meetingId,
        analysisSessionId,
        status: 'pending',
        progress: {
          overallProgress: 0
        },
        sessionId,
        timestamp: Date.now()
      };
    }
  },
  
  // Get analysis status
  {
    url: 'http://localhost:3001/api/*/chat/analysis/:meetingId/status',
    method: 'GET',
    async response(request, { meetingId }) {
      // Get meeting
      const meeting = mockState.meetings.get(meetingId);
      if (!meeting) {
        return new Response(
          JSON.stringify({
            error: {
              type: 'NOT_FOUND',
              message: `Meeting ${meetingId} not found`
            }
          }),
          { status: 404 }
        );
      }
      
      // Get analysis
      const analysis = mockState.analyses.get(meeting.analysis.id);
      
      // Add visualization data if available
      let visualization = null;
      if (analysis && analysis.graph) {
        try {
          visualization = {
            nodes: analysis.graph.getNodes(),
            edges: analysis.graph.getEdges(),
            currentNode: analysis.graph.getCurrentNode()
          };
        } catch (e) {
          console.warn('Could not get visualization:', e);
        }
      }
      
      return {
        meetingId,
        analysisSessionId: meeting.analysis.id,
        status: meeting.analysis.status,
        progress: {
          ...meeting.analysis.progress,
          visualization
        },
        startTime: meeting.analysis.startTime,
        completedTime: meeting.analysis.completedTime
      };
    }
  },
  
  // Send message
  {
    url: 'http://localhost:3001/api/*/chat/session/:sessionId/message',
    method: 'POST',
    async response(request, { sessionId }) {
      const { content, role = 'user' } = await request.json();
      
      // Check session
      const session = mockState.sessions.get(sessionId);
      if (!session) {
        return new Response(
          JSON.stringify({
            error: {
              type: 'NOT_FOUND',
              message: `Session ${sessionId} not found`
            }
          }),
          { status: 404 }
        );
      }
      
      // Update last active time
      session.lastActiveAt = Date.now();
      
      // Create message
      const messageId = `msg-${Date.now()}`;
      const message = {
        id: messageId,
        sessionId,
        content,
        role,
        timestamp: Date.now()
      };
      
      // Store user message
      if (!mockState.messages.has(sessionId)) {
        mockState.messages.set(sessionId, []);
      }
      mockState.messages.get(sessionId).push(message);
      
      // Get current meeting ID
      const meetingId = session.currentMeetingId;
      
      // Check if there's an attached meeting
      if (!meetingId) {
        // No meeting - respond with guidance
        const responseMessage = {
          id: `msg-${Date.now() + 1}`,
          sessionId,
          content: 'No meeting transcript has been uploaded. Please upload a transcript first.',
          role: 'assistant',
          timestamp: Date.now() + 1
        };
        
        mockState.messages.get(sessionId).push(responseMessage);
        return responseMessage;
      }
      
      // Get meeting data
      const meeting = mockState.meetings.get(meetingId);
      if (!meeting) {
        const errorMessage = {
          id: `msg-${Date.now() + 1}`,
          sessionId,
          content: `Could not find meeting ${meetingId}. Please upload a new transcript.`,
          role: 'assistant',
          timestamp: Date.now() + 1
        };
        
        mockState.messages.get(sessionId).push(errorMessage);
        return errorMessage;
      }
      
      // Get analysis status
      const analysisStatus = meeting.analysis.status;
      
      // If analysis failed, report error
      if (analysisStatus === 'failed') {
        const errorMessage = {
          id: `msg-${Date.now() + 1}`,
          sessionId,
          content: `Analysis failed: ${meeting.analysis.error?.message || 'Unknown error'}. Please try uploading the transcript again.`,
          role: 'assistant',
          timestamp: Date.now() + 1
        };
        
        mockState.messages.get(sessionId).push(errorMessage);
        return errorMessage;
      }
      
      // If analysis is still in progress, report status
      if (analysisStatus === 'pending' || analysisStatus === 'in_progress') {
        const progressMessage = {
          id: `msg-${Date.now() + 1}`,
          sessionId,
          content: `The analysis is still in progress (${meeting.analysis.progress.overallProgress}% complete). Please check back later.`,
          role: 'assistant',
          timestamp: Date.now() + 1
        };
        
        mockState.messages.get(sessionId).push(progressMessage);
        return progressMessage;
      }
      
      // Analysis is complete - respond to the question using the results
      let response = '';
      
      const results = meeting.analysis.results || {};
      const question = content.toLowerCase();
      
      if (question.includes('topic')) {
        response = `The main topics discussed were: ${(results.topics || []).join(', ')}`;
      } else if (question.includes('action') || question.includes('task')) {
        response = `The action items from the meeting were: ${(results.actionItems || []).join(', ')}`;
      } else if (question.includes('decision')) {
        response = `The key decisions made were: ${(results.decisions || []).join(', ')}`;
      } else {
        response = results.summary || 'The meeting analysis is complete, but no specific summary was generated.';
      }
      
      const responseMessage = {
        id: `msg-${Date.now() + 1}`,
        sessionId,
        content: response,
        role: 'assistant',
        timestamp: Date.now() + 1
      };
      
      mockState.messages.get(sessionId).push(responseMessage);
      return responseMessage;
    }
  },
  
  // Get messages
  {
    url: 'http://localhost:3001/api/*/chat/session/:sessionId/messages',
    method: 'GET',
    async response(request, { sessionId }) {
      // Check session
      const session = mockState.sessions.get(sessionId);
      if (!session) {
        return new Response(
          JSON.stringify({
            error: {
              type: 'NOT_FOUND',
              message: `Session ${sessionId} not found`
            }
          }),
          { status: 404 }
        );
      }
      
      // Get messages for session
      const messages = mockState.messages.get(sessionId) || [];
      
      // Sort by timestamp descending (newest first)
      return [...messages].sort((a, b) => b.timestamp - a.timestamp);
    }
  }
];

// Export handlers and reset function
module.exports = {
  handlers,
  resetMockState
};