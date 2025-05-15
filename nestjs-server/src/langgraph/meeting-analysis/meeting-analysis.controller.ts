import { 
  Controller, 
  Post, 
  Get, 
  Body, 
  Param, 
  UseGuards, 
  Logger 
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MeetingAnalysisService, SessionInfo } from './meeting-analysis.service';

/**
 * DTO for submitting a transcript for analysis
 */
class AnalyzeTranscriptDto {
  transcript: string;
  metadata?: Record<string, any>;
}

/**
 * Controller for meeting analysis endpoints
 */
@Controller('api/meeting-analysis')
export class MeetingAnalysisController {
  private readonly logger = new Logger(MeetingAnalysisController.name);

  constructor(private readonly meetingAnalysisService: MeetingAnalysisService) {}

  /**
   * Submit a transcript for analysis
   */
  @UseGuards(JwtAuthGuard)
  @Post()
  async analyzeTranscript(@Body() dto: AnalyzeTranscriptDto) {
    this.logger.log('Received transcript analysis request');
    return this.meetingAnalysisService.analyzeTranscript(dto.transcript, dto.metadata);
  }

  /**
   * Get analysis results by session ID
   */
  @UseGuards(JwtAuthGuard)
  @Get(':sessionId')
  async getAnalysisResults(@Param('sessionId') sessionId: string) {
    this.logger.log(`Retrieving analysis results for session ${sessionId}`);
    return this.meetingAnalysisService.getAnalysisResults(sessionId);
  }

  /**
   * Get all sessions
   */
  @UseGuards(JwtAuthGuard)
  @Get()
  async getAllSessions(): Promise<SessionInfo[]> {
    this.logger.log('Retrieving all analysis sessions');
    return this.meetingAnalysisService.getAllSessions();
  }
} 