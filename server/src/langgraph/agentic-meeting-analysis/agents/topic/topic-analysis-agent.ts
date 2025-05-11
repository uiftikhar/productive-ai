/**
 * Topic Analysis Agent for the Agentic Meeting Analysis System
 */
import { v4 as uuidv4 } from 'uuid';
import {
  ISpecialistAnalysisAgent,
  AgentExpertise,
  AgentOutput,
  AnalysisGoalType,
  AnalysisTask,
  AnalysisTaskStatus,
  ConfidenceLevel,
  MessageType,
  AgentRole,
} from '../../interfaces/agent.interface';
import { MeetingTranscript } from '../../interfaces/state.interface';
import { BaseMeetingAnalysisAgent, BaseMeetingAnalysisAgentConfig } from '../base-meeting-analysis-agent';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ChatOpenAI } from '@langchain/openai';
import { OpenAIConnector } from '../../../../connectors/openai-connector';
import { AgentConfigService } from '../../../../shared/config/agent-config.service';

/**
 * Configuration options for TopicAnalysisAgent
 */
export interface TopicAnalysisAgentConfig extends BaseMeetingAnalysisAgentConfig {
  enableKeywordExtraction?: boolean;
  enableTopicSegmentation?: boolean;
  enableRelevanceScoring?: boolean;
  enableHierarchicalGrouping?: boolean;
  minConfidence?: number;
  managerId?: string; // Added to match with SpecialistWorkerAgent
}

/**
 * Topic item structure
 */
export interface TopicItem {
  id: string;
  name: string;
  description: string;
  relevance: number;
  keywords?: string[];
}

/**
 * Topic keyword structure
 */
export interface TopicKeyword {
  topicId: string;
  keywords: string[];
}

/**
 * Topic segment structure
 */
export interface TopicSegment {
  topicId: string;
  segmentIds: string[];
  startIndex: number;
  endIndex: number;
}

/**
 * Topic Analysis Agent implementation
 * Specializes in extracting and analyzing topics from meeting transcripts
 */
