import * as dotenv from 'dotenv';
import type { Memory } from 'mem0ai';
import { MemoryClient } from 'mem0ai';

dotenv.config();

// Create a mem0 client instance with your API credentials and optional organization/project settings.
export const mem0Client = new MemoryClient({
  apiKey: process.env.MEM0_API_KEY!, // Required API key from mem0
  // host: process.env.MEM0_HOST, // Optional custom host if needed
  organizationName: process.env.MEM0_ORGANIZATION_NAME || undefined,
  projectName: process.env.MEM0_PROJECT_NAME || undefined,
  organizationId: process.env.MEM0_ORGANIZATION_ID || undefined,
  projectId: process.env.MEM0_PROJECT_ID || undefined,
});

/**
 * Retrieves a memory store by name. If it does not exist, creates a new memory.
 * This function can be used to manage per-user or per-project memory.
 *
 * @param memoryId - A unique name for the memory store (e.g., `user-memory-<userId>`).
 * @returns The memory store instance.
 */
export async function initMemory(memoryId: string): Promise<Memory> {
  try {
    // Try to retrieve the memory store.
    const memory = await mem0Client.get(memoryId);
    console.log(`Memory "${memoryId}" retrieved.`);
    return memory;
  } catch (error: any) {
    // If the memory record does not exist, create one.
    console.log(
      `Memory with id "${memoryId}" not found. Creating new memory record...`,
    );
    // Use the add method. The add method accepts a message (here, an empty string as initial content)
    // and options. We use the user_id option to tag this record.
    const options = { user_id: memoryId };
    const result = await mem0Client.add('', options);
    if (result && result.length > 0) {
      console.log(`Memory with id "${memoryId}" created.`);
      return result[0];
    } else {
      throw new Error('Failed to create memory record.');
    }
  }
}
