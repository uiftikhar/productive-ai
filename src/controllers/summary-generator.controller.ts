import type {
  Request,
  Response,
} from 'express';
import express from 'express';

import { generateSummary } from '../summary-generator/summary-generator.ts';

export const getSummary = async (req: Request, res: Response, next: express.NextFunction) => {
  try {
    // Optionally, you can accept transcript data from the request body.
    const summary = await generateSummary();
    res.json({ summary });
  } catch (error) {
    next(error);
  }
};