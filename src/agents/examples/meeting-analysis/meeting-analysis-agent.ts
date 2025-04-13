import { BaseAgent } from '../../base/base-agent.ts';
import { AgentCapability } from '../../interfaces/agent.interface.ts';
import { ContextAdapter } from '../../adapters/context-adapter.interface.ts';
import { MeetingContextService } from '../../../shared/user-context/services/meeting-context.service.ts';
import { EmbeddingService } from '../../../shared/embedding/embedding.service.ts';
import { Logger } from '../../../shared/logger/logger.interface.ts';
import { LanguageModelAdapter } from '../../adapters/language-model-adapter.interface.ts';
import {
  BaseMessage,
  HumanMessage,
  SystemMessage,
} from '@langchain/core/messages';
import { v4 as uuidv4 } from 'uuid';
import { AgentContextAdapter } from '../../adapters/agent-context.adapter.ts';

// Define agent capabilities
export enum MeetingAnalysisCapability {
  SUMMARIZE_MEETING = 'summarize-meeting',
  EXTRACT_ACTION_ITEMS = 'extract-action-items',
  EXTRACT_DECISIONS = 'extract-decisions',
  EXTRACT_QUESTIONS = 'extract-questions',
  SEMANTIC_SEARCH = 'semantic-search',
}

// Define request structure for the agent
export interface MeetingAnalysisRequest {
  userId: string;
  meetingId: string;
  meetingTranscript?: string;
  capability: MeetingAnalysisCapability;
  query?: string; // For semantic search
}

export class MeetingAnalysisAgent extends BaseAgent {
  private meetingContextService: MeetingContextService;
  private embeddingService: EmbeddingService;
  private modelAdapter: LanguageModelAdapter;

  constructor(
    modelAdapter: LanguageModelAdapter,
    contextAdapter: AgentContextAdapter | null,
    meetingContextService: MeetingContextService,
    embeddingService: EmbeddingService,
    logger?: Logger,
  ) {
    super(
      'meeting-analysis-agent',
      'AI agent for analyzing meeting transcripts and extracting key information',
      {
        logger: logger,
        contextAdapter: contextAdapter || undefined,
      },
    );

    this.modelAdapter = modelAdapter;
    this.meetingContextService = meetingContextService;
    this.embeddingService = embeddingService;

    // Register capabilities
    this.registerCapability({
      name: MeetingAnalysisCapability.SUMMARIZE_MEETING,
      description: 'Summarize meeting transcript and extract key points',
    });

    this.registerCapability({
      name: MeetingAnalysisCapability.EXTRACT_ACTION_ITEMS,
      description: 'Extract action items from meeting transcript',
    });

    this.registerCapability({
      name: MeetingAnalysisCapability.EXTRACT_DECISIONS,
      description: 'Extract decisions made during the meeting',
    });

    this.registerCapability({
      name: MeetingAnalysisCapability.EXTRACT_QUESTIONS,
      description: 'Extract questions raised during the meeting',
    });

    this.registerCapability({
      name: MeetingAnalysisCapability.SEMANTIC_SEARCH,
      description:
        'Search for semantically similar content in meeting transcripts',
    });
  }

  canHandle(capability: string): boolean {
    return Object.values(MeetingAnalysisCapability).includes(
      capability as MeetingAnalysisCapability,
    );
  }

  protected async executeInternal(request: any): Promise<any> {
    const typedRequest = request as MeetingAnalysisRequest;
    const { userId, meetingId, capability, meetingTranscript, query } =
      typedRequest;

    // For semantic search, we need transcript content from storage if not provided
    let transcript = meetingTranscript;
    if (!transcript) {
      const existingContent =
        await this.meetingContextService.getMeetingContent(userId, meetingId);
      transcript = existingContent?.content || '';

      if (
        !transcript &&
        capability !== MeetingAnalysisCapability.SEMANTIC_SEARCH
      ) {
        throw new Error('Meeting transcript is required for analysis');
      }
    }

    switch (capability) {
      case MeetingAnalysisCapability.SUMMARIZE_MEETING:
        return this.summarizeMeeting(userId, meetingId, transcript);

      case MeetingAnalysisCapability.EXTRACT_ACTION_ITEMS:
        return this.extractActionItems(userId, meetingId, transcript);

      case MeetingAnalysisCapability.EXTRACT_DECISIONS:
        return this.extractDecisions(userId, meetingId, transcript);

      case MeetingAnalysisCapability.EXTRACT_QUESTIONS:
        return this.extractQuestions(userId, meetingId, transcript);

      case MeetingAnalysisCapability.SEMANTIC_SEARCH:
        if (!query) {
          throw new Error('Query is required for semantic search');
        }
        return this.semanticSearch(userId, query);

      default:
        throw new Error(`Unsupported capability: ${capability}`);
    }
  }

