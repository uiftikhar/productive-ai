import { Request, Response } from 'express';
import express from 'express';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { MeetingAnalysisAgent } from '../../agents/specialized/meeting-analysis-agent';
import 'reflect-metadata';
import { StandardizedMeetingAnalysisAdapter } from '../../langgraph/core/adapters/standardized-meeting-analysis.adapter';
import { configureTracing } from '../../langgraph/core/utils/tracing';
import { AgentWorkflow } from '../../langgraph/core/workflows/agent-workflow';

import { EmbeddingServiceFactory } from '../../shared/services/embedding.factory';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { OpenAIConnector } from '../../agents/integrations/openai-connector';
import { AgentFactory } from '../../agents/factories/agent-factory';

// Type imports to help with type casting
import { AgentRequest } from '../../agents/interfaces/base-agent.interface';
import { AgentStatus } from '../../agents/interfaces/base-agent.interface';
import dotenv from 'dotenv';
import { BaseContextService } from '../../shared/services/user-context/base-context.service';

dotenv.config();

const logger = new ConsoleLogger();
const openaiConnector = new OpenAIConnector({
  logger,
});
const embeddingService = EmbeddingServiceFactory.getService({
  connector: openaiConnector,
  logger,
});
const baseContextService = new BaseContextService({ logger });

// TODO move to main or app.ts
(async () => {
  try {
    await baseContextService.initialize();
    logger.info('Base context service initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize base context service', { error });
  }
})();

const agentFactory = new AgentFactory({
  logger,
  openAIConnector: openaiConnector,
  embeddingService: embeddingService,
});

const meetingAnalysisAgent = agentFactory.createMeetingAnalysisAgent({
  id: 'rag-meeting-analysis-agent',
  name: 'RAG Meeting Analysis Agent',
  description: 'Analyzes meeting transcripts with RAG capabilities',
  baseContextService: baseContextService,
}) as MeetingAnalysisAgent;

const meetingAnalysisWorkflow = new AgentWorkflow(meetingAnalysisAgent, {
  tracingEnabled: true,
});

// Configure LangGraph tracing
configureTracing({
  enabled: true,
  consoleLogging: true,
  langSmith: {
    enabled: process.env.LANGSMITH_API_KEY ? true : false,
    projectName: 'meeting-analysis',
  },
});

const meetingAnalysisAdapter = new StandardizedMeetingAnalysisAdapter(
  {
    id: meetingAnalysisAgent.id,
    name: meetingAnalysisAgent.name,
    description: meetingAnalysisAgent.description,
    getCapabilities: () => meetingAnalysisAgent.getCapabilities(),
    // Use the workflow for execution
    execute: (request: AgentRequest) =>
      meetingAnalysisWorkflow.execute(request),
    // Use the agent for the rest of the interface methods
    initialize: async () => {
      // The agent initialization should be handled by the agent itself
      await meetingAnalysisAgent.initialize();
      // No return value (void)
    },
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

(async () => {
  try {
    // The workflow executes the agent, but we need to initialize the agent itself
    await meetingAnalysisAgent.initialize();
    logger.info('Meeting analysis agent initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize meeting analysis agent', { error });
  }
})();

/**
 * Extract and validate transcript from request
 */
async function extractTranscript(req: Request): Promise<string> {
  if (!req.file) {
    logger.warn('No transcript file uploaded');
    throw new Error('No transcript provided. Please upload a transcript file');
  }

  const filePath = req.file.path;
  const transcript = await fs.readFile(filePath, 'utf8');
  await fs.unlink(filePath); // Clean up the file after reading
  return transcript;
}

/**
 * Generate LangSmith trace URL if configured
 */
function generateLangSmithUrl(meetingId: string): string | null {
  if (!isLangSmithConfigured) return null;

  // Use the specific organization ID and project ID format
  const workspaceId = process.env.LANGSMITH_WORKSPACE_ID;
  const projectId = process.env.LANGSMITH_PROJECT_ID;

  // Link to the project page using the proper format
  const url = `https://smith.langchain.com/o/${workspaceId}/projects/p/${projectId}`;
  logger.info('Generated LangSmith project URL', { url });
  return url;
}

/**
 * Process meeting transcript and generate analysis
 */
async function processMeetingTranscript(params: {
  meetingId: string;
  transcript: string;
  userId: string;
  meetingTitle: string;
  participantIds: string[];
  includeSentiment: boolean;
}): Promise<{ output: any }> {
  const result = await meetingAnalysisAdapter.processMeetingTranscript({
    meetingId: params.meetingId,
    transcript: params.transcript,
    title: params.meetingTitle || 'Untitled Meeting',
    participantIds: params.participantIds || [],
    userId: params.userId,
    includeTopics: true,
    includeActionItems: true,
    includeSentiment: params.includeSentiment,
  });

  return { output: result.output };
}

/**
 * Main handler for summary generation
 */
export const getSummary = async (
  req: Request,
  res: Response,
  next: express.NextFunction,
) => {
  try {
    // Check if agent is initialized
    const agentState = meetingAnalysisAgent.getState();
    if (agentState.status !== AgentStatus.READY) {
      return res.status(503).json({
        error: 'Service unavailable',
        message: `Meeting analysis agent is not ready. Current status: ${agentState.status}`,
      });
    }

    // Generate meetingId and get userId
    const meetingId = uuidv4();
    const userId = req.body.userId || 'anonymous';

    // Extract transcript
    let transcript;
    try {
      transcript = await extractTranscript(req);
    } catch (error) {
      return res.status(400).json({
        error: 'Transcript error',
        message: error instanceof Error ? error.message : 'Invalid transcript',
      });
    }

    let analysisResult;
    try {
      logger.info('Using LangGraph for meeting analysis', { meetingId });
      analysisResult = await processMeetingTranscript({
        meetingId,
        transcript,
        userId,
        meetingTitle: req.body.meetingTitle || 'Untitled Meeting',
        participantIds: req.body.participantIds || [],
        includeSentiment: req.body.includeSentiment === 'true',
      });
    } catch (error) {
      logger.error('Error in meeting analysis', { error });
      return res.status(500).json({
        error: 'Processing failed',
        details:
          error instanceof Error
            ? error.message
            : 'There was an error during processing',
        timestamp: new Date().toISOString(),
      });
    }

    // Generate LangSmith URL
    const langSmithTraceUrl = generateLangSmithUrl(meetingId);

    return res.json({
      meetingId,
      analysis:
        typeof analysisResult.output === 'string'
          ? JSON.parse(analysisResult.output)
          : analysisResult.output,
      langSmithUrl: langSmithTraceUrl,
    });
  } catch (error) {
    logger.error('Error in getSummary', { error });
    next(error);
  }
};
