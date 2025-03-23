import OpenAI from 'openai';

import {
  getUserPreferences,
  getUserTicketExamples,
  storeUserTicket,
} from '../memory-client/user-context.ts';
import { processAllChunks } from '../shared/utils/process-chunk.ts';
import { splitTranscript } from '../shared/utils/split-transcript.ts';

export interface Ticket {
  ticketType: string;
  summary: string;
  description: string;
  acceptanceCriteria: string[] | string;
  dependencies: string;
  assignees: string;
  labels: string;
  estimate: string;
}

/**
 * Checks if a string is valid JSON.
 * @param jsonString - The JSON string to validate.
 * @returns true if valid JSON; false otherwise.
 */
function isValidJSON(jsonString: string): boolean {
  try {
    JSON.parse(jsonString);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Extracts valid JSON objects from a string using a regular expression.
 * Note: This regex assumes that objects are not nested with extra curly braces.
 * @param input - The input string potentially containing JSON objects.
 * @returns An array of parsed objects of type T.
 */
function extractValidObjects<T = unknown>(input: string): T[] {
  const validObjects: T[] = [];
  // Regex finds any substring that starts with { and ends with }
  const regex = /{[^{}]*}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(input)) !== null) {
    const potentialObject: string = match[0];
    if (isValidJSON(potentialObject)) {
      validObjects.push(JSON.parse(potentialObject) as T);
    }
  }
  return validObjects;
}

/**
 * Attempts to clean up a JSON array string.
 * - Ensures the string starts with `[` and ends with `]`.
 * - Removes trailing commas before the closing bracket.
 * - If parsing fails, it extracts valid objects individually.
 * @param input - The JSON array string (which might be malformed).
 * @returns An array of parsed objects of type T.
 */
function cleanJsonArray<T = unknown>(input: string): T[] {
  let cleanedInput = input.trim();

  // Ensure the input starts with '[' and ends with ']'
  if (!cleanedInput.startsWith('[')) {
    cleanedInput = '[' + cleanedInput;
  }
  if (!cleanedInput.endsWith(']')) {
    cleanedInput = cleanedInput + ']';
  }

  // Remove trailing commas before the closing bracket
  cleanedInput = cleanedInput.replace(/,(\s*\])/g, '$1');

  try {
    const parsed: unknown = JSON.parse(cleanedInput);
    if (Array.isArray(parsed)) {
      return parsed as T[];
    }
  } catch (e) {
    // If parsing fails, extract valid objects individually.
    return extractValidObjects<T>(cleanedInput);
  }
  return [];
}

