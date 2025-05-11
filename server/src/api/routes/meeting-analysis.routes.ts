/**
 * Meeting Analysis API Routes
 * 
 * These routes provide access to the hierarchical meeting analysis system
 */
import express from 'express';
import { MeetingAnalysisController } from '../controllers/meeting-analysis.controller';

const router = express.Router();
const meetingAnalysisController = new MeetingAnalysisController();

// Register all routes from the controller
meetingAnalysisController.registerRoutes(router);

export default router; 