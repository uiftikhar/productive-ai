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
 * Interface for the memory operations we need
 */
export interface MemoryOperations {
  add: (content: string, options?: any) => Promise<any>;
  search: (query: string, options?: any) => Promise<any[]>;
  get: () => Promise<Memory>;
}

/**
 * Retrieves a memory store by name. If it does not exist, creates a new memory.
 * This function can be used to manage per-user or per-project memory.
 *
 * @param memoryId - A unique name for the memory store (e.g., `user-memory-<userId>`).
 * @returns An object with operations bound to this memory context.
 */
export async function initMemory(memoryId: string): Promise<MemoryOperations> {
  try {
    // Try to retrieve the memory store.
    const memory = await mem0Client.get(memoryId);
    console.log(`Memory "${memoryId}" retrieved.`);

    // Return an object with operations bound to this memory context
    return {
      // Add content to this memory context
      add: (content: string, options?: any) =>
        mem0Client.add(content, {
          ...options,
          user_id: memoryId,
        }),

      // Search within this memory context
      search: (query: string, options?: any) =>
        mem0Client.search(query, {
          ...options,
          user_id: memoryId,
        }),

      // Get the raw memory object if needed
      get: () => Promise.resolve(memory),
    };
  } catch (error: any) {
    // If the memory record does not exist, create one.
    // console.log(
    //   `Memory with id "${memoryId}" not found. Creating new memory record...`,
    // );

    // // Use the add method. The add method accepts a message (here, an empty string as initial content)
    // // and options. We use the user_id option to tag this record.
    // const options = { user_id: memoryId };
    // const result = await mem0Client.add('', options);

    // if (result && result.length > 0) {
    //   console.log(`Memory with id "${memoryId}" created.`);
    //   const memory = result[0];

    //   // Return the same interface for newly created memory
    //   return {
    //     add: (content: string, options?: any) =>
    //       mem0Client.add(content, {
    //         ...options,
    //         user_id: memoryId,
    //       }),
    //     search: (query: string, options?: any) =>
    //       mem0Client.search(query, {
    //         ...options,
    //         user_id: memoryId,
    //       }),
    //     get: () => Promise.resolve(memory),
    //   };
    // } else {
    //   throw new Error('Failed to create memory record.');
    // }

    try {
      // If the memory record does not exist, create one.
      console.log(
        `Memory with id "${memoryId}" not found. Creating new memory record...`,
      );

      // Use the add method
      const options = { user_id: memoryId };
      try {
        const result = await mem0Client.add('', options);

        if (result && result.length > 0) {
          console.log(`Memory with id "${memoryId}" created.`);
          const memory = result[0];

          // Return the interface for the new memory
          //   // Return the same interface for newly created memory
          return {
            add: (content: string, options?: any) =>
              mem0Client.add(content, {
                ...options,
                user_id: memoryId,
              }),
            search: (query: string, options?: any) =>
              mem0Client.search(query, {
                ...options,
                user_id: memoryId,
              }),
            get: () => Promise.resolve(memory),
          };
        } else {
          throw new Error('Failed to create memory record.');
        }
      } catch (addError) {
        // Rethrow the original error from the add operation
        throw addError;
      }
    } catch (error: any) {
      // Only wrap errors that aren't already Error objects
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error('Failed to create memory record.');
      }
    }
  }
}
