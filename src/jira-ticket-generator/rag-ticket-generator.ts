import OpenAI from 'openai';
import { ContextType } from '../shared/user-context/user-context.service.ts';
import {
  RagPromptManager,
  RagRetrievalStrategy,
} from '../shared/services/rag-prompt-manager.service.ts';
import { splitTranscript } from '../shared/utils/split-transcript.ts';
import {
  isValidJSON,
  cleanJsonArray,
  Ticket,
} from './jira-ticket-generator.ts';

/**
 * Generate Jira tickets using RAG-enhanced context
 *
 * This version enhances the basic ticket generator by:
 * 1. Using relevant past tickets as context
 * 2. Including domain-specific documentation
 * 3. Considering user preferences and project context
 *
 * @param transcript The meeting transcript to generate tickets from
 * @param userId The user's ID for context retrieval
 * @param embeddings Vector embeddings of the transcript (pre-computed)
 * @param options Additional options for ticket generation
 * @returns Array of generated Jira tickets
 */
export async function generateRagTickets(
  transcript: string,
  userId: string,
  embeddings: number[],
  options: {
    projectId?: string;
    teamIds?: string[];
    conversationId?: string;
    previousTicketIds?: string[];
    retrievalStrategy?: RagRetrievalStrategy;
  } = {},
): Promise<Ticket[]> {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const chunks = splitTranscript(transcript, 1600, 4);
    const ragManager = new RagPromptManager();

    // Process each chunk with RAG-enhanced context
    const partialTickets: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];

      // Calculate chunk-specific embeddings (simplified - in practice you'd use a proper embedding API)
      const chunkEmbedding =
        i === 0
          ? embeddings // Use the full transcript embedding for first chunk as approximation
          : embeddings.map((v) => v * (1 - i * 0.1)); // Crude approximation for demonstration

      // Build context retrieval options
      const contextOptions = {
        userId,
        queryText: chunk,
        queryEmbedding: chunkEmbedding,
        strategy: options.retrievalStrategy || RagRetrievalStrategy.HYBRID,
        maxItems: 5,
        minRelevanceScore: 0.7,
        conversationId: options.conversationId,
        documentIds: options.previousTicketIds,
        contentTypes: [ContextType.DOCUMENT, ContextType.CONVERSATION],
        timeWindow: 30 * 24 * 60 * 60 * 1000, // Last 30 days
      };

      // Generate RAG-enhanced prompt with context
      const ragPrompt = await ragManager.createRagPrompt(
        'AGILE_COACH',
        'TICKET_GENERATION',
        chunk,
        contextOptions,
      );

      // Make API call with the enhanced prompt
      const completion = await client.chat.completions.create({
        messages:
          ragPrompt.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        model: 'gpt-4',
        max_tokens: 1500,
        temperature: 0.2,
      });

      const chunkResult = completion.choices[0].message?.content?.trim();
      if (chunkResult) {
        partialTickets.push(chunkResult);

        // Store this interaction for future context
        if (options.conversationId) {
          await ragManager.storeRagInteraction(
            userId,
            chunk,
            chunkEmbedding,
            chunkResult,
            chunkEmbedding, // Simplified - should use proper embedding for response
            ragPrompt.retrievedContext,
            options.conversationId,
          );
        }
      }
    }

    // Clean and combine the ticket results
    const cleanedTickets: Ticket[] = [];
    partialTickets.forEach((partialTicket) => {
      const cleanedPartialTickets: Ticket[] =
        cleanJsonArray<Ticket>(partialTicket);
      cleanedTickets.push(...cleanedPartialTickets);
    });

    return cleanedTickets;
  } catch (error) {
    console.error('Error in generateRagTickets:', error);
    throw error;
  }
}
