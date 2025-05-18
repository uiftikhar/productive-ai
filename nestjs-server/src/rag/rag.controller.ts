import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Logger,
  ValidationPipe,
  UsePipes,
  HttpStatus,
  HttpCode,
  Inject,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RagService } from './rag.service';
import { AnalyzeTranscriptDto } from '../langgraph/meeting-analysis/dto/analyze-transcript.dto';
import { AnalysisResultDto } from '../langgraph/meeting-analysis/dto/analysis-result.dto';
import { MeetingAnalysisService } from '../langgraph/meeting-analysis/meeting-analysis.service';
import { RAG_SERVICE } from './constants/injection-tokens';
import { ConfigService } from '@nestjs/config';
import { MEETING_CHUNK_ANALYSIS_PROMPT } from '../instruction-promtps';
import { WorkflowService } from '../langgraph/graph/workflow.service';

/**
 * Controller for RAG-enhanced meeting analysis endpoints
 */
@ApiTags('RAG Meeting Analysis')
@ApiBearerAuth()
@Controller('rag-meeting-analysis')
export class RagController {
  private readonly logger = new Logger(RagController.name);
  private readonly activeRagSessions = new Map<string, string>();

  constructor(
    @Inject(RAG_SERVICE) private readonly ragService: RagService,
    private readonly meetingAnalysisService: MeetingAnalysisService,
    private readonly configService: ConfigService,
    private readonly workflowService: WorkflowService,
  ) {
    this.logger.log('RAG Meeting Analysis Controller initialized');
    this.logger.debug(`Using analysis prompt: ${MEETING_CHUNK_ANALYSIS_PROMPT.substring(0, 50)}...`);
  }

