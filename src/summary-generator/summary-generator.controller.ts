import { Request, Response } from 'express';
import express from 'express';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { MeetingAnalysisAgent } from '../agents/specialized/meeting-analysis-agent';
import 'reflect-metadata';
import { StandardizedMeetingAnalysisAdapter } from '../langgraph/core/adapters/standardized-meeting-analysis.adapter';
import { configureTracing } from '../langgraph/core/utils/tracing';

import { EmbeddingService } from '../shared/embedding/embedding.service';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { OpenAIAdapter } from '../agents/adapters';
import { BaseContextService } from '../shared/user-context/services/base-context.service';

// Type imports to help with type casting
import { AgentRequest } from '../agents/interfaces/unified-agent.interface';
import { AgentStatus } from '../agents/interfaces/unified-agent.interface';

// Initialize services
const logger = new ConsoleLogger();
const openaiAdapter = new OpenAIAdapter({
  logger,
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

// Initialize RAG-enhanced agent for the standardized adapter
const meetingAnalysisAgent = new MeetingAnalysisAgent(
  'RAG Meeting Analysis Agent',
  'Analyzes meeting transcripts with RAG capabilities',
  {
    id: 'rag-meeting-analysis-agent',
    logger,
    openAIAdapter: openaiAdapter,
    embeddingService: embeddingService,
    baseContextService: baseContextService,
  },
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
const meetingAnalysisAdapter = new StandardizedMeetingAnalysisAdapter(
  {
    //  TODO Fix this hack
    // Type compatibility issue: we're using the MeetingAnalysisAgent class instead of UnifiedAgent
    // but we know it has the required functionality
    id: meetingAnalysisAgent.id,
    name: meetingAnalysisAgent.name,
    description: meetingAnalysisAgent.description,
    getCapabilities: () => meetingAnalysisAgent.getCapabilities(),
    execute: (request: AgentRequest) => meetingAnalysisAgent.execute(request),
    initialize: () => meetingAnalysisAgent.initialize(),
    getState: () => meetingAnalysisAgent.getState(),
    canHandle: (capability: string) =>
      meetingAnalysisAgent.canHandle(capability),
    getInitializationStatus: () =>
      meetingAnalysisAgent.getInitializationStatus(),
    terminate: () => meetingAnalysisAgent.terminate(),
    getMetrics: () => meetingAnalysisAgent.getMetrics(),
  } as any,
  {
    tracingEnabled: true,
    logger,
    maxChunkSize: 2000,
    chunkOverlap: 200,
  },
);

// Check if LangSmith is configured
const isLangSmithConfigured =
  process.env.LANGSMITH_API_KEY && process.env.LANGSMITH_PROJECT;

// Initialize the agent
(async () => {
  try {
    await meetingAnalysisAgent.initialize();
    logger.info('Meeting analysis agent initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize meeting analysis agent', { error });
  }
})();

export const getSummary = async (
  req: Request,
  res: Response,
  next: express.NextFunction,
) => {
  try {
    // Check if agent is initialized by checking state
    const agentState = meetingAnalysisAgent.getState();
    if (agentState.status !== AgentStatus.READY) {
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
    } else {
      // No transcript file
      logger.warn('No transcript file uploaded');
      return res.status(400).json({
        error: 'No transcript provided',
        message: 'Please upload a transcript file',
      });
    }

    // Process the transcript using the LangGraph adapter
    logger.info('Using LangGraph for meeting analysis', { meetingId });

    try {
      // Process the transcript using the standardized adapter with RAG capabilities
      const result = await meetingAnalysisAdapter.processMeetingTranscript({
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
        output: result.output,
      };

      // Generate a trace ID for LangSmith
      const traceId = `rag-meeting-analysis-${meetingId}`;

      // Get LangSmith trace URL if available
      if (isLangSmithConfigured) {
        langSmithTraceUrl = `https://smith.langchain.com/projects/${process.env.LANGSMITH_PROJECT}/traces/${traceId}`;
        logger.info('Generated LangSmith trace URL', { langSmithTraceUrl });
      }
    } catch (error) {
      logger.error('Error in meeting analysis', { error });

      // Return error response
      return res.status(500).json({
        error: 'Processing failed',
        details:
          error instanceof Error
            ? error.message
            : 'There was an error during processing',
        timestamp: new Date().toISOString(),
      });
    }

    // Return the analysis result
    res.json({
      meetingId,
      analysis:
        typeof analysisResult?.output === 'string'
          ? JSON.parse(analysisResult.output)
          : analysisResult?.output,
      langSmithUrl: langSmithTraceUrl,
    });
  } catch (error) {
    logger.error('Error in getSummary', { error });
    next(error);
  }
};
