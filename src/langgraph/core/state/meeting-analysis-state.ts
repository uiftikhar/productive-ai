import { BaseAgentState, createBaseAgentState } from './base-agent-state';

/**
 * Meeting analysis specific state additions
 */
export interface MeetingAnalysisState extends BaseAgentState {
  // Meeting details
  meetingId: string;
  meetingTitle?: string;
  meetingStartTime?: number;
  meetingEndTime?: number;
  participants?: Array<{
    id: string;
    name?: string;
    email?: string;
    role?: string;
  }>;
  previousMeetingIds?: string[];

  // Transcript data
  transcript?: string;
  transcriptSegments?: Array<{
    speakerId: string;
    text: string;
    startTime?: number;
    endTime?: number;
  }>;
  transcriptEmbeddings?: number[];

  // Processing state
  chunks?: string[];
  currentChunkIndex?: number;
  partialAnalyses?: string[];

  // Analysis results
  analysisResult?: {
    summary: string;
    topics?: Array<{
      id: string;
      name: string;
      summary?: string;
    }>;
    actionItems?: Array<{
      id: string;
      text: string;
      assignee: string;
      priority?: 'low' | 'medium' | 'high';
      dueDate?: number;
    }>;
    decisions?: Array<{
      id: string;
      text: string;
      summary?: string;
    }>;
    keyInsights?: string[];
    nextSteps?: string;
  };

  // Extraction results
  extractedActionItems?: Array<{
    id: string;
    text: string;
    assignee: string;
    priority?: 'low' | 'medium' | 'high';
    dueDate?: number;
  }>;
  extractedDecisions?: Array<{
    id: string;
    text: string;
    summary?: string;
  }>;
  extractedQuestions?: Array<{
    id: string;
    text: string;
    isAnswered: boolean;
    answerContextId?: string;
  }>;
  extractedTopics?: Array<{
    id: string;
    name: string;
    summary?: string;
  }>;
}

/**
 * Create a new meeting analysis state
 */
export function createMeetingAnalysisState(
  overrides: Partial<MeetingAnalysisState> = {},
): MeetingAnalysisState {
  // First create a base state
  const baseState = createBaseAgentState({
    agentId: overrides.agentId || 'meeting-analysis-agent',
    ...overrides,
  });

  // Add the meeting-specific defaults
  const meetingState: MeetingAnalysisState = {
    ...baseState,
    meetingId: overrides.meetingId || '',
    meetingTitle: overrides.meetingTitle,
    meetingStartTime: overrides.meetingStartTime,
    meetingEndTime: overrides.meetingEndTime,
    participants: overrides.participants || [],
    previousMeetingIds: overrides.previousMeetingIds || [],
    transcript: overrides.transcript,
    transcriptSegments: overrides.transcriptSegments || [],
    chunks: overrides.chunks,
    currentChunkIndex: overrides.currentChunkIndex,
    partialAnalyses: overrides.partialAnalyses || [],
    analysisResult: overrides.analysisResult,
    extractedActionItems: overrides.extractedActionItems || [],
    extractedDecisions: overrides.extractedDecisions || [],
    extractedQuestions: overrides.extractedQuestions || [],
    extractedTopics: overrides.extractedTopics || [],
  };

  return meetingState;
}

/**
 * Add a partial analysis to the state
 */
export function addPartialAnalysis(
  state: MeetingAnalysisState,
  analysisText: string,
  chunkIndex?: number,
): MeetingAnalysisState {
  const updatedAnalyses = [...(state.partialAnalyses || []), analysisText];

  return {
    ...state,
    partialAnalyses: updatedAnalyses,
    currentChunkIndex:
      chunkIndex !== undefined
        ? chunkIndex
        : state.currentChunkIndex !== undefined
          ? state.currentChunkIndex + 1
          : 0,
    metadata: {
      ...state.metadata,
      lastChunkProcessed:
        chunkIndex !== undefined ? chunkIndex : state.currentChunkIndex,
      partialAnalysisCount: updatedAnalyses.length,
      lastPartialAnalysisTimestamp: Date.now(),
    },
  };
}

/**
 * Set the analysis result
 */
export function setAnalysisResult(
  state: MeetingAnalysisState,
  result: MeetingAnalysisState['analysisResult'],
): MeetingAnalysisState {
  return {
    ...state,
    analysisResult: result,
    metadata: {
      ...state.metadata,
      analysisCompletedTimestamp: Date.now(),
    },
  };
}

/**
 * Add extracted entities to state
 */
export function addExtractedEntities(
  state: MeetingAnalysisState,
  entities: {
    actionItems?: MeetingAnalysisState['extractedActionItems'];
    decisions?: MeetingAnalysisState['extractedDecisions'];
    questions?: MeetingAnalysisState['extractedQuestions'];
    topics?: MeetingAnalysisState['extractedTopics'];
  },
): MeetingAnalysisState {
  return {
    ...state,
    extractedActionItems: entities.actionItems
      ? [...(state.extractedActionItems || []), ...entities.actionItems]
      : state.extractedActionItems,
    extractedDecisions: entities.decisions
      ? [...(state.extractedDecisions || []), ...entities.decisions]
      : state.extractedDecisions,
    extractedQuestions: entities.questions
      ? [...(state.extractedQuestions || []), ...entities.questions]
      : state.extractedQuestions,
    extractedTopics: entities.topics
      ? [...(state.extractedTopics || []), ...entities.topics]
      : state.extractedTopics,
    metadata: {
      ...state.metadata,
      lastEntityExtractionTimestamp: Date.now(),
    },
  };
}
