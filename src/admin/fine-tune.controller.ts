import type { NextFunction, Request, Response } from 'express';

import {
  checkFineTuneStatus,
  createFineTuneJob,
  prepareAndUploadTrainingData,
  updateFineTunedModel,
} from '../memory-client/fine-tune/fine-tune.ts';

/**
 * Initiates the fine-tuning process for the organization
 */
export const startFineTuning = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Authorization check using the strongly typed user
    if (!req.user?.isAdmin && !req.user?.roles?.includes('admin')) {
      return res
        .status(403)
        .json({ error: 'Unauthorized. Admin access required.' });
    }

    const organizationId =
      req.body.organizationId || process.env.DEFAULT_ORGANIZATION_ID;

    // Step 1: Prepare and upload training data
    const fileId = await prepareAndUploadTrainingData(organizationId);

    // Step 2: Create fine-tuning job
    const baseModel =
      req.body.baseModel ||
      process.env.FINETUNE_BASE_MODEL ||
      'gpt-4o-2024-08-06';
    const jobId = await createFineTuneJob(fileId, baseModel);

    res.status(200).json({
      success: true,
      message: 'Fine-tuning job started successfully',
      jobId,
      fileId,
    });
  } catch (error: any) {
    console.error('Error starting fine-tuning:', error);
    res.status(500).json({
      error: 'Failed to start fine-tuning process',
      details: error.message,
    });
  }
};

/**
 * Checks the status of an ongoing fine-tuning job
 */
export const getFineTuningStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Authorization check using strongly typed user
    if (!req.user?.isAdmin && !req.user?.roles?.includes('admin')) {
      return res
        .status(403)
        .json({ error: 'Unauthorized. Admin access required.' });
    }

    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const status = await checkFineTuneStatus(jobId);

    // If job is complete, update the model ID
    if (status.status === 'succeeded') {
      await updateFineTunedModel(jobId);
    }

    res.status(200).json({
      success: true,
      status,
    });
  } catch (error: any) {
    console.error('Error checking fine-tuning status:', error);
    res.status(500).json({
      error: 'Failed to check fine-tuning status',
      details: error.message,
    });
  }
};

/**
 * Activates a fine-tuned model for use in the application
 */
export const activateFineTunedModel = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Authorization check using strongly typed user
    if (!req.user?.isAdmin && !req.user?.roles?.includes('admin')) {
      return res
        .status(403)
        .json({ error: 'Unauthorized. Admin access required.' });
    }

    const { modelId } = req.body;

    if (!modelId) {
      return res.status(400).json({ error: 'Model ID is required' });
    }

    // Set the environment variable
    process.env.FINETUNE_MODEL_ID = modelId;

    // Here you would typically also update this in your database or .env file
    // For a complete implementation, you might want to:
    // 1. Save this to a settings table in your database
    // 2. Update your .env file
    // 3. Set up a cache for faster access

    res.status(200).json({
      success: true,
      message: 'Fine-tuned model activated successfully',
      modelId,
    });
  } catch (error: any) {
    console.error('Error activating fine-tuned model:', error);
    res.status(500).json({
      error: 'Failed to activate fine-tuned model',
      details: error.message,
    });
  }
};
