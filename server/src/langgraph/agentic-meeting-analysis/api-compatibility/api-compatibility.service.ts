/**
 * API compatibility layer for the Agentic Meeting Analysis System
 */
import { v4 as uuidv4 } from 'uuid';
import {
  IApiCompatibilityLayer,
  LegacyMeetingAnalysisRequest,
  LegacyMeetingAnalysisResponse,
  AgenticMeetingAnalysisRequest,
  AgenticMeetingAnalysisResponse,
} from '../interfaces/api-compatibility.interface';
import { AnalysisGoalType } from '../interfaces/agent.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';

/**
 * Configuration options for ApiCompatibilityService
 */
export interface ApiCompatibilityServiceConfig {
  logger?: Logger;
  defaultFeatureFlag?: boolean; // Whether agentic mode is enabled by default
}

/**
 * Implementation of API compatibility layer
 */
export class ApiCompatibilityService implements IApiCompatibilityLayer {
  private logger: Logger;
  private featureFlags: Map<string, boolean> = new Map();
  private static readonly FEATURE_FLAG_KEY = 'agentic_meeting_analysis_enabled';
  private static readonly VERSION = '1.0.0';

  /**
   * Create a new API compatibility service
   */
  constructor(config: ApiCompatibilityServiceConfig = {}) {
    this.logger = config.logger || new ConsoleLogger();

    // Set default feature flag
    this.featureFlags.set(
      ApiCompatibilityService.FEATURE_FLAG_KEY,
      config.defaultFeatureFlag ?? false,
    );

    this.logger.info('Initialized ApiCompatibilityService');
  }

  /**
   * Convert a legacy request to the new agentic format
   */
  convertLegacyToAgenticRequest(
    legacyRequest: LegacyMeetingAnalysisRequest,
  ): AgenticMeetingAnalysisRequest {
    this.logger.debug(
      `Converting legacy request for meeting ${legacyRequest.meetingId} to agentic format`,
    );

    // Build goals array based on legacy flags
    const goals: AnalysisGoalType[] = [AnalysisGoalType.GENERATE_SUMMARY];

    if (legacyRequest.includeTopics) {
      goals.push(AnalysisGoalType.EXTRACT_TOPICS);
    }

    if (legacyRequest.includeActionItems) {
      goals.push(AnalysisGoalType.EXTRACT_ACTION_ITEMS);
    }

    if (legacyRequest.includeSentiment) {
      goals.push(AnalysisGoalType.ANALYZE_SENTIMENT);
    }

    // Map participants
    const participants =
      legacyRequest.participantIds?.map((id) => ({
        id,
        name: id, // Default to ID as name since legacy format doesn't have names
      })) || [];

    // Create agentic request
    const agenticRequest: AgenticMeetingAnalysisRequest = {
      meetingId: legacyRequest.meetingId,
      transcript: legacyRequest.transcript,
      title: legacyRequest.title,
      participants,
      userId: legacyRequest.userId,
      goals,
      options: {
        visualization: legacyRequest.visualization ?? false,
        // Map adaptive chunking if provided
        teamComposition: legacyRequest.adaptiveChunking
          ? {
              // In adaptive mode, we'll use more specialists for better analysis
              maxTeamSize: 8,
            }
          : {
              // In standard mode, we'll use a smaller team
              maxTeamSize: 4,
            },
      },
    };

    return agenticRequest;
  }

  /**
   * Convert an agentic response to the legacy format
   */
  convertAgenticToLegacyResponse(
    agenticResponse: AgenticMeetingAnalysisResponse,
  ): LegacyMeetingAnalysisResponse {
    this.logger.debug(
      `Converting agentic response for meeting ${agenticResponse.meetingId} to legacy format`,
    );

    // Extract the results in a format compatible with legacy API
    const output = {
      summary: agenticResponse.results.summary.short,
      detailed_summary: agenticResponse.results.summary.detailed,
      topics: agenticResponse.results.topics,
      action_items: agenticResponse.results.actionItems,
      sentiment: agenticResponse.results.sentiment,
      participant_metrics: agenticResponse.results.participation,
      team_info: agenticResponse.team
        ? {
            coordinator: agenticResponse.team.coordinator,
            specialists: agenticResponse.team.specialists.map((s) => ({
              id: s.id,
              name: s.name,
              expertise: s.expertise.join(', '),
            })),
          }
        : undefined,
    };

    // Create legacy response
    const legacyResponse: LegacyMeetingAnalysisResponse = {
      meetingId: agenticResponse.meetingId,
      output,
      success: agenticResponse.success,
      metrics: {
        executionTimeMs: agenticResponse.metrics.executionTimeMs,
        tokensUsed: agenticResponse.metrics.tokensUsed,
      },
      visualizationUrl: agenticResponse.visualizationUrls?.workflow,
    };

    return legacyResponse;
  }

