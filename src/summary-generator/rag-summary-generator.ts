import OpenAI from 'openai';
import { ContextType } from '../shared/user-context/user-context.service.ts';
import { RagPromptManager, RagRetrievalStrategy } from '../shared/services/rag-prompt-manager.service.ts';
import { splitTranscript } from '../shared/utils/split-transcript.ts';

/**
 * Generates a summary for a meeting transcript using RAG-enhanced context
 * 
 * This version enhances the basic summary generator by:
 * 1. Using previous related meeting summaries as context
 * 2. Incorporating project documentation and domain knowledge
 * 3. Including team-specific context and discussion history
 * 
 * @param transcript The meeting transcript to summarize
 * @param userId The user's ID for context retrieval
 * @param embeddings Vector embeddings of the transcript (pre-computed)
 * @param options Additional options for summary generation
 * @returns Generated meeting summary
 */
export async function generateRagSummary(
  transcript: string,
  userId: string,
  embeddings: number[],
  options: {
    projectId?: string;
    teamIds?: string[];
    conversationId?: string;
    previousMeetingIds?: string[];
    retrievalStrategy?: RagRetrievalStrategy;
  } = {}
): Promise<string> {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const chunks = splitTranscript(transcript, 2000, 3);
    const ragManager = new RagPromptManager();
    
    // Process each chunk with RAG-enhanced context
    const partialSummaries: string[] = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      // Calculate chunk-specific embeddings (simplified - in practice you'd use a proper embedding API)
      const chunkEmbedding = i === 0 
        ? embeddings  // Use the full transcript embedding for first chunk as approximation
        : embeddings.map(v => v * (1 - (i * 0.1))); // Crude approximation for demonstration
      
      // Build context retrieval options
      const contextOptions = {
        userId,
        queryText: chunk,
        queryEmbedding: chunkEmbedding,
        strategy: options.retrievalStrategy || RagRetrievalStrategy.SEMANTIC,
        maxItems: 3,
        minRelevanceScore: 0.7,
        conversationId: options.conversationId,
        documentIds: options.previousMeetingIds,
        contentTypes: [
          ContextType.DOCUMENT, 
          ContextType.CONVERSATION
        ],
        timeWindow: 30 * 24 * 60 * 60 * 1000, // Last 30 days
      };
      
      // Generate RAG-enhanced prompt with context
      const ragPrompt = await ragManager.createRagPrompt(
        'MEETING_CHUNK_SUMMARIZER',
        'MEETING_CHUNK_SUMMARY',
        chunk,
        contextOptions
      );
      
      // Make API call with the enhanced prompt
      const completion = await client.chat.completions.create({
        messages: ragPrompt.messages as OpenAI.Chat.ChatCompletionMessageParam[],
        model: 'gpt-4',
        max_tokens: 1000,
        temperature: 0.2,
      });
      
      const chunkSummary = completion.choices[0].message?.content?.trim();
      if (chunkSummary) {
        partialSummaries.push(chunkSummary);
        
        // Store this interaction for future context
        if (options.conversationId) {
          await ragManager.storeRagInteraction(
            userId,
            chunk,
            chunkEmbedding,
            chunkSummary,
            chunkEmbedding, // Simplified - should use proper embedding for response
            ragPrompt.retrievedContext,
            options.conversationId
          );
        }
      }
    }
    
    // Generate final summary using combined partial summaries with RAG context
    const combinedSummaries = partialSummaries.join('\n\n');
    
    // Use embedding of full transcript for final summary
    const finalContextOptions = {
      userId,
      queryText: 'Final meeting summary: ' + transcript.substring(0, 200) + '...',
      queryEmbedding: embeddings,
      strategy: RagRetrievalStrategy.HYBRID,
      maxItems: 5,
      contentTypes: [
        ContextType.DOCUMENT,
        ContextType.CONVERSATION
      ],
      documentIds: options.previousMeetingIds,
    };
    
    // Generate RAG-enhanced prompt for final summary
    const finalRagPrompt = await ragManager.createRagPrompt(
      'MEETING_CHUNK_SUMMARIZER',
      'FINAL_MEETING_SUMMARY',
      combinedSummaries,
      finalContextOptions
    );
    
    // Make API call for final summary
    const finalCompletion = await client.chat.completions.create({
      messages: finalRagPrompt.messages as OpenAI.Chat.ChatCompletionMessageParam[],
      model: 'gpt-4',
      max_tokens: 1500,
      temperature: 0.2,
    });
    
    const finalSummaryText = finalCompletion.choices[0].message?.content?.trim();
    if (!finalSummaryText) {
      throw new Error('Received empty final summary');
    }
    
    // Store the final summary interaction
    if (options.conversationId) {
      await ragManager.storeRagInteraction(
        userId,
        combinedSummaries,
        embeddings,
        finalSummaryText,
        embeddings, // Simplified
        finalRagPrompt.retrievedContext,
        options.conversationId
      );
    }
    
    // Parse the JSON response
    let finalSummary;
    try {
      finalSummary = JSON.parse(finalSummaryText);
    } catch (error) {
      console.error('Error parsing final summary JSON:', error);
      finalSummary = { summary: finalSummaryText };
    }
    
    return finalSummary;
  } catch (error) {
    console.error('Error in generateRagSummary:', error);
    throw error;
  }
} 