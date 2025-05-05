import { BaseMessage } from '@langchain/core/messages';
import { BaseAgent } from '../base/base-agent';
import {
  AgentRequest,
  AgentResponse,
  AgentCapability,
} from '../interfaces/base-agent.interface';
import { OpenAIConnector } from '../integrations/openai-connector';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Agent specialized in analyzing multiple transcripts to identify knowledge gaps,
 * recurring themes, and divergences between meetings.
 */
export class KnowledgeGapAgent extends BaseAgent {
  private openAIConnector: OpenAIConnector;

  constructor(
    openAIConnector: OpenAIConnector,
    options: {
      logger?: Logger;
      id?: string;
    } = {},
  ) {
    super(
      'Knowledge Gap Analysis Agent',
      'Identifies knowledge gaps, recurring themes, and divergences between meeting transcripts',
      {
        logger: options.logger,
        id: options.id || 'knowledge-gap-agent',
      },
    );

    this.openAIConnector = openAIConnector;

    this.registerCapabilities();
  }

  /**
   * Register the agent's capabilities
   */
  private registerCapabilities(): void {
    // Find knowledge gaps capability
    this.registerCapability({
      name: 'find-knowledge-gaps',
      description:
        'Analyze multiple transcripts to identify knowledge gaps, recurring themes, and divergences',
      parameters: {
        transcripts: 'Array of transcript texts to analyze',
        sessionId: 'Session identifier for tracking the analysis',
      },
    });

    // Extract key topics capability
    this.registerCapability({
      name: 'extract-key-topics',
      description:
        'Extract key topics, entities, and information from a transcript',
      parameters: {
        transcript: 'Text transcript to analyze',
        transcriptId: 'Identifier for the transcript',
      },
    });
  }

  /**
   * Implementation of abstract execute method
   */
  public async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const startTime = Date.now();
    const capability = request.capability || 'find-knowledge-gaps';

    if (!this.canHandle(capability)) {
      throw new Error(`Capability not supported: ${capability}`);
    }

