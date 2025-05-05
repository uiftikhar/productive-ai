import { Router } from 'express';
import { TranscriptAnalysisController } from '../controllers/transcript-analysis.controller';

const router = Router();
const controller = TranscriptAnalysisController.getInstance();

// POST endpoint to analyze a transcript
router.post('/analyze', async (req, res) => {
  await controller.analyzeTranscript(req, res);
});

// GET endpoint to check analysis status
router.get('/status/:meetingId', async (req, res) => {
  await controller.getAnalysisStatus(req, res);
});

export default router; 