  private async summarizeMeeting(
    userId: string,
    meetingId: string,
    transcript: string,
  ): Promise<any> {
    this.logger.info(`Summarizing meeting ${meetingId} for user ${userId}`);

    // Prepare the prompt for the LLM
    const messages = [
      new SystemMessage(
        'You are an AI assistant that summarizes meeting transcripts. Create a concise summary that captures the key points discussed in the meeting.',
      ),
      new HumanMessage(
        `Please summarize the following meeting transcript:\n\n${transcript}`,
      ),
    ];

    // Get the response from the LLM
    const response = await this.modelAdapter.generateResponse(messages);
    const summary = response.content;

    // Generate embedding for the summary
    const summaryEmbedding =
      await this.embeddingService.generateEmbedding(summary);

    // Store the meeting content
    await this.meetingContextService.storeMeetingContent(
      userId,
      meetingId,
      'Meeting Summary',
      transcript,
      summaryEmbedding,
      [], // No participant IDs
      Date.now(), // Current time as start
      Date.now(), // Current time as end
      { summaryText: summary },
    );

    return { summary };
  }

  private async extractActionItems(
    userId: string,
    meetingId: string,
    transcript: string,
  ): Promise<any> {
    this.logger.info(
      `Extracting action items from meeting ${meetingId} for user ${userId}`,
    );

    const messages = [
      new SystemMessage(
        'You are an AI assistant that extracts action items from meeting transcripts. Extract all action items, including who is responsible and any deadlines.',
      ),
      new HumanMessage(
        `Please extract all action items from the following meeting transcript:\n\n${transcript}`,
      ),
    ];

    const response = await this.modelAdapter.generateResponse(messages);

    // Process and structure the action items
    // In a real implementation, we'd parse the response more intelligently
    const actionItems = response.content
      .split('\n')
      .filter((line: string) => line.trim().length > 0)
      .map((line: string, index: number) => ({
        id: `ai-${meetingId}-${index}`,
        description: line,
        assignee: this.extractAssignee(line),
        deadline: this.extractDeadline(line),
        status: 'pending',
      }));

    // Store each action item
    for (const item of actionItems) {
      // Generate embedding for the action item
      const embedding = await this.embeddingService.generateEmbedding(
        item.description,
      );

      await this.meetingContextService.storeActionItem(
        userId,
        meetingId,
        item.id,
        item.description,
        item.assignee,
        item.deadline,
        embedding,
      );
    }

    return { actionItems };
  }

  private async extractDecisions(
    userId: string,
    meetingId: string,
    transcript: string,
  ): Promise<any> {
    this.logger.info(
      `Extracting decisions from meeting ${meetingId} for user ${userId}`,
    );

    const messages = [
      new SystemMessage(
        'You are an AI assistant that extracts key decisions from meeting transcripts.',
      ),
      new HumanMessage(
        `Please extract all decisions made during the following meeting transcript:\n\n${transcript}`,
      ),
    ];

    const response = await this.modelAdapter.generateResponse(messages);

    // Process and structure the decisions
    const decisions = response.content
      .split('\n')
      .filter((line: string) => line.trim().length > 0)
      .map((line: string, index: number) => ({
        id: `decision-${meetingId}-${index}`,
        description: line,
        context: this.extractContext(line, transcript),
      }));

    // Store each decision
    for (const decision of decisions) {
      // Generate embedding for the decision
      const embedding = await this.embeddingService.generateEmbedding(
        decision.description,
      );

      await this.meetingContextService.storeDecision(
        userId,
        meetingId,
        decision.id,
        decision.description,
        decision.context,
        embedding,
      );
    }

    return { decisions };
  }

