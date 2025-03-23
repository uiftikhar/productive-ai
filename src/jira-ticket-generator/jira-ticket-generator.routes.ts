import { Router } from 'express';
import multer from 'multer';

import { authenticateWithMemory } from '../auth/index.ts';
import {
  getPreferences,
  getTickets,
  savePreferences,
  submitTicketFeedback,
} from './jira-ticket-generator.controller.ts';

const upload = multer({ dest: 'uploads/' });
const router = Router();

// Generate tickets endpoint
router.post('/', upload.single('transcript'), getTickets);

// Ticket feedback endpoint (requires authentication)
router.post('/feedback', authenticateWithMemory, submitTicketFeedback);

// User preferences endpoints (requires authentication)
router.get('/preferences', authenticateWithMemory, getPreferences);
router.post('/preferences', authenticateWithMemory, savePreferences);

export { router as ticketGeneratorRoutes };
