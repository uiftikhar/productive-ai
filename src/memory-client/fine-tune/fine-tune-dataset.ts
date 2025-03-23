import type { Ticket } from '../../jira-ticket-generator/jira-ticket-generator.ts';
import { initMemory, mem0Client } from '../mem0-client.ts';

interface TicketFeedbackEntry {
  originalTranscript: string;
  generatedTicket: Ticket;
  improvedTicket: Ticket | null;
  feedbackType: 'approved' | 'improved' | 'rejected';
  timestamp: string;
}

/**
 * Retrieves all ticket feedback for a given user or organization
 * @param userId - Optional user ID to filter feedback
 * @param organizationId - Optional organization ID to filter feedback
 * @returns Array of feedback entries
 */
export async function retrieveTicketFeedback(
  userId?: string,
  organizationId?: string,
): Promise<TicketFeedbackEntry[]> {
  const feedbackEntries: TicketFeedbackEntry[] = [];

  try {
    // If user ID is provided, get user-specific feedback
    if (userId) {
      // Initialize memory to ensure it exists
      await initMemory(`user-tickets-${userId}`);

      // Query mem0 for this user's ticket feedback using client
      const results = await mem0Client.search('', {
        top_k: 100, // Retrieve up to 100 entries
        user_id: userId,
      });

      if (results && Array.isArray(results)) {
        // Parse each entry
        for (const entry of results) {
          try {
            // Add type assertion to access text property
            const ticketData = JSON.parse((entry as any).text);
            feedbackEntries.push(ticketData as TicketFeedbackEntry);
          } catch (error) {
            console.error('Error parsing feedback entry:', error);
          }
        }
      }
    }

    // If organization ID is provided, get organization-wide feedback
    // This could be implemented based on how you structure organization data

    return feedbackEntries;
  } catch (error) {
    console.error('Error retrieving ticket feedback:', error);
    return [];
  }
}

/**
 * Builds a JSONL dataset for fine-tuning from ticket feedback
 * @param userId - Optional user ID to build user-specific dataset
 * @param organizationId - Optional organization ID to build org-wide dataset
 * @returns JSONL string for fine-tuning
 */
export async function buildFineTuneDataset(
  userId?: string,
  organizationId?: string,
): Promise<string> {
  // Get feedback entries
  const feedbackEntries = await retrieveTicketFeedback(userId, organizationId);

  // Filter for high-quality entries
  const qualityEntries = feedbackEntries.filter(
    (entry) =>
      entry.feedbackType === 'improved' && entry.improvedTicket !== null,
  );

  // Build the JSONL lines
  const jsonlLines = qualityEntries.map((entry) => {
    // For improved tickets, use the original transcript and the improved ticket
    return JSON.stringify({
      prompt: `Generate JIRA tickets from the following meeting transcript:\n\n${entry.originalTranscript}\n\n###\n\n`,
      completion: ` ${JSON.stringify([entry.improvedTicket], null, 2)}`,
    });
  });

  // Include approved tickets as well if needed
  const approvedEntries = feedbackEntries.filter(
    (entry) => entry.feedbackType === 'approved',
  );

  // Sample to prevent dataset imbalance (if there are too many approved vs improved)
  const maxApproved = Math.min(
    approvedEntries.length,
    qualityEntries.length * 2,
  );
  const sampledApproved = approvedEntries.slice(0, maxApproved);

  // Add approved tickets to the dataset
  sampledApproved.forEach((entry) => {
    jsonlLines.push(
      JSON.stringify({
        prompt: `Generate JIRA tickets from the following meeting transcript:\n\n${entry.originalTranscript}\n\n###\n\n`,
        completion: ` ${JSON.stringify([entry.generatedTicket], null, 2)}`,
      }),
    );
  });

  return jsonlLines.join('\n');
}
