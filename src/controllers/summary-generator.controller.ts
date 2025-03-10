import type { Request, Response } from 'express';
import express from 'express';
import { promises as fs } from 'fs';

import { generateSummary } from '../summary-generator/summary-generator.ts';

export const getSummary = async (
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

    const summary = await generateSummary(transcript);
    res.json({ summary });
  } catch (error) {
    next(error);
  }
};
