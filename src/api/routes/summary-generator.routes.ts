import { Router } from 'express';
import multer from 'multer';

import { getSummary } from '../controllers/summary-generator.controller';

const upload = multer({ dest: 'uploads/' });
const router = Router();

/**
 * @route GET /api/summary
 * @desc Generate a meeting summary from a transcript
 * @access Public
 * @query {boolean} langgraph - Whether to use LangGraph for visualization (optional)
 * @query {boolean} rag - Whether to use RAG enhancement for better context (optional)
 * @body {string} meetingTitle - Title of the meeting (optional)
 * @body {string[]} participantIds - List of participant IDs (optional)
 * @body {string} userId - User ID for context storage (optional)
 * @body {boolean} includeSentiment - Whether to include sentiment analysis (optional)
 * @file {file} transcript - Transcript file (required)
 * @returns {Object} meetingId, analysis, visualizationUrl, langSmithUrl, ragEnhanced
 */
router.post('/summary', upload.single('transcript'), getSummary);

export { router as summaryRoutes };
