// src/fineTune.ts
import axios from 'axios';
import * as dotenv from 'dotenv';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

import { buildFineTuneDataset } from './fine-tune-dataset.ts';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1';

/**
 * Uploads the JSONL dataset to OpenAI and returns the file id.
 */
export async function uploadTrainingData(userId: string): Promise<string> {
  // TODO Need to update and fix function
  const datasetContent = await buildFineTuneDataset(userId);
  const tempFilePath = path.resolve(__dirname, '../temp/training_data.jsonl');
  fs.writeFileSync(tempFilePath, datasetContent, 'utf8');

  const form = new FormData();
  form.append('purpose', 'fine-tune');
  form.append('file', fs.createReadStream(tempFilePath));

  const response = await axios.post(`${OPENAI_API_URL}/files`, form, {
    headers: {
      ...form.getHeaders(),
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
  });
  console.log('Uploaded training file id:', response.data.id);
  return response.data.id;
}

/**
 * Creates a fine-tune job using the uploaded training file.
 * @param trainingFileId The file id from uploadTrainingData.
 * @param model The base model to fine-tune (e.g., 'gpt-4o-2024-08-06').
 */
export async function createFineTuneJob(
  trainingFileId: string,
  model: string,
): Promise<string> {
  const payload = {
    training_file: trainingFileId,
    model, // Fine-tune a model like 'gpt-4o-2024-08-06'
  };

  const response = await axios.post(`${OPENAI_API_URL}/fine-tunes`, payload, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
  });
  console.log('Fine-tune job created with id:', response.data.id);
  return response.data.id;
}
