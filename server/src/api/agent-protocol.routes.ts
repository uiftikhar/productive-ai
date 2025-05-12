import express from 'express';
import { AgentProtocolController } from './agent-protocol.controller';

const router = express.Router();
const controller = new AgentProtocolController();

// Analysis endpoints
router.post('/meetings/analyze', (req, res) => controller.analyzeMeeting(req, res));
router.get('/meetings/:meetingId/status', (req, res) => controller.getMeetingAnalysisStatus(req, res));
router.get('/meetings/:meetingId/result', (req, res) => controller.getMeetingAnalysisResult(req, res));
router.post('/meetings/:meetingId/cancel', (req, res) => controller.cancelMeetingAnalysis(req, res));

export default router; 