  /**
   * Submit a transcript for RAG-enhanced analysis
   */
  @ApiOperation({ summary: 'Analyze a meeting transcript with RAG enhancement' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'RAG-enhanced analysis initiated successfully',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed', 'failed'],
        },
      },
    },
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid input data',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @HttpCode(HttpStatus.OK)
  @Post()
  async analyzeTranscriptWithRag(@Body() dto: AnalyzeTranscriptDto) {
    try {
      this.logger.log(`Received RAG-enhanced transcript analysis request for ${dto.metadata?.title || 'untitled'}`);
      
      // Create session immediately
      const sessionId = await this.workflowService.createSession({
        transcript: dto.transcript,
        metadata: dto.metadata
      });
      
      this.logger.log(`Analysis initiated with session ID: ${sessionId}`);
      
      // Start RAG processing and analysis process in background
      this.processTranscriptWithRag(sessionId, dto).catch(error => {
        this.logger.error(`Analysis failed for session ${sessionId}: ${error.message}`, error.stack);
      });
      
      // Return session ID immediately
      return { 
        sessionId,
        status: 'pending'
      };
    } catch (error) {
      this.logger.error(`Failed to create analysis session: ${error instanceof Error ? error.message : String(error)}`, {
        error: error instanceof Error ? error.stack : String(error),
        context: 'Session Creation',
      });
      throw new InternalServerErrorException(`Failed to create analysis session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Process transcript with RAG in the background
   * This is a private method that runs asynchronously after returning the session ID
   */
  private async processTranscriptWithRag(sessionId: string, dto: AnalyzeTranscriptDto) {
    try {
      this.logger.debug(`Starting background processing for session ${sessionId}`);
      
      // Update session status to in_progress
      await this.workflowService.updateSessionStatus(sessionId, 'in_progress');
      
      let ragProcessingSuccessful = false;
      let ragError: Error | null = null;
      
      // Try to index the transcript with RAG, but continue even if it fails
      try {
        this.logger.log('Starting RAG processing for transcript');
        
        const documentId = `transcript-${Date.now()}`;
        const metadata = {
          ...dto.metadata,
          source: 'meeting_transcript',
          processed_date: new Date().toISOString(),
          sessionId,
        };
        
        this.logger.debug(`Processing document with ID: ${documentId}`);
        
        // Check if RAG is enabled
        const ragEnabled = this.configService.get<string>('RAG_ENABLED', 'true') === 'true';
        
        if (ragEnabled) {
          await this.ragService.processDocumentsForRag([
            {
              id: documentId,
              content: dto.transcript,
              metadata,
            },
          ]);
          
          this.logger.log('Successfully processed transcript for RAG');
          ragProcessingSuccessful = true;
        } else {
          this.logger.log('RAG processing is disabled by configuration');
        }
      } catch (error) {
        // Log the error but continue with regular analysis
        this.logger.error(`RAG processing failed but continuing: ${error instanceof Error ? error.message : String(error)}`, {
          error: error instanceof Error ? error.stack : String(error),
          context: 'RAG Processing',
        });
        
        // Store error for response
        if (error instanceof Error) {
          ragError = error;
        } else {
          ragError = new Error(String(error));
        }
      }
      
      // Run analysis using workflow service
      this.logger.log(`Starting analysis for session ${sessionId}`);
      await this.workflowService.runAnalysis(sessionId);
      
      // Update metadata with RAG information
      const metadata = {
        usedRag: ragProcessingSuccessful,
        ragError: ragError ? {
          message: ragError.message,
          type: ragError.constructor.name
        } : null
      };
      
      await this.workflowService.updateSessionMetadata(sessionId, metadata);
      
      this.logger.log(`Analysis completed for session ${sessionId}`);
    } catch (error) {
      this.logger.error(`Analysis failed for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`, {
        error: error instanceof Error ? error.stack : String(error),
        context: 'Background Processing',
      });
      
      // Update session status to failed
      await this.workflowService.updateSessionStatus(sessionId, 'failed', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get the status of an analysis session
   */
  @ApiOperation({ summary: 'Get the status of an analysis session' })
  @ApiParam({ name: 'sessionId', description: 'Unique session identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Analysis status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        status: {
          type: 'string',
          enum: ['pending', 'in_progress', 'completed', 'failed'],
        },
        progress: { type: 'number' },
        error: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Session not found' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @Get(':sessionId/status')
  async getAnalysisStatus(@Param('sessionId') sessionId: string) {
    try {
      // Check if we have a mapping for this session ID
      const mappedSessionId = this.activeRagSessions.get(sessionId);
      if (mappedSessionId) {
        sessionId = mappedSessionId;
      }
      
      // Get session info
      const sessionInfo = this.workflowService.getSessionInfo(sessionId);
      
      if (!sessionInfo) {
        this.logger.warn(`Session not found: ${sessionId}`);
        throw new NotFoundException(`Session not found: ${sessionId}`);
      }
      
      // Return status information
      return {
        sessionId,
        status: sessionInfo.status,
        progress: sessionInfo.status === 'completed' ? 100 : 
                 sessionInfo.status === 'failed' ? 100 : 
                 sessionInfo.status === 'in_progress' ? 50 : 
                 sessionInfo.status === 'pending' ? 0 : 0,
        error: sessionInfo.error,
        metadata: sessionInfo.metadata
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      this.logger.error(`Failed to get status for session ${sessionId}: ${error.message}`);
      throw new InternalServerErrorException(`Failed to get status: ${error.message}`);
    }
  }

  /**
   * Get RAG-enhanced analysis results by session ID
   */
  @ApiOperation({ summary: 'Get RAG-enhanced analysis results by session ID' })
  @ApiParam({ name: 'sessionId', description: 'Unique session identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'RAG-enhanced analysis results retrieved successfully',
    type: AnalysisResultDto,
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Session not found',
  })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Unauthorized' })
  @UseGuards(JwtAuthGuard)
  @Get(':sessionId')
  async getRagAnalysisResults(@Param('sessionId') sessionId: string) {
    this.logger.log(`Retrieving RAG-enhanced analysis results for session ${sessionId}`);
    
    try {
      // Check if we have a mapping for this session ID
      const mappedSessionId = this.activeRagSessions.get(sessionId);
      if (mappedSessionId) {
        this.logger.log(`Using mapped session ID: ${mappedSessionId} for original ID: ${sessionId}`);
        sessionId = mappedSessionId;
      }
      
      // Get session info for status and timing
      const sessionInfo = this.workflowService.getSessionInfo(sessionId);
      
      // Load analysis results from workflow service
      this.logger.log(`Loading analysis results for session ${sessionId}`);
      let results = await this.workflowService.loadAnalysisResults(sessionId);
      
      if (!results && sessionInfo) {
        this.logger.warn(`No results found yet for session ${sessionId}, returning status information`);
        // Return partial response with status information
        return {
          sessionId,
          status: sessionInfo.status,
          createdAt: sessionInfo.startTime?.toISOString(),
          message: 'Analysis in progress. Results not available yet.',
          results: {
            transcript: '',
            topics: [],
            actionItems: [],
          }
        };
      } else if (!results) {
        this.logger.warn(`No results or session info found for ${sessionId}`);
        throw new NotFoundException(`No results found for session ${sessionId}`);
      }
      
      if (!sessionInfo) {
        this.logger.warn(`Session info not found for ${sessionId}`);
        throw new NotFoundException(`Session not found: ${sessionId}`);
      }
      
      this.logger.log(`Successfully retrieved results for session ${sessionId}`);
      
      // Always wrap the results in a consistent format
      return {
        sessionId,
        status: sessionInfo?.status || 'unknown',
        createdAt: sessionInfo?.startTime?.toISOString(),
        completedAt: sessionInfo?.endTime?.toISOString(),
        results: {
          ...results,
        }
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      this.logger.error(`Failed to retrieve results for session ${sessionId}: ${error.message}`);
      throw new InternalServerErrorException(`Failed to retrieve results: ${error.message}`);
    }
  }

  /**
   * Get visualization status for a session
   */
  @ApiOperation({ summary: 'Get visualization status for a session' })
  @ApiParam({ name: 'sessionId', description: 'Analysis session ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Visualization status',
    schema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        visualizationReady: { type: 'boolean' },
        eventsCount: { type: 'number' },
        connectionCount: { type: 'number' },
      },
    },
  })
  @UseGuards(JwtAuthGuard)
  @Get('/:sessionId/visualization-status')
  async getVisualizationStatus(@Param('sessionId') sessionId: string) {
    try {
      this.logger.log(`Retrieving visualization status for session ${sessionId}`);
      
      // Check if session exists
      const sessionInfo = this.workflowService.getSessionInfo(sessionId);
      if (!sessionInfo) {
        throw new NotFoundException(`Session not found: ${sessionId}`);
      }
      
      // Get connection count and event count from the workflow service
      const visualizationStatus = await this.workflowService.getVisualizationStatus(sessionId);
      
      return {
        sessionId,
        status: sessionInfo.status,
        createdAt: sessionInfo.startTime?.toISOString(),
        ...visualizationStatus
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      
      this.logger.error(`Failed to retrieve visualization status for session ${sessionId}: ${error.message}`);
      throw new InternalServerErrorException(`Failed to retrieve visualization status: ${error.message}`);
    }
  }
} 