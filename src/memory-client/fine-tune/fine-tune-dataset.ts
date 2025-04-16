import { FeedbackEntry, retrieveAllFeedback } from './feedback-store';

/**
 * Build a JSONL string from feedback entries.
 */
export async function buildFineTuneDataset(userId: string): Promise<string> {
  const feedbackEntries: FeedbackEntry[] = await retrieveAllFeedback(userId);

  // Map each feedback entry into a JSONL line.
  const jsonlLines = feedbackEntries.map((entry) => {
    return JSON.stringify({
      prompt: `Transcript: ${entry.transcript}\n\n###\n\n`, // You can use a delimiter to separate prompt and completion
      completion: entry.correctedSummary.startsWith(' ')
        ? entry.correctedSummary
        : ' ' + entry.correctedSummary,
    });
  });

  return jsonlLines.join('\n');
}
