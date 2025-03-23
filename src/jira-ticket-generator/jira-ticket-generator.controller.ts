import '../types/user.types.ts'; // Import type augmentation

import type { Request, Response } from 'express';
import express from 'express';
import { promises as fs } from 'fs';

import { generateJiraTickets } from '../jira-ticket-generator/jira-ticket-generator.ts';
import {
  getUserPreferences,
  storeUserPreferences,
  storeUserTicket,
} from '../memory-client/user-context.ts';

export const getTickets = async (
  req: Request,
  res: Response,
  next: express.NextFunction,
) => {
  try {
    // Optionally, you can accept transcript data from the request body.

    if (!req.file) {
      return res.status(400).json({ error: 'No transcript file uploaded.' });
    }

    // Get the uploaded file's path (Multer stores it in req.file.path)
    const filePath = req.file.path;

    // For simplicity, assume it's a text file. For PDFs, you might use a library like pdf-parse.
    const transcript = await fs.readFile(filePath, 'utf8');

    // Optionally, you can remove the file after reading (cleanup)
    await fs.unlink(filePath);

    // Get user ID if authenticated
    const userId = req.user?.id;

    // Pass userId to the generator if available
    const tickets = await generateJiraTickets(transcript, userId);

    res.json({ tickets });
  } catch (error) {
    next(error);
  }
};

/**
 * Handle ticket feedback from users
 */
export const submitTicketFeedback = async (
  req: Request,
  res: Response,
  next: express.NextFunction,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const {
      ticketId,
      originalTicket,
      improvedTicket,
      transcript,
      feedbackType,
    } = req.body;

    if (!originalTicket || !feedbackType || !transcript) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate feedback type
    if (!['approved', 'improved', 'rejected'].includes(feedbackType)) {
      return res.status(400).json({ error: 'Invalid feedback type' });
    }

    // Store the feedback in mem0
    await storeUserTicket(
      req.user.id,
      transcript,
      originalTicket,
      improvedTicket,
      feedbackType,
    );

    res
      .status(200)
      .json({ success: true, message: 'Feedback stored successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Save user preferences for ticket generation
 */
export const savePreferences = async (
  req: Request,
  res: Response,
  next: express.NextFunction,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { ticketStyle, detailLevel, preferredLabels, otherPreferences } =
      req.body;

    if (!ticketStyle && !detailLevel && !preferredLabels && !otherPreferences) {
      return res.status(400).json({ error: 'No preferences provided' });
    }

    // Save preferences to mem0
    await storeUserPreferences(req.user.id, {
      ticketStyle,
      detailLevel,
      preferredLabels,
      otherPreferences,
    });

    res
      .status(200)
      .json({ success: true, message: 'Preferences saved successfully' });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user preferences for ticket generation
 */
export const getPreferences = async (
  req: Request,
  res: Response,
  next: express.NextFunction,
) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get preferences from mem0
    const preferences = await getUserPreferences(req.user.id);

    if (!preferences) {
      return res.status(404).json({ message: 'No preferences found' });
    }

    res.status(200).json({ preferences });
  } catch (error) {
    next(error);
  }
};
