import axios from 'axios';
import * as dotenv from 'dotenv';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

import { buildFineTuneDataset } from './fine-tune-dataset.ts';

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1';
const FINETUNE_BASE_MODEL =
  process.env.FINETUNE_BASE_MODEL || 'gpt-4o-2024-08-06';

/**
 * Prepares and uploads a dataset for fine-tuning
 * @param organizationId - Optional organization ID for organization-wide fine-tuning
 * @returns Promise with the file ID
 */
export async function prepareAndUploadTrainingData(
  organizationId?: string,
): Promise<string> {
  try {
    // Build dataset from all users in the organization
    const datasetContent = await buildFineTuneDataset(
      undefined,
      organizationId,
    );

    // Ensure we have enough data for fine-tuning
    const lineCount = datasetContent.split('\n').length;
    if (lineCount < 10) {
      throw new Error('Insufficient training data. Need at least 10 examples.');
    }

    console.log(`Generated dataset with ${lineCount} examples`);

    // Save dataset to a temporary file
    const tempDir = path.resolve(process.cwd(), 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.resolve(
      tempDir,
      `training_data_${Date.now()}.jsonl`,
    );
    fs.writeFileSync(tempFilePath, datasetContent, 'utf8');

    // Upload to OpenAI
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

    // Store the file ID in the organization's settings (implementation depends on your data model)

    return response.data.id;
  } catch (error) {
    console.error('Error preparing and uploading training data:', error);
    throw error;
  }
}

/**
 * Creates a fine-tuning job using the uploaded training file
 * @param trainingFileId The file id from prepareAndUploadTrainingData
 * @param model The base model to fine-tune (defaults to env variable or gpt-4o)
 * @returns Promise with the job ID
 */
export async function createFineTuneJob(
  trainingFileId: string,
  model: string = FINETUNE_BASE_MODEL,
): Promise<string> {
  try {
    const payload = {
      training_file: trainingFileId,
      model,
      suffix: `tickets-${Date.now()}`, // Adds a timestamp to make the model name unique
    };

    const response = await axios.post(
      `${OPENAI_API_URL}/fine_tuning/jobs`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      },
    );

    console.log('Fine-tune job created with id:', response.data.id);

    // Store the job ID for later reference

    return response.data.id;
  } catch (error) {
    console.error('Error creating fine-tune job:', error);
    throw error;
  }
}

/**
 * Checks the status of a fine-tuning job
 * @param jobId The job ID from createFineTuneJob
 * @returns Promise with the job status
 */
export async function checkFineTuneStatus(jobId: string): Promise<any> {
  try {
    const response = await axios.get(
      `${OPENAI_API_URL}/fine_tuning/jobs/${jobId}`,
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
      },
    );

    return response.data;
  } catch (error) {
    console.error('Error checking fine-tune status:', error);
    throw error;
  }
}

/**
 * Updates the environment with the fine-tuned model ID once it's ready
 * @param jobId The job ID to check
 * @returns Promise with the model ID if ready
 */
export async function updateFineTunedModel(
  jobId: string,
): Promise<string | null> {
  try {
    const status = await checkFineTuneStatus(jobId);

    if (status.status === 'succeeded') {
      const modelId = status.fine_tuned_model;

      // Update environment variable
      process.env.FINETUNE_MODEL_ID = modelId;

      // You might want to also update this in your .env file or database

      console.log(`Fine-tuned model ready: ${modelId}`);
      return modelId;
    }

    return null;
  } catch (error) {
    console.error('Error updating fine-tuned model:', error);
    return null;
  }
}
