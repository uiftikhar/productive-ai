import { Module, Provider } from '@nestjs/common';
import {
  RagMeetingAnalysisAgent,
  RAG_MEETING_ANALYSIS_CONFIG,
} from './agents/enhanced/rag-meeting-agent';
import {
  RagTopicExtractionAgent,
  RAG_TOPIC_EXTRACTION_CONFIG,
} from './agents/enhanced/rag-topic-extraction-agent';
import { AgenticMeetingAnalysisService } from './agentic-meeting-analysis.service';
import { LlmModule } from '../llm/llm.module';
import { StateModule } from '../state/state.module';
import { RagModule } from '../../rag/rag.module';
import { AgentExpertise } from './interfaces/agent.interface';

/**
 * Module for enhanced agentic meeting analysis components
 * using RAG capabilities for better context-awareness
 */
@Module({
  imports: [LlmModule, StateModule, RagModule],
  providers: [
    // Configuration factory provider for RagMeetingAnalysisAgent
    {
      provide: RAG_MEETING_ANALYSIS_CONFIG,
      useFactory: () => ({
        name: 'Meeting Analysis Agent',
        systemPrompt:
          'You are an AI assistant specialized in analyzing meeting transcripts.',
        expertise: [AgentExpertise.TOPIC_ANALYSIS],
        ragOptions: {
          includeRetrievedContext: true,
          retrievalOptions: {
            indexName: 'meeting-analysis',
            namespace: 'transcripts',
            topK: 5,
            minScore: 0.7,
          },
        },
      }),
    },
    // Configuration factory provider for RagTopicExtractionAgent
    {
      provide: RAG_TOPIC_EXTRACTION_CONFIG,
      useFactory: () => ({
        name: 'Topic Extraction Agent',
        systemPrompt: `You are an AI assistant specialized in extracting topics from meeting transcripts.
      
Your task is to identify the main topics discussed in the meeting and provide detailed analysis.

For each topic:
1. Provide a clear name
2. Add a brief description
3. Include relevant keywords
4. Note subtopics if applicable
5. Assign a relevance score from 1-10

Focus on identifying the core themes, not just mentioning every detail. 
Look for patterns in the conversation that indicate important discussion points.`,
        expertise: [AgentExpertise.TOPIC_ANALYSIS],
        ragOptions: {
          includeRetrievedContext: true,
          retrievalOptions: {
            indexName: 'meeting-analysis',
            namespace: 'topics',
            topK: 5,
            minScore: 0.7,
          },
        },
        specializedQueries: {
          [AgentExpertise.TOPIC_ANALYSIS]:
            'What are the main topics discussed in this meeting transcript?',
        },
      }),
    },
    // Provide the agents and service
    RagMeetingAnalysisAgent,
    RagTopicExtractionAgent,
    AgenticMeetingAnalysisService,
  ],
  exports: [
    RagMeetingAnalysisAgent,
    RagTopicExtractionAgent,
    AgenticMeetingAnalysisService,
  ],
})
export class AgenticMeetingAnalysisModule {}