    try {
      switch (capability) {
        case 'find-knowledge-gaps':
          const transcripts = request.parameters?.transcripts as string[];
          const sessionId = request.parameters?.sessionId as string;

          if (!transcripts || !Array.isArray(transcripts)) {
            throw new Error('Transcripts array is required');
          }

          const result = await this.findKnowledgeGaps(transcripts, sessionId);
          return {
            output: JSON.stringify(result),
            success: true,
            metrics: this.processMetrics(startTime),
          };

        case 'extract-key-topics':
          const transcript = request.parameters?.transcript as string;
          const transcriptId = request.parameters?.transcriptId as string;

          if (!transcript) {
            throw new Error('Transcript is required');
          }

          const topicsResult = await this.extractKeyTopics(
            transcript,
            transcriptId || 'unknown',
          );
          return {
            output: JSON.stringify(topicsResult),
            success: true,
            metrics: this.processMetrics(startTime),
          };

        default:
          throw new Error(`Unsupported capability: ${capability}`);
      }
    } catch (error: any) {
      this.logger.error(`Error in KnowledgeGapAgent: ${error.message}`);

      this.setState({
        errorCount: this.getState().errorCount + 1,
      });

      throw error;
    }
  }

  /**
   * Main method to find knowledge gaps between multiple transcripts
   * @param transcripts Array of transcript texts
   * @param sessionId Session identifier
   * @returns Analysis report with gaps, themes and recommendations
   */
  async findKnowledgeGaps(
    transcripts: string[],
    sessionId: string,
  ): Promise<any> {
    this.logger.info(
      `Beginning knowledge gap analysis for session ${sessionId}`,
    );

    try {
      // 1. Process each transcript for key topics and entities
      const processedTranscripts = await Promise.all(
        transcripts.map(async (transcript, index) => {
          // Extract key topics and entities
          return this.extractKeyTopics(transcript, `transcript-${index}`);
        }),
      );

      // 2. Compare across transcripts to find gaps and themes
      const analysis = await this.compareTranscripts(processedTranscripts);

      // 3. Generate comprehensive report
      const report = await this.generateReport(analysis, processedTranscripts);

      this.logger.info(
        `Completed knowledge gap analysis for session ${sessionId}`,
      );
      return report;
    } catch (error: any) {
      this.logger.error(`Error in knowledge gap analysis: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract key topics, entities, and information from a transcript
   * @param transcript The transcript text
   * @param transcriptId Identifier for the transcript
   * @returns Structured data with topics, entities, and information
   */
  private async extractKeyTopics(
    transcript: string,
    transcriptId: string,
  ): Promise<any> {
    this.logger.info(`Extracting key topics from ${transcriptId}`);

    try {
      // TODO Add to instructionTemplate
      // Create a system prompt for knowledge extraction
      const systemPrompt = `
        You are a Knowledge Extraction Expert. Your task is to analyze a meeting transcript 
        and extract key topics, entities, and structured information.
        
        Analyze the transcript and identify:
        1. Main topics discussed
        2. Important entities (people, projects, technologies)
        3. Key information organized by topic
        
        Format your response as a JSON object with the following structure:
        {
          "topics": ["Topic 1", "Topic 2", ...],
          "entities": [
            {"name": "Entity Name", "type": "person/project/technology", "mentions": 5},
            ...
          ],
          "information": {
            "Topic 1": ["Key point 1", "Key point 2", ...],
            "Topic 2": ["Key point 1", "Key point 2", ...],
            ...
          }
        }
      `;

      // Generate response using OpenAI connector
      const response = await this.openAIConnector.generateChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: transcript },
        ],
        {
          responseFormat: { type: 'json_object' },
        },
      );

      // Parse the response
      const parsedResponse = this.parseTopicsResponse(response, transcriptId);

      this.logger.info(
        `Successfully extracted ${parsedResponse.topics?.length || 0} topics from ${transcriptId}`,
      );
      return parsedResponse;
    } catch (error: any) {
      this.logger.error(
        `Error extracting topics from ${transcriptId}: ${error.message}`,
      );
      return {
        error: `Failed to extract topics: ${error.message}`,
        transcriptId,
        topics: [],
        entities: [],
        information: {},
      };
    }
  }

  /**
   * Compare processed transcripts to identify gaps, overlaps, and unique themes
   * @param processedTranscripts Array of processed transcript data
   * @returns Analysis of gaps, overlaps, and themes
   */
  private async compareTranscripts(processedTranscripts: any[]): Promise<any> {
    this.logger.info(`Comparing ${processedTranscripts.length} transcripts`);

    try {
      // TODO Add to instructionTemplate
      // Create a system prompt for knowledge comparison
      const systemPrompt = `
        You are a Knowledge Gap Analyst. Your task is to compare multiple transcript analyses
        to identify commonalities, divergences, and knowledge gaps.
        
        Compare the processed transcripts and identify:
        1. Common topics that appear across multiple transcripts
        2. Unique topics specific to individual transcripts
        3. Knowledge gaps or inconsistencies between transcripts
        4. Thematic patterns and divergences
        
        Format your response as a JSON object with the following structure:
        {
          "commonTopics": ["Topic 1", "Topic 2", ...],
          "uniqueTopics": {
            "transcript-0": ["Topic A", "Topic B", ...],
            "transcript-1": ["Topic C", "Topic D", ...],
            ...
          },
          "knowledgeGaps": [
            "Description of knowledge gap 1",
            "Description of knowledge gap 2",
            ...
          ],
          "thematicAnalysis": "Comprehensive analysis of thematic patterns and divergences"
        }
      `;

      // Generate response using OpenAI connector
      const response = await this.openAIConnector.generateChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(processedTranscripts) },
        ],
        {
          responseFormat: { type: 'json_object' },
        },
      );

      // Parse the response
      const parsedResponse = this.parseComparisonResponse(response);

      this.logger.info(
        `Comparison complete. Found ${parsedResponse.knowledgeGaps?.length || 0} knowledge gaps`,
      );
      return parsedResponse;
    } catch (error: any) {
      this.logger.error(`Error comparing transcripts: ${error.message}`);
      return {
        error: `Failed to compare transcripts: ${error.message}`,
        commonTopics: [],
        uniqueTopics: {},
        knowledgeGaps: [],
        thematicAnalysis: 'Error occurred during analysis',
      };
    }
  }

  /**
   * Generate comprehensive report with actionable insights
   * @param analysis Analysis data from transcript comparison
   * @param processedTranscripts Array of processed transcript data
   * @returns Comprehensive report with actionable insights
   */
  private async generateReport(
    analysis: any,
    processedTranscripts: any[],
  ): Promise<any> {
    this.logger.info('Generating comprehensive knowledge gap report');

    try {
      // Create a system prompt for report generation
      const systemPrompt = `
        You are a Knowledge Management Expert. Your task is to generate a comprehensive report
        based on an analysis of ${processedTranscripts.length} meeting transcripts.
        
        Generate a detailed report that includes:
        1. A summary of the overall analysis
        2. Key findings from the transcript comparison
        3. Detailed knowledge gaps identified with context
        4. Actionable recommendations to address these gaps
        
        Format your response as a JSON object with the following structure:
        {
          "summary": "Concise summary of the overall analysis",
          "keyFindings": [
            "Key finding 1",
            "Key finding 2",
            ...
          ],
          "knowledgeGaps": [
            {
              "description": "Description of gap 1",
              "context": "Related context",
              "impact": "Potential impact of this gap"
            },
            ...
          ],
          "recommendations": [
            {
              "title": "Recommendation 1",
              "description": "Detailed explanation",
              "implementation": "How to implement"
            },
            ...
          ]
        }
      `;

      // Generate response using OpenAI connector
      const response = await this.openAIConnector.generateChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(analysis) },
        ],
        {
          responseFormat: { type: 'json_object' },
        },
      );

      // Parse the response
      const parsedResponse = this.parseReportResponse(response);

      this.logger.info('Knowledge gap report generated successfully');
      return parsedResponse;
    } catch (error: any) {
      this.logger.error(`Error generating report: ${error.message}`);
      return {
        error: `Failed to generate report: ${error.message}`,
        summary: 'Error occurred during report generation',
        keyFindings: [],
        knowledgeGaps: [],
        recommendations: [],
      };
    }
  }

  /**
   * Parse the response from topic extraction
   * @param response LLM response string
   * @param transcriptId Identifier for the transcript
   * @returns Parsed structured data
   */
  private parseTopicsResponse(response: string, transcriptId: string): any {
    try {
      const parsedResponse = JSON.parse(response);
      return {
        ...parsedResponse,
        transcriptId,
      };
    } catch (error: any) {
      this.logger.error(
        `Error parsing topics response for ${transcriptId}: ${error.message}`,
      );
      return {
        error: 'Failed to parse response',
        transcriptId,
        topics: [],
        entities: [],
        information: {},
      };
    }
  }

  /**
   * Parse the response from transcript comparison
   * @param response LLM response string
   * @returns Parsed structured data
   */
  private parseComparisonResponse(response: string): any {
    try {
      return JSON.parse(response);
    } catch (error: any) {
      this.logger.error(`Error parsing comparison response: ${error.message}`);
      return {
        error: 'Failed to parse comparison response',
        commonTopics: [],
        uniqueTopics: {},
        knowledgeGaps: [],
        thematicAnalysis: 'Error occurred during analysis',
      };
    }
  }

  /**
   * Parse the response from report generation
   * @param response LLM response string
   * @returns Parsed structured data
   */
  private parseReportResponse(response: string): any {
    try {
      return JSON.parse(response);
    } catch (error: any) {
      this.logger.error(`Error parsing report response: ${error.message}`);
      return {
        error: 'Failed to parse report response',
        summary: 'Error occurred during report generation',
        keyFindings: [],
        knowledgeGaps: [],
        recommendations: [],
      };
    }
  }

  /**
   * Clean up resources used by the agent
   */
  public async terminate(): Promise<void> {
    this.logger.info('Cleaning up KnowledgeGapAgent resources');
    // No active timers or resources to clean up currently
    await super.terminate();
  }
}
