import { Request, Response } from 'express';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { 
  AgenticMeetingAnalysis, 
  AgenticMeetingAnalysisConfig 
} from '../../langgraph/agentic-meeting-analysis';

/**
 * Controller for transcript analysis using the agentic system
 */
export class TranscriptAnalysisController {
  private agenticSystem: AgenticMeetingAnalysis;
  private logger = new ConsoleLogger();
  private static instance: TranscriptAnalysisController;

  private constructor() {
    // Configure the agentic meeting analysis system
    const config: AgenticMeetingAnalysisConfig = {
      logger: this.logger,
      useCollaborativeFramework: true,
      enableHumanFeedback: false, // Could make this configurable via env vars
      enableAdvancedFunctionality: true
    };
    this.agenticSystem = new AgenticMeetingAnalysis(config);
    
    // Initialize the system
    this.agenticSystem.initialize()
      .then(() => {
        this.logger.info('Agentic Meeting Analysis System initialized successfully');
      })
      .catch((error) => {
        this.logger.error('Failed to initialize Agentic Meeting Analysis System', error);
      });
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): TranscriptAnalysisController {
    if (!TranscriptAnalysisController.instance) {
      TranscriptAnalysisController.instance = new TranscriptAnalysisController();
    }
    return TranscriptAnalysisController.instance;
  }

  /**
   * Analyze a meeting transcript
   */
  public async analyzeTranscript(req: Request, res: Response): Promise<void> {
    try {
      const { transcript, meetingId = `meeting-${Date.now()}`, previousMeetings, additionalContext } = req.body;
      
      if (!transcript) {
        res.status(400).json({ error: 'Transcript is required' });
        return;
      }
      
      // Submit the transcript to the agentic system for analysis
      const analysisTask = await this.agenticSystem.analyzeMeeting(
        meetingId,
        transcript,
        { previousMeetings, additionalContext }
      );
      
      // Return the task information to allow status polling
      res.status(202).json({
        message: 'Analysis started',
        analysisTaskId: analysisTask.analysisTaskId,
        meetingId: analysisTask.meetingId,
        status: analysisTask.status
      });
    } catch (error) {
      this.logger.error('Error analyzing transcript', { error });
      res.status(500).json({ 
        error: 'Failed to analyze transcript',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Get analysis status and results
   */
  public async getAnalysisStatus(req: Request, res: Response): Promise<void> {
    try {
      const meetingId = req.params.meetingId;
      
      if (!meetingId) {
        res.status(400).json({ error: 'Meeting ID is required' });
        return;
      }
      
      // Get status from the agentic system
      const status = await this.agenticSystem.getAnalysisStatus(meetingId);
      
      res.status(200).json(status);
    } catch (error) {
      this.logger.error('Error getting analysis status', { error });
      res.status(500).json({ 
        error: 'Failed to get analysis status',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Clean up resources
   */
  public async cleanup(): Promise<void> {
    // Future implementation: Clean up resources when needed
  }
} 