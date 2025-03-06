import dotenv from 'dotenv';

import { generateSummary } from './summaryGenerator.ts';

dotenv.config();

async function main(): Promise<void> {
  try {
    const summary = await generateSummary();
    console.log('Summary Output:\n', summary);
  } catch (error) {
    console.error('Error in main:', error);
  }
}

main();