export async function generateJiraTickets(
  transcript: string,
  userId?: string,
): Promise<Ticket[]> {
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const chunks = splitTranscript(transcript, 1600, 4);

    // Get the organization's fine-tuned model if it exists
    const model = process.env.FINETUNE_MODEL_ID || 'gpt-4';

    // Base prompt for ticket generation
    let prompt = `
    Role: 
      You are an expert Agile Coach and Scrum Master with deep expertise in Agile methodologies, 
      Scrum practices, Jira ticket creation, and project management for technical development teams. You 
      have detailed knowledge of Jira's capabilities, workflows, and best practices for structuring 
      tickets clearly and comprehensively. You also understand technical refinements and how to convert
      discussions into clearly defined tasks, user stories, spikes, bugs, and epics.

    Task: 
      Analyze the provided technical refinement meeting transcript carefully and generate clearly 
      structured Jira tickets in the JSON format specified below.. Each ticket must clearly state 
      the ticket type (Story, Task, Sub-task, Spike, Bug), include a clear and concise summary, detailed
      description, acceptance criteria, dependencies (if applicable), assignee(s), labels, and estimate 
      placeholders. Each ticket generated should precisely follow the defined structure and requirements.
          
    Guidelines for Jira Ticket Generation:
      - Ensure that the tickets created are only for developers. 
      - Filter out any tickets like follow up meeting or review meeting notes etc. Tickets should only 
        be for tech teams like developers designers and team leads
      - Clearly define Ticket Types: Epic | Story | Task | Sub-task | Spike | Bug.
      - Summarize the purpose concisely and clearly.
      - Provide detailed descriptions including technical details, UX/UI requirements, expectations, and relevant context.
      - Define clear Acceptance Criteria in bullet-point form.
      - Explicitly list Dependencies when applicable, clearly identifying dependent tickets or tasks.
      - The field "assignees" should be an empty string.
      - Suggest meaningful labels relevant to the ticket 
        (frontend, backend, UX, urgent, payments, elasticsearch, wishlist, performance, synchronization, etc.).
      - The field "estimate" should be an empty string.
      - Clearly differentiate between frontend, backend, UX/UI, and integration tasks.
      - Identify spikes separately from actionable tasks.
      - Explicitly highlight performance, scalability, or UX issues mentioned.
      - Document any scope reduction, iterative approaches, or key technical solutions 
        agreed upon (e.g., Elasticsearch integration, idempotency keys, wishlist syncing).
      - Prioritize urgent or critical issues explicitly (e.g., duplicate payments), including interim and long-term solutions.
    
    Ensure that:
      - Each object in the Output Array is a complete valid object. Make sure that each item should be a fully formed VALID JSON Object.
      - If an item is not a fully valid JSON Object, remove it from the output array. 
      - Make sure you perform this JSON Object validation check on each and every object.
      - This should ensure that the array is an array of VALID JSON objects.
      - Output must strictly match this JSON array format without any explanations or additional text.
      - If there are no tickets to generate, you return an empty array.
      - Never truncate JSON objects or arrays. 
      - If necessary, reduce the number of tickets instead of truncating.
      - Ensure a minimum of 5 Tickets created
      - DO NOT GIVE MORE THAN 5 TICKETS.
      - Your output should be a maximum of 5 tickets

      - Output must strictly be just a JSON Array of the format:
          [
            {
              "ticketType": "Generated ticket type of this ticket",
              "summary": "Generated summary of this ticket",
              "description": "Generated description of this ticket",
              "acceptanceCriteria": "Generated acceptance criteria of this ticket",
              "dependencies": "Generated Dependencies of this ticket",
              "assignees": "",
              "labels": "generated labels",
              "estimate": ""
            },
            {
              "ticketType": "Generated ticket type of this ticket",
              "summary": "Generated summary of this ticket",
              "description": "Generated description of this ticket",
              "acceptanceCriteria": "Generated acceptance criteria of this ticket",
              "dependencies": "Generated Dependencies of this ticket",
              "assignees": "",
              "labels": "generated labels",
              "estimate": ""
            }
            // add more tickets as necessary
          ]
    `;

    // Enhance prompt with user-specific context if userId is provided
    if (userId) {
      try {
        // Get user preferences
        const userPreferences = await getUserPreferences(userId);
        if (userPreferences) {
          prompt += `\nUser Preferences:
          This user prefers ${userPreferences.ticketStyle || 'standard'} style tickets with ${userPreferences.detailLevel || 'moderate'} level of detail.
          ${userPreferences.preferredLabels ? `Preferred labels: ${userPreferences.preferredLabels.join(', ')}` : ''}
          ${userPreferences.otherPreferences ? `Other preferences: ${JSON.stringify(userPreferences.otherPreferences)}` : ''}
          `;
        }

        // Get user's previous ticket examples
        const userExamples = await getUserTicketExamples(userId, transcript);
        if (userExamples) {
          prompt += `\n${userExamples}\n`;
        }
      } catch (error) {
        console.error('Error enhancing prompt with user context:', error);
        // Continue with base prompt if user context retrieval fails
      }
    }

    prompt += `\nTranscript to Analyze:\n`;

    const partialTickets = await processAllChunks(
      chunks,
      client,
      prompt,
      model,
      5000,
      0,
    );

    const cleanedTickets: Ticket[] = [];
    partialTickets.forEach(async (partialTicket) => {
      const cleanedPartialTickets: Ticket[] =
        cleanJsonArray<Ticket>(partialTicket);
      cleanedTickets.push(...cleanedPartialTickets);
    });

    // Store generated tickets in user's memory if userId is provided
    if (userId) {
      try {
        for (const ticket of cleanedTickets) {
          await storeUserTicket(userId, transcript, ticket);
        }
      } catch (error) {
        console.error('Error storing tickets in user memory:', error);
        // Continue even if storing fails
      }
    }

    return cleanedTickets;
  } catch (error) {
    console.error('Error in generateJiraTickets:', error);
    throw error;
  }
}
