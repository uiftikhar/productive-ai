import dotenv from 'dotenv';

import { generateSummary } from './summarizer.js';

dotenv.config();

async function main() {
  try {
    const summary = await generateSummary();
    console.log('Summary Output:\n', summary);
  } catch (error) {
    console.error('Error in main:', error);
  }
}

main();