  /**
   * Process a legacy request
   */
  async processLegacyRequest(
    request: LegacyMeetingAnalysisRequest,
  ): Promise<LegacyMeetingAnalysisResponse> {
    this.logger.info(
      `Processing legacy request for meeting ${request.meetingId}`,
    );

    // Check if agentic mode is enabled
    const agenticModeEnabled = await this.isAgenticMode();

    if (agenticModeEnabled) {
      // Convert to agentic format and process with the new system
      const agenticRequest = this.convertLegacyToAgenticRequest(request);
      const agenticResponse = await this.processAgenticRequest(agenticRequest);

      // Convert back to legacy format
      return this.convertAgenticToLegacyResponse(agenticResponse);
    } else {
      // Agentic mode is disabled, so we should delegate to the legacy implementation
      // This is a stub for the real implementation which would call the legacy service
      this.logger.info(
        'Agentic mode is disabled, delegating to legacy implementation',
      );

      throw new Error(
        'Legacy implementation is not available - please enable agentic mode',
      );
    }
  }

  /**
   * Process an agentic request - this is a stub that would be replaced with the real implementation
   */
  async processAgenticRequest(
    request: AgenticMeetingAnalysisRequest,
  ): Promise<AgenticMeetingAnalysisResponse> {
    this.logger.info(
      `Processing agentic request for meeting ${request.meetingId}`,
    );

    // This is a stub for the real implementation
    // In a real implementation, this would:
    // 1. Initialize the analysis coordinator agent
    // 2. Form a team based on the required goals
    // 3. Create the workflow
    // 4. Execute the workflow
    // 5. Return the results

    throw new Error(
      'Agentic implementation not yet connected - this is a placeholder',
    );
  }

  /**
   * Get the status of a legacy analysis
   */
  async getLegacyAnalysisStatus(meetingId: string): Promise<{
    meetingId: string;
    status: string;
    progress: number;
  }> {
    this.logger.debug(`Getting legacy status for meeting ${meetingId}`);

    // Check if agentic mode is enabled
    const agenticModeEnabled = await this.isAgenticMode();

    if (agenticModeEnabled) {
      // In agentic mode, we need to get the status from the new system and map it
      // This is a stub for the real implementation
      return {
        meetingId,
        status: 'in_progress',
        progress: 50,
      };
    } else {
      // Delegate to legacy implementation
      throw new Error(
        'Legacy implementation is not available - please enable agentic mode',
      );
    }
  }

  /**
   * Get the results of a legacy analysis
   */
  async getLegacyAnalysisResults(
    meetingId: string,
  ): Promise<LegacyMeetingAnalysisResponse> {
    this.logger.debug(`Getting legacy results for meeting ${meetingId}`);

    // Check if agentic mode is enabled
    const agenticModeEnabled = await this.isAgenticMode();

    if (agenticModeEnabled) {
      // In agentic mode, we need to get the results from the new system and map them
      // This is a stub for the real implementation

      // Create a dummy response for now
      const dummyAgenticResponse: AgenticMeetingAnalysisResponse = {
        meetingId,
        results: {
          meetingId,
          summary: {
            short: 'Meeting summary placeholder',
            detailed: 'Detailed meeting summary placeholder',
          },
          metadata: {
            processedBy: [],
            confidence: 0.8,
            version: '1.0',
            generatedAt: Date.now(),
          },
        },
        executionId: `exec-${uuidv4()}`,
        success: true,
        metrics: {
          executionTimeMs: 1000,
        },
      };

      return this.convertAgenticToLegacyResponse(dummyAgenticResponse);
    } else {
      // Delegate to legacy implementation
      throw new Error(
        'Legacy implementation is not available - please enable agentic mode',
      );
    }
  }

  /**
   * Check if agentic mode is enabled
   */
  async isAgenticMode(): Promise<boolean> {
    return (
      this.featureFlags.get(ApiCompatibilityService.FEATURE_FLAG_KEY) ?? false
    );
  }

  /**
   * Enable or disable agentic mode
   */
  async setAgenticMode(enabled: boolean): Promise<void> {
    this.logger.info(`Setting agentic mode to: ${enabled}`);
    this.featureFlags.set(ApiCompatibilityService.FEATURE_FLAG_KEY, enabled);
  }

  /**
   * Get the compatibility layer version
   */
  async getCompatibilityVersion(): Promise<string> {
    return ApiCompatibilityService.VERSION;
  }

  /**
   * Map an agentic error to legacy format
   */
  mapAgenticErrorToLegacyFormat(error: any): any {
    // Map error codes and messages
    const originalMessage =
      error instanceof Error ? error.message : String(error);

    // Create a legacy-formatted error
    return {
      success: false,
      error: {
        message: originalMessage,
        code: 'AGENTIC_ERROR',
        details: error instanceof Error ? error.stack || '' : '',
      },
    };
  }
}