  private async extractQuestions(
    userId: string,
    meetingId: string,
    transcript: string,
  ): Promise<any> {
    this.logger.info(
      `Extracting questions from meeting ${meetingId} for user ${userId}`,
    );

    const messages = [
      new SystemMessage(
        'You are an AI assistant that extracts questions from meeting transcripts.',
      ),
      new HumanMessage(
        `Please extract all questions raised during the following meeting transcript:\n\n${transcript}`,
      ),
    ];

    const response = await this.modelAdapter.generateResponse(messages);

    // Process and structure the questions
    const questions = response.content
      .split('\n')
      .filter((line: string) => line.trim().length > 0)
      .map((line: string, index: number) => ({
        id: `question-${meetingId}-${index}`,
        question: line,
        askedBy: this.extractQuestioner(line, transcript),
        answer: '',
        isAnswered: false,
      }));

    // Store each question
    for (const question of questions) {
      // Generate embedding for the question
      const embedding = await this.embeddingService.generateEmbedding(
        question.question,
      );

      await this.meetingContextService.storeQuestion(
        userId,
        meetingId,
        question.id,
        question.question,
        embedding,
        false, // Not answered yet
      );
    }

    return { questions };
  }

  private async semanticSearch(userId: string, query: string): Promise<any> {
    this.logger.info(
      `Performing semantic search for user ${userId} with query: ${query}`,
    );

    // Generate embedding for the query
    const queryEmbedding = await this.embeddingService.generateEmbedding(query);

    // Get recent meetings for the user
    const recentMeetings =
      await this.meetingContextService.getRecentMeetings(userId);

    const results = [];

    // For each meeting, generate embeddings and find similar content
    for (const meeting of recentMeetings) {
      if (!meeting.content) continue;

      // In a real implementation, we might store pre-computed embeddings
      // or use chunking for more precise results
      const meetingEmbedding = await this.embeddingService.generateEmbedding(
        meeting.content,
      );

      const similarity = this.embeddingService.calculateCosineSimilarity(
        queryEmbedding,
        meetingEmbedding,
      );

      if (similarity > 0.7) {
        // Threshold for relevance
        results.push({
          meetingId: meeting.meetingId,
          title: meeting.title || 'Untitled Meeting',
          date: meeting.date,
          similarity,
          snippet: this.extractRelevantSnippet(query, meeting.content),
        });
      }
    }

    // Sort by similarity (highest first)
    results.sort((a, b) => b.similarity - a.similarity);

    return { results: results.slice(0, 5) }; // Return top 5 results
  }

  // Helper methods
  private extractAssignee(actionItem: string): string {
    // Simple regex to extract names followed by "will" or "to"
    const match = actionItem.match(
      /([A-Z][a-z]+ [A-Z][a-z]+|[A-Z][a-z]+) (will|to|should)/,
    );
    return match ? match[1] : 'Unassigned';
  }

  private extractDeadline(actionItem: string): number | null {
    // Simple regex to extract dates
    const match = actionItem.match(
      /(by|before|until) ([A-Z][a-z]+ \d{1,2}(st|nd|rd|th)?|next [A-Z][a-z]+|\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    );
    if (!match) return null;

    // Try to convert the date string to a timestamp
    try {
      const dateStr = match[2];
      // Simple conversion - in a real implementation, we would use a more robust date parsing library
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        // If parsing fails, use a relative date (e.g., "next Friday" -> 7 days from now)
        if (dateStr.toLowerCase().includes('next')) {
          return Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
        }
        return null;
      }
      return date.getTime();
    } catch (e) {
      return null;
    }
  }

  private extractContext(decision: string, transcript: string): string {
    // Find the context around the decision in the transcript
    // This is a simplified implementation
    const index = transcript.indexOf(decision.substring(0, 20));
    if (index === -1) return '';

    const startIndex = Math.max(0, index - 100);
    const endIndex = Math.min(transcript.length, index + decision.length + 100);

    return transcript.substring(startIndex, endIndex);
  }

  private extractQuestioner(question: string, transcript: string): string {
    // Simple implementation to extract who asked the question
    // In real implementation, this would be more sophisticated
    return 'Unknown';
  }

  private extractRelevantSnippet(query: string, text: string): string {
    // Simple implementation to extract relevant snippet
    // In real implementation, this would be more sophisticated
    const words = query.split(' ');
    let bestIndex = 0;
    let maxMatches = 0;

    const textWords = text.split(' ');

    for (let i = 0; i < textWords.length - 20; i++) {
      const segment = textWords
        .slice(i, i + 20)
        .join(' ')
        .toLowerCase();
      let matches = 0;

      for (const word of words) {
        if (segment.includes(word.toLowerCase())) {
          matches++;
        }
      }

      if (matches > maxMatches) {
        maxMatches = matches;
        bestIndex = i;
      }
    }

    return textWords.slice(bestIndex, bestIndex + 30).join(' ') + '...';
  }
}
