import { Request, Response } from 'express';
import express from 'express';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { MeetingAnalysisAgent } from '../agents/specialized/meeting-analysis-agent';
import 'reflect-metadata';
import { StandardizedMeetingAnalysisAdapter } from '../langgraph/core/adapters/standardized-meeting-analysis.adapter';

import { EmbeddingService } from '../shared/embedding/embedding.service';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { specializedAgentOrchestrator } from '../agents/specialized/orchestration/specialized-agent-orchestrator';
import { configureTracing } from '../langgraph/core/utils/tracing';
import { OpenAIAdapter } from '../agents/adapters';
import { BaseContextService } from '../shared/user-context/services/base-context.service';

// Type imports to help with type casting
import { AgentRequest } from '../agents/interfaces/unified-agent.interface';

// Initialize services
const logger = new ConsoleLogger();
const openaiAdapter = new OpenAIAdapter({
  logger
});
const embeddingService = new EmbeddingService(openaiAdapter, logger);
const baseContextService = new BaseContextService({ logger });

// Initialize the base context service
// TODO move to main or app.ts
(async () => {
  try {
    await baseContextService.initialize();
    logger.info('Base context service initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize base context service', { error });
  }
})();

// Initialize agent orchestrator
specializedAgentOrchestrator.setLogger(logger);

// Initialize specialized agents - using the standard adapter for backward compatibility
const standardMeetingAnalysisAgent = new MeetingAnalysisAgent(
  'Meeting Analysis Agent',
  'Analyzes meeting transcripts to extract key information, action items, and insights',
  {
    id: 'meeting-analysis-agent',
    logger,
    openAIAdapter: openaiAdapter,
    embeddingService: embeddingService,
    baseContextService: baseContextService
  }
);

// Initialize RAG-enhanced agent for the standardized adapter
const ragEnhancedMeetingAnalysisAgent = new MeetingAnalysisAgent(
  'RAG Meeting Analysis Agent',
  'Analyzes meeting transcripts with RAG capabilities',
  {
    id: 'rag-meeting-analysis-agent',
    logger,
    openAIAdapter: openaiAdapter,
    embeddingService: embeddingService,
    baseContextService: baseContextService
  }
);

// Configure LangGraph tracing
configureTracing({
  enabled: true,
  consoleLogging: true,
  langSmith: {
    enabled: process.env.LANGSMITH_API_KEY ? true : false,
    projectName: 'meeting-analysis',
  },
});

// Create Standardized LangGraph adapter for meeting analysis with RAG capabilities
// Cast only the needed properties to satisfy TypeScript
const standardizedAdapter = new StandardizedMeetingAnalysisAdapter({
  //  TODO Fix this hack
  // Type compatibility issue: we're using the MeetingAnalysisAgent class instead of BaseAgent
  // but we know it has the required functionality
  id: ragEnhancedMeetingAnalysisAgent.id,
  name: ragEnhancedMeetingAnalysisAgent.name,
  description: ragEnhancedMeetingAnalysisAgent.description,
  getCapabilities: () => ragEnhancedMeetingAnalysisAgent.getCapabilities(),
  execute: (request: AgentRequest) => ragEnhancedMeetingAnalysisAgent.execute(request),
  initialize: () => ragEnhancedMeetingAnalysisAgent.initialize(),
  getState: () => ragEnhancedMeetingAnalysisAgent.getState(),
  canHandle: (capability: string) => ragEnhancedMeetingAnalysisAgent.canHandle(capability),
  getInitializationStatus: () => ragEnhancedMeetingAnalysisAgent.getInitializationStatus(),
  terminate: () => ragEnhancedMeetingAnalysisAgent.terminate(),
  getMetrics: () => ragEnhancedMeetingAnalysisAgent.getMetrics(),
} as any, {
  tracingEnabled: true,
  logger,
  maxChunkSize: 2000,
  chunkOverlap: 200
});

// Check if LangSmith is configured
const isLangSmithConfigured = process.env.LANGSMITH_API_KEY && process.env.LANGSMITH_PROJECT;

// TODO move to main or app.ts
// Initialize the agents using an immediately invoked async function
(async () => {
  try {
    await standardMeetingAnalysisAgent.initialize();
    await ragEnhancedMeetingAnalysisAgent.initialize();
    logger.info('Meeting analysis agents initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize meeting analysis agents', { error });
  }
})();

// Register agents with the singleton orchestrator
specializedAgentOrchestrator.registerAgent(
  'meeting-analysis',
  [
    'analyze_meeting',
    'meeting_analysis',
    'summary_generation',
    'action_item_detection',
  ],
  standardMeetingAnalysisAgent,
);

