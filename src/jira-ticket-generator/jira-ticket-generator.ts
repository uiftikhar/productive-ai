import OpenAI from 'openai';

import { processAllChunks } from '../shared/utils/process-chunk.ts';
import { splitTranscript } from '../shared/utils/split-transcript.ts';
import { InstructionTemplateNameEnum } from '../shared/prompts/instruction-templates.ts';
import { SystemRoleEnum } from '../shared/prompts/prompt-types.ts';

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
export function isValidJSON(jsonString: string): boolean {
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
export function extractValidObjects<T = unknown>(input: string): T[] {
  const validObjects: T[] = [];

  // First try to find complete valid objects
  const regex = /{[^{}]*}/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(input)) !== null) {
    const potentialObject: string = match[0];

    // Try to clean up common JSON issues before parsing
    let cleanedObject = potentialObject;

    // Remove trailing commas in objects
    cleanedObject = cleanedObject.replace(/,\s*(})/g, '$1');

    // Try to parse the cleaned object
    if (isValidJSON(cleanedObject)) {
      validObjects.push(JSON.parse(cleanedObject) as T);
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
export function cleanJsonArray<T = unknown>(input: string): T[] {
  let cleanedInput = input.trim();

  // For a single object without brackets, simply use extractValidObjects
  if (cleanedInput.startsWith('{') && !cleanedInput.startsWith('[')) {
    return extractValidObjects<T>(cleanedInput);
  }

  // Ensure the input starts with '[' and ends with ']'
  if (!cleanedInput.startsWith('[')) {
    cleanedInput = '[' + cleanedInput;
  }
  if (!cleanedInput.endsWith(']')) {
    cleanedInput = cleanedInput + ']';
  }

  // Remove trailing commas before the closing bracket
  cleanedInput = cleanedInput.replace(/,(\s*\])/g, '$1');

  // Replace any invalid commas between objects
  cleanedInput = cleanedInput.replace(/}(\s*),(\s*){/g, '},{');

  try {
    const parsed: unknown = JSON.parse(cleanedInput);
    if (Array.isArray(parsed)) {
      return parsed as T[];
    }
  } catch (e) {
    // If parsing fails, extract valid objects individually
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

    const partialTickets = await processAllChunks(
      chunks,
      client,
      SystemRoleEnum.AGILE_COACH,
      InstructionTemplateNameEnum.TICKET_GENERATION,
      userId,
    );

    const cleanedTickets: Ticket[] = [];
    partialTickets.forEach((partialTicket) => {
      const cleanedPartialTickets: Ticket[] =
        cleanJsonArray<Ticket>(partialTicket);
      cleanedTickets.push(...cleanedPartialTickets);
    });

    return cleanedTickets;
  } catch (error) {
    console.error('Error in generateJiraTickets:', error);
    throw error;
  }
}
