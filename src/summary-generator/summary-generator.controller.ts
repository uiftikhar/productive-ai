import type { Request, Response } from 'express';
import express from 'express';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';

import { SpecializedAgentOrchestratorImpl } from '../agents/specialized/orchestration/specialized-agent-orchestrator';
import { MeetingAnalysisAgent } from '../agents/specialized/meeting-analysis-agent';
import { MeetingContextService } from '../shared/user-context/services/meeting-context.service';
import { OpenAIAdapter } from '../agents/adapters/openai-adapter';
import { EmbeddingService } from '../shared/embedding/embedding.service';
import { RagPromptManager } from '../shared/services/rag-prompt-manager.service';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { LangChainTracer } from 'langchain/callbacks';
import { DecisionTrackingAgent } from '../agents/specialized/decision-tracking-agent';
import { specializedAgentOrchestrator } from '../agents/specialized/orchestration/specialized-agent-orchestrator';

// Initialize services
const logger = new ConsoleLogger();
const openaiAdapter = new OpenAIAdapter();
const meetingContextService = new MeetingContextService();
const embeddingService = new EmbeddingService(openaiAdapter, logger);
const ragPromptManager = new RagPromptManager();

// Initialize agent orchestrator
specializedAgentOrchestrator.setLogger(logger);

// Initialize specialized agents
const meetingAnalysisAgent = new MeetingAnalysisAgent({
  id: 'meeting-analysis-agent',
  logger,
  openaiAdapter,
  meetingContextService,
  embeddingService,
  ragPromptManager,
});

// Initialize the agent using an immediately invoked async function
(async () => {
  try {
    await meetingAnalysisAgent.initialize();
    logger.info('Meeting analysis agent initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize meeting analysis agent', { error });
  }
})();

// Initialize the Decision Tracking Agent
// const decisionTrackingAgent = new DecisionTrackingAgent(
//   'Decision Tracking Agent',
//   'Analyzes and tracks decisions across meetings',
//   {
//     id: 'decision-tracking-agent',
//     logger,
//     openaiAdapter
//   }
// );

// Register agents with the singleton orchestrator
specializedAgentOrchestrator.registerAgent(
  'meeting-analysis',
  [
    'analyze_meeting',
    'meeting_analysis',
    'summary_generation',
    'action_item_detection',
  ],
  meetingAnalysisAgent,
);

// orchestrator.registerAgent(
//   'decision-tracking',
//   ['analyze_decisions', 'generate_report', 'query_decisions'],
//   decisionTrackingAgent
// );

export const getSummary = async (
  req: Request,
  res: Response,
  next: express.NextFunction,
) => {
  try {
    // Check if agent is initialized by checking its state
    const agentState = meetingAnalysisAgent.getState();
    if (agentState.status !== 'ready') {
      return res.status(503).json({
        error: 'Service unavailable',
        message:
          'Meeting analysis agent is not ready. Current status: ' +
          agentState.status,
      });
    }

    // Optionally, you can accept transcript data from the request body.
    if (!req.file) {
      return res.status(400).json({ error: 'No transcript file uploaded.' });
    }

    // Get the uploaded file's path (Multer stores it in req.file.path)
    const filePath = req.file.path;

    // For simplicity, assume it's a text file. For PDFs, you might use a library like pdf-parse.
    const transcript = await fs.readFile(filePath, 'utf8');

    // Optionally, you can remove the file after reading (cleanup)
    await fs.unlink(filePath);

    // Set up LangChain tracing if requested
    let tracingEnabled = req.query.trace === 'true';

    // Comment out LangChain tracing for now as it needs proper implementation
    /*
    let tracer;
    if (tracingEnabled) {
      tracer = new LangChainTracer();
      tracer.startTrace({
        name: "Meeting Analysis",
      });
    }
    */

    // Generate meetingId
    const meetingId = uuidv4();

    // Create agent request for meeting analysis
    const meetingAnalysisRequest = {
      input: '',
      capability: 'analyze_meeting',
      context: {
        userId: req.body.userId || 'anonymous',
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
      },
    };

    // Use the singleton for routing
    const analysisResult = await specializedAgentOrchestrator.routeRequest(
      meetingAnalysisRequest,
    );

    // End tracing if enabled
    /*
    if (tracingEnabled && tracer) {
      await tracer.endTrace();
    }
    */

    // Return the analysis result
    res.json({
      meetingId,
      analysis: analysisResult.output,
      // visualizationUrl: tracingEnabled ? `/visualization?traceId=${tracer?.traceId}` : undefined
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
