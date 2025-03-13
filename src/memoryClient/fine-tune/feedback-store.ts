// src/feedbackStore.ts
import { mem0Client } from '../mem0-client.ts';

/**
 * Represents a user feedback record stored in mem0.
 */
export type FeedbackEntry = {
  id: string; // Unique identifier for the memory record
  transcript: string; // The original transcript snippet or context
  correctedSummary: string; // The user-provided corrected summary
};

/**
 * Retrieves all feedback records for a given user from mem0.
 * This function queries mem0 by filtering for the specific user_id.
 *
 * @param userId - The unique identifier for the user.
 * @returns A promise resolving to an array of FeedbackEntry objects.
 */
export async function retrieveAllFeedback(
  userId: string,
): Promise<FeedbackEntry[]> {
  // Use a non-empty query string; if you want all records, you might use a wildcard or empty query.
  // Adjust the search options according to mem0's API.
  const results = await mem0Client.search('', {
    top_k: 100, // retrieve up to 100 records
    user_id: userId,
    // Depending on the mem0 API, you might include additional options here.
  });

  if (!results || !Array.isArray(results)) {
    return [];
  }

  // Map the results to FeedbackEntry objects.
  const feedbackEntries: FeedbackEntry[] = results.map((record: any) => ({
    id: record.id,
    transcript: record.text || '',
    // Assume the corrected summary is stored in metadata.correctedSummary.
    correctedSummary: record.metadata?.correctedSummary || '',
  }));

  return feedbackEntries;
}