export const getSummary = async (
  req: Request,
  res: Response,
  next: express.NextFunction,
) => {
  try {
    // Check if agents are initialized by checking their state
    const agentState = standardMeetingAnalysisAgent.getState();
    if (agentState.status !== 'ready') {
      return res.status(503).json({
        error: 'Service unavailable',
        message:
          'Meeting analysis agent is not ready. Current status: ' +
          agentState.status,
      });
    }

    // Generate meetingId
    const meetingId = uuidv4();
      
    let langSmithTraceUrl = null;
    let analysisResult: { output: any } | null = null;
    let transcript = '';
    let hasTranscript = false;
    
    // Get userId from request
    const userId = req.body.userId || 'anonymous';

    // Check for transcript
    if (req.file) {
      // Get the uploaded file's path (Multer stores it in req.file.path)
      const filePath = req.file.path;

      // For simplicity, assume it's a text file. For PDFs, you might use a library like pdf-parse.
      transcript = await fs.readFile(filePath, 'utf8');

      // Optionally, you can remove the file after reading (cleanup)
      await fs.unlink(filePath);
      
      hasTranscript = true;
    } else {
      // No transcript file
      logger.warn('No transcript file uploaded');
    }

    // Always use the standardized adapter with RAG capabilities
    logger.info('Using RAG-enhanced meeting analysis with LangGraph', { meetingId });
    
    try {
      // Process the transcript using the standardized adapter with RAG capabilities
      const result = await standardizedAdapter.processMeetingTranscript({
        meetingId,
        transcript,
        title: req.body.meetingTitle || 'Untitled Meeting',
        participantIds: req.body.participantIds || [],
        userId: userId,
        includeTopics: true,
        includeActionItems: true,
        includeSentiment: req.body.includeSentiment === 'true',
      });
      
      // Get the analysis output
      analysisResult = {
        output: result.output
      };
      
      // Generate a trace ID for LangSmith
      const traceId = `rag-meeting-analysis-${meetingId}`;
      
      // Get LangSmith trace URL if available
      if (isLangSmithConfigured) {
        langSmithTraceUrl = `https://smith.langchain.com/projects/${process.env.LANGSMITH_PROJECT}/traces/${traceId}`;
        logger.info('Generated LangSmith trace URL', { langSmithTraceUrl });
      }
    } catch (error) {
      logger.error('Error in RAG-enhanced processing', { error });
      
      // Fall back to traditional approach
      logger.info('Falling back to traditional approach after RAG error');
      
      try {
        // Use the traditional approach as fallback
        const meetingAnalysisRequest = {
          input: '',
          capability: 'analyze_meeting',
          context: {
            userId: userId,
          },
          parameters: {
            meetingId,
            transcript,
            meetingTitle: req.body.meetingTitle || 'Untitled Meeting',
            participantIds: req.body.participantIds || [],
            includeTopics: true,
            includeActionItems: true,
            includeSentiment: req.body.includeSentiment === 'true',
            trackDecisions: true,
            storeInContext: true, // Enable storing in context
          },
        };

        analysisResult = await specializedAgentOrchestrator.routeRequest(
          meetingAnalysisRequest,
        );
      } catch (fallbackError) {
        logger.error('Error in fallback processing', { error: fallbackError });
        
        // If all else fails, provide an error message
        analysisResult = {
          output: {
            error: "Processing failed",
            details: "There was an error during processing",
            timestamp: new Date().toISOString()
          }
        };
      }
    }

    // If we still have no result, provide an error
    if (!analysisResult) {
      analysisResult = {
        output: {
          error: "No transcript provided or processing failed",
          details: "Either no transcript was uploaded or there was an error during processing",
          timestamp: new Date().toISOString()
        }
      };
    }

    // Return the analysis result
    res.json({
      meetingId,
      analysis: typeof analysisResult?.output === 'string' 
                ? JSON.parse(analysisResult.output) 
                : analysisResult?.output,
      langSmithUrl: langSmithTraceUrl,
      ragEnhanced: true // Always true since we're using RAG by default
    });
  } catch (error) {
    logger.error('Error in getSummary', { error });
    next(error);
  }
};

// Add a new endpoint for decision reporting
export const getDecisionReport = async (
  req: Request,
  res: Response,
  next: express.NextFunction,
) => {
  try {
    // Create agent request for decision reporting
    const decisionReportRequest = {
      input: 'Generate decision report',
      capability: 'generate_report',
      context: {
        userId: req.body.userId || 'anonymous',
      },
      parameters: {
        format: req.body.format || 'summary',
        groupBy: req.body.groupBy,
        includeRationale: req.body.includeRationale === 'true',
        includeImpact: req.body.includeImpact === 'true',
        dateRange: req.body.dateRange,
        filters: req.body.filters || {},
      },
    };

    // Route the request to the decision tracking agent
    const reportResult = await specializedAgentOrchestrator.routeRequest(
      decisionReportRequest,
    );

    // Return the report
    res.json(
      typeof reportResult.output === 'string'
        ? JSON.parse(reportResult.output)
        : reportResult.output,
    );
  } catch (error) {
    logger.error('Error in getDecisionReport', { error });
    next(error);
  }
};