export class TopicAnalysisAgent
  extends BaseMeetingAnalysisAgent
  implements ISpecialistAnalysisAgent
{
  public readonly role: AgentRole = AgentRole.WORKER;
  
  // Topic analysis specific capabilities
  private enableKeywordExtraction: boolean;
  private enableTopicSegmentation: boolean;
  private enableRelevanceScoring: boolean;
  private enableHierarchicalGrouping: boolean;
  private minConfidence: number;
  public managerId?: string; // Required for ISpecialistAnalysisAgent

  /**
   * Create a new topic analysis agent
   */
  constructor(config: TopicAnalysisAgentConfig) {
    // Initialize the base agent
    super({
      id: config.id || `topic-agent-${uuidv4()}`,
      name: config.name || 'Topic Analysis Agent',
      expertise: [AgentExpertise.TOPIC_ANALYSIS],
      capabilities: [AnalysisGoalType.EXTRACT_TOPICS],
      logger: config.logger,
      llm: config.llm,
      systemPrompt: config.systemPrompt || getTopicAnalysisSystemPrompt(),
      openAiConnector: config.openAiConnector,
      maxRetries: config.maxRetries,
      useMockMode: config.useMockMode
    });

    // Initialize topic analysis specific settings
    this.enableKeywordExtraction = config.enableKeywordExtraction ?? true;
    this.enableTopicSegmentation = config.enableTopicSegmentation ?? true;
    this.enableRelevanceScoring = config.enableRelevanceScoring ?? true;
    this.enableHierarchicalGrouping = config.enableHierarchicalGrouping ?? false;
    this.minConfidence = config.minConfidence || 0.6;
    this.managerId = config.managerId;

    this.logger.info(
      `Initialized TopicAnalysisAgent with ID: ${this.id}`,
      {
        keywordExtraction: this.enableKeywordExtraction,
        topicSegmentation: this.enableTopicSegmentation,
        relevanceScoring: this.enableRelevanceScoring,
        hierarchicalGrouping: this.enableHierarchicalGrouping
      }
    );
  }

  /**
   * Process a topic analysis task
   */
  async processTask(task: AnalysisTask): Promise<AgentOutput> {
    this.logger.info(`Processing topic analysis task: ${task.id}`);

    if (task.type !== AnalysisGoalType.EXTRACT_TOPICS) {
      throw new Error(
        `Topic Analysis Agent cannot process task type: ${task.type}`
      );
    }

    try {
      // Get transcript data
      const transcript = task.input?.transcript as MeetingTranscript;
      const metadata = task.input?.metadata || {};

      if (!transcript) {
        throw new Error('Meeting transcript not found in task input');
      }

      // Extract topics from transcript
      const topics = await this.extractTopics(transcript, metadata);

      // Extract keywords for each topic
      const topicKeywords: TopicKeyword[] = [];
      if (this.enableKeywordExtraction && topics.length > 0) {
        const extractedKeywords = await this.extractKeywordsForTopics(transcript, topics);
        topicKeywords.push(...extractedKeywords);
      }

      // Segment the transcript by topic
      const topicSegments: TopicSegment[] = [];
      if (this.enableTopicSegmentation && topics.length > 0) {
        const extractedSegments = await this.segmentTranscriptByTopic(transcript, topics);
        topicSegments.push(...extractedSegments);
      }

      // Assemble the complete topic analysis
      const topicAnalysis = {
        topics: topics.map((topic, index) => ({
          ...topic,
          keywords: topicKeywords[index]?.keywords || [],
          segments: topicSegments.filter(segment => segment.topicId === topic.id)
        })),
        metadata: {
          analysisTime: Date.now(),
          transcriptLength: transcript.segments?.length || 0,
          topicCount: topics.length
        }
      };

      // Assess confidence in the analysis
      const confidence = await this.assessConfidence(topicAnalysis);

      // Explain reasoning
      const reasoning = await this.explainReasoning(topicAnalysis);

      // Create output
      const output: AgentOutput = {
        content: topicAnalysis,
        confidence,
        reasoning,
        metadata: {
          taskId: task.id,
          taskType: task.type,
          agentId: this.id,
          agentName: this.name,
          expertise: this.expertise
        },
        timestamp: Date.now()
      };

      this.logger.info(`Topic analysis completed with ${topics.length} topics identified`);

      return output;
    } catch (error) {
      this.logger.error(
        `Error processing topic analysis: ${error instanceof Error ? error.message : String(error)}`
      );
      throw error;
    }
  }

  /**
   * Extract topics from a meeting transcript
   */
  private async extractTopics(
    transcript: MeetingTranscript,
    metadata: any
  ): Promise<TopicItem[]> {
    this.logger.info('Extracting topics from transcript');

    // Create prompt for topic extraction
    const instructionContent = `
      Extract the main topics discussed in this meeting transcript.
      
      For each topic:
      1. Provide a concise name (3-5 words max)
      2. Write a brief description (1-2 sentences)
      3. Assign a relevance score (0.0-1.0) based on how central the topic was to the meeting
      
      MEETING TITLE: ${metadata?.title || 'Unknown'}
      PARTICIPANTS: ${metadata?.participants?.map((p: any) => p.name || p.id).join(', ') || 'Unknown'}
      
      TRANSCRIPT:
      ${transcript.segments?.map(s => 
        `[${s.speakerName || s.speakerId}]: ${s.content}`
      ).join('\n') || transcript.rawText || ''}
      
      Respond with a JSON array of topic objects with id, name, description, and relevance properties.
    `;

    // Call LLM for topic extraction
    const response = await this.callLLM(
      'Extract meeting topics',
      instructionContent
    );

    try {
      // Parse response
      const parsedResponse = JSON.parse(response);
      const topics = Array.isArray(parsedResponse) ? parsedResponse : parsedResponse.topics || [];
      
      // Ensure each topic has an ID
      return topics.map((topic: any) => ({
        ...topic,
        id: topic.id || `topic-${uuidv4().slice(0, 8)}`
      }));
    } catch (error) {
      this.logger.error(`Error parsing topic extraction response: ${error instanceof Error ? error.message : String(error)}`);
      
      // Return empty array on error
      return [];
    }
  }

  /**
   * Extract keywords for each identified topic
   */
  private async extractKeywordsForTopics(
    transcript: MeetingTranscript,
    topics: TopicItem[]
  ): Promise<TopicKeyword[]> {
    if (topics.length === 0) {
      return [];
    }

    this.logger.info(`Extracting keywords for ${topics.length} topics`);

    // Create prompt for keyword extraction
    const instructionContent = `
      Extract key terms and keywords associated with each of these topics discussed in the meeting.
      
      TOPICS:
      ${topics.map(t => `- ${t.name}: ${t.description}`).join('\n')}
      
      TRANSCRIPT:
      ${transcript.segments?.map(s => 
        `[${s.speakerName || s.speakerId}]: ${s.content}`
      ).join('\n') || transcript.rawText || ''}
      
      For each topic, provide 3-7 keywords or phrases that best represent the topic.
      Respond with a JSON array where each object has topicId and keywords properties.
    `;

    // Call LLM for keyword extraction
    const response = await this.callLLM(
      'Extract keywords for topics',
      instructionContent
    );

    try {
      // Parse response
      const parsedResponse = JSON.parse(response);
      return Array.isArray(parsedResponse) ? parsedResponse : parsedResponse.topicKeywords || [];
    } catch (error) {
      this.logger.error(`Error parsing keyword extraction response: ${error instanceof Error ? error.message : String(error)}`);
      
      // Generate basic response on error
      return topics.map(topic => ({
        topicId: topic.id,
        keywords: []
      }));
    }
  }

  /**
   * Segment the transcript by identified topics
   */
  private async segmentTranscriptByTopic(
    transcript: MeetingTranscript,
    topics: TopicItem[]
  ): Promise<TopicSegment[]> {
    if (!transcript.segments || transcript.segments.length === 0 || topics.length === 0) {
      return [];
    }

    this.logger.info('Segmenting transcript by topic');

    // Create prompt for transcript segmentation
    const instructionContent = `
      Identify which parts of the transcript correspond to each topic.
      
      TOPICS:
      ${topics.map(t => `- Topic ${t.id}: ${t.name} - ${t.description}`).join('\n')}
      
      TRANSCRIPT SEGMENTS:
      ${transcript.segments.map((s, i) => 
        `[${i}] [${s.speakerName || s.speakerId}]: ${s.content}`
      ).join('\n')}
      
      For each topic, identify the segment indices where the topic is being discussed.
      Segments can belong to multiple topics.
      
      Respond with a JSON array where each object has topicId, segmentIds (array of indices), startIndex, and endIndex properties.
    `;

    // Call LLM for transcript segmentation
    const response = await this.callLLM(
      'Segment transcript by topic',
      instructionContent
    );

    try {
      // Parse response
      const parsedResponse = JSON.parse(response);
      return Array.isArray(parsedResponse) ? parsedResponse : parsedResponse.segments || [];
    } catch (error) {
      this.logger.error(`Error parsing transcript segmentation response: ${error instanceof Error ? error.message : String(error)}`);
      
      // Return empty array on error
      return [];
    }
  }

  /**
   * Analyze a specific segment of the transcript (required by ISpecialistAnalysisAgent)
   */
  async analyzeTranscriptSegment(segment: any, context: any): Promise<any> {
    // Basic implementation to satisfy interface
    const instructionContent = `
      Analyze this transcript segment to identify any topics discussed:
      ${segment.content}
    `;
    
    const response = await this.callLLM(
      'Analyze transcript segment',
      instructionContent
    );
    
    try {
      return JSON.parse(response);
    } catch (error) {
      return { topics: [], analysis: response };
    }
  }

  /**
   * Merge multiple analysis results (required by ISpecialistAnalysisAgent)
   */
  async mergeAnalyses(analyses: any[]): Promise<any> {
    // Basic implementation to satisfy interface
    const topics = analyses.flatMap(a => a.topics || []);
    
    // Deduplicate topics by name
    const uniqueTopics = Array.from(
      new Map(topics.map(topic => [topic.name, topic])).values()
    );
    
    return {
      topics: uniqueTopics,
      count: uniqueTopics.length
    };
  }

  /**
   * Prioritize information based on relevance (required by ISpecialistAnalysisAgent)
   */
  async prioritizeInformation(allInfo: any): Promise<any> {
    // Basic implementation to satisfy interface
    if (Array.isArray(allInfo.topics)) {
      // Sort topics by relevance score
      const prioritizedTopics = [...allInfo.topics].sort((a, b) => 
        (b.relevance || 0) - (a.relevance || 0)
      );
      
      return {
        ...allInfo,
        topics: prioritizedTopics,
        prioritizedTopics: prioritizedTopics.slice(0, 3) // Top 3 topics
      };
    }
    
    return allInfo;
  }
}

/**
 * Get the default system prompt for topic analysis
 */
function getTopicAnalysisSystemPrompt(): string {
  return `You are a Topic Analysis Agent, specialized in extracting and analyzing discussion topics from meeting transcripts.

Your responsibilities:
- Identify the main topics discussed in meetings
- Extract relevant keywords for each topic
- Determine the relevance and importance of each topic
- Segment the transcript by topic
- Identify relationships between topics

Always respond in clear, structured JSON format as requested.
Be precise in your analysis and focus on substantive topics rather than casual conversation.
Distinguish between primary topics (central to the meeting) and secondary topics (mentioned briefly).`;
} 