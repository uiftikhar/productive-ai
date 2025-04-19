import { Request, Response } from 'express';
import express from 'express';
import { promises as fs } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { MeetingAnalysisAgent } from '../agents/specialized/meeting-analysis-agent';
import 'reflect-metadata';
import { MeetingAnalysisAdapter } from '../langgraph/core/adapters/meeting-analysis.adapter';

import { MeetingContextService } from '../shared/user-context/services/meeting-context.service';
import { EmbeddingService } from '../shared/embedding/embedding.service';
import { RagPromptManager } from '../shared/services/rag-prompt-manager.service';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { specializedAgentOrchestrator } from '../agents/specialized/orchestration/specialized-agent-orchestrator';
import { configureTracing } from '../langgraph/core/utils/tracing';
import { saveGraphHtml } from '../langgraph/core/utils/graph-visualization';
import { OpenAIAdapter } from '../agents/adapters';

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

// Configure LangGraph tracing
configureTracing({
  enabled: true,
  consoleLogging: true,
  langSmith: {
    enabled: process.env.LANGSMITH_API_KEY ? true : false,
    projectName: 'meeting-analysis',
  },
});

// Create LangGraph adapter for meeting analysis
const meetingAnalysisAdapter = new MeetingAnalysisAdapter(meetingAnalysisAgent, {
  tracingEnabled: true,
});

// Check if LangSmith is configured
const isLangSmithConfigured = process.env.LANGSMITH_API_KEY && process.env.LANGSMITH_PROJECT;

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

// Ensure visualization directory exists
const VISUALIZATION_DIR = path.join(process.cwd(), 'visualizations');
(async () => {
  try {
    await fs.access(VISUALIZATION_DIR);
    console.log('Visualizations directory exists');
  } catch (error) {
    console.log('Creating visualizations directory');
    await fs.mkdir(VISUALIZATION_DIR, { recursive: true });
  }
})().catch(error => {
  console.error('Error setting up visualizations directory:', error);
});

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

    // Generate meetingId
    const meetingId = uuidv4();

    // Check if LangGraph tracing is requested
    let useLangGraph = req.query.langgraph === 'true';
    let visualizationPath = null;
    let langSmithTraceUrl = null;
    let analysisResult: { output: any } | null = null;
    let transcript = '';
    let hasTranscript = false;

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
      // No transcript file, but we'll still generate a visualization if requested
      logger.warn('No transcript file uploaded, will generate error visualization');
    }

    if (useLangGraph) {
      // Use LangGraph adapter for processing
      logger.info('Using LangGraph for meeting analysis', { meetingId });
      
      try {
        // Always process using the adapter, even if there's no transcript
        // The adapter will handle the error and still provide a graph
        const result = await meetingAnalysisAdapter.processMeetingTranscript({
          meetingId,
          transcript,
          title: req.body.meetingTitle || 'Untitled Meeting',
          participantIds: req.body.participantIds || [],
          userId: req.body.userId || 'anonymous',
          includeTopics: true,
          includeActionItems: true,
          includeSentiment: req.body.includeSentiment === 'true',
        });
        
        // Get the analysis output
        analysisResult = {
          output: result.output
        };
        
        // Generate visualization if requested
        if (result.graph) {
          try {
            const visualizationFilename = `meeting-analysis-${meetingId}`;
            await saveGraphHtml(
              result.graph,
              visualizationFilename,
              `Meeting Analysis - ${req.body.meetingTitle || 'Untitled Meeting'}`,
              VISUALIZATION_DIR
            );
            
            // Set the visualization path - this should correspond to the static file route
            visualizationPath = `/visualizations/${visualizationFilename}.html`;
            
            // Verify the file exists after saving
            const fullPath = path.join(VISUALIZATION_DIR, `${visualizationFilename}.html`);
            await fs.access(fullPath);
            logger.info('Visualization file successfully created', { path: fullPath });
            
            // If LangSmith is configured, provide LangSmith URL too
            if (isLangSmithConfigured && result.traceId) {
              langSmithTraceUrl = `https://smith.langchain.com/projects/${process.env.LANGSMITH_PROJECT}/traces/${result.traceId}`;
              logger.info('Generated LangSmith trace URL', { langSmithTraceUrl });
            }
          } catch (error) {
            logger.error('Failed to generate graph visualization', { error });
          }
        }
      } catch (error) {
        logger.error('Error in LangGraph processing', { error });
        // Fall back to traditional approach
        logger.info('Falling back to traditional approach after LangGraph error');
        useLangGraph = false;
      }
    }
    
    // Use the traditional orchestrator approach if LangGraph is not used or failed and we have a transcript
    if ((!useLangGraph || !analysisResult) && hasTranscript) {
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

      analysisResult = await specializedAgentOrchestrator.routeRequest(
        meetingAnalysisRequest,
      );
    } else if (!analysisResult) {
      // We have no result at all, provide an error
      analysisResult = {
        output: {
          error: "No transcript provided or processing failed",
          details: "Either no transcript was uploaded or there was an error during processing",
          timestamp: new Date().toISOString()
        }
      };
    }

    // At this point, analysisResult is guaranteed to be defined
    // Return the analysis result
    res.json({
      meetingId,
      analysis: typeof analysisResult.output === 'string' 
                ? JSON.parse(analysisResult.output) 
                : analysisResult.output,
      visualizationUrl: visualizationPath,
      langSmithUrl: langSmithTraceUrl
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

export const getVisualization = async (req: Request, res: Response) => {
  try {
    const traceId = req.params.id;
    if (!traceId) {
      return res.status(400).send({ error: 'Trace ID is required' });
    }
    
    // Set the path to the visualization file
    const visualizationPath = path.join(__dirname, '../../visualizations', `${traceId}.html`);
    
    // Check if the visualization file exists
    try {
      await fs.access(visualizationPath);
    } catch (error) {
      return res.status(404).send({ error: 'Visualization not found for the given trace ID' });
    }
    
    // Send the HTML file
    res.sendFile(visualizationPath);
  } catch (error) {
    console.error('Error retrieving visualization:', error);
    res.status(500).send({ error: 'Failed to retrieve visualization' });
  }
};
