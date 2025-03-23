import type { Ticket } from '../jira-ticket-generator/jira-ticket-generator.ts';
import { computeEmbedding } from './compute-embedding.ts';
import { initMemory } from './mem0-client.ts';

/**
 * Stores a ticket in the user's memory context
 */
export async function storeUserTicket(
  userId: string,
  transcript: string,
  generatedTicket: Ticket,
  improvedTicket?: Ticket,
  feedbackType?: 'approved' | 'improved' | 'rejected',
): Promise<void> {
  try {
    const userMemory = await initMemory(`user-tickets-${userId}`);

    // Compute embedding for the transcript
    const embedding = await computeEmbedding(transcript);

    // Prepare the data to store
    const ticketData = {
      originalTranscript: transcript,
      generatedTicket,
      improvedTicket: improvedTicket || null,
      feedbackType: feedbackType || 'approved',
      timestamp: new Date().toISOString(),
    };

    // Store in mem0 using the memory operations
    await userMemory.add(JSON.stringify(ticketData), {
      metadata: {
        ticketType: generatedTicket.ticketType,
        feedbackType: feedbackType || 'approved',
        hasImprovement: !!improvedTicket,
        timestamp: new Date().toISOString(),
        embedding,
      },
    });

    console.log(`Stored ticket in user ${userId}'s memory`);
  } catch (error) {
    console.error('Error storing user ticket:', error);
    throw error;
  }
}

/**
 * Retrieves relevant ticket examples from user's memory based on a transcript
 */
export async function getUserTicketExamples(
  userId: string,
  transcript: string,
  limit: number = 3,
): Promise<string> {
  try {
    const userMemory = await initMemory(`user-tickets-${userId}`);

    // Compute embedding for search
    const queryEmbedding = await computeEmbedding(transcript);

    // Search mem0 for similar ticket examples using the memory operations
    const results = await userMemory.search(transcript, {
      top_k: limit,
      embedding: queryEmbedding,
    });

    if (!results || results.length === 0) {
      return '';
    }

    // Format the examples
    let formattedExamples = '# Examples of previously created tickets:\n\n';

    results.forEach((result: any, index: number) => {
      try {
        const ticketData = JSON.parse(result.text);

        // If this ticket has an improved version, use that as the example
        const ticketExample =
          ticketData.improvedTicket || ticketData.generatedTicket;

        formattedExamples += `## Example ${index + 1}:\n`;
        formattedExamples += `Ticket Type: ${ticketExample.ticketType}\n`;
        formattedExamples += `Summary: ${ticketExample.summary}\n`;
        formattedExamples += `Description: ${ticketExample.description}\n`;
        formattedExamples += `Acceptance Criteria: ${
          Array.isArray(ticketExample.acceptanceCriteria)
            ? ticketExample.acceptanceCriteria.join('\n- ')
            : ticketExample.acceptanceCriteria
        }\n\n`;
      } catch (e) {
        console.error('Error parsing result:', e);
      }
    });

    return formattedExamples;
  } catch (error) {
    console.error('Error retrieving user ticket examples:', error);
    return '';
  }
}

/**
 * Stores user preferences for ticket generation
 */
export async function storeUserPreferences(
  userId: string,
  preferences: {
    ticketStyle?: string;
    detailLevel?: string;
    preferredLabels?: string[];
    otherPreferences?: Record<string, any>;
  },
): Promise<void> {
  try {
    const userPrefsMemory = await initMemory(`user-preferences-${userId}`);

    await userPrefsMemory.add(
      JSON.stringify({
        type: 'ticket-preferences',
        preferences,
        timestamp: new Date().toISOString(),
      }),
      {
        metadata: {
          type: 'ticket-preferences',
          timestamp: new Date().toISOString(),
        },
      },
    );

    console.log(`Stored preferences for user ${userId}`);
  } catch (error) {
    console.error('Error storing user preferences:', error);
    throw error;
  }
}

/**
 * Retrieves user preferences for ticket generation
 */
export async function getUserPreferences(userId: string): Promise<any> {
  try {
    const userPrefsMemory = await initMemory(`user-preferences-${userId}`);

    const results = await userPrefsMemory.search('ticket-preferences', {
      top_k: 1,
    });

    if (!results || results.length === 0) {
      return null;
    }

    try {
      const prefData = JSON.parse(results[0].text);
      return prefData.preferences;
    } catch (e) {
      console.error('Error parsing preferences:', e);
      return null;
    }
  } catch (error) {
    console.error('Error retrieving user preferences:', error);
    return null;
  }
}
