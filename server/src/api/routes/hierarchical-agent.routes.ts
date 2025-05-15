import express from 'express';
import { HierarchicalAgentController } from '../controllers/hierarchical-agent.controller';

const router = express.Router();
const hierarchicalAgentController = new HierarchicalAgentController();

console.log('***************hierarchical-agent.routes.ts loaded***************');

/**
 * @route POST /analyze
 * @desc Analyze a meeting transcript
 * @access Public
 */
router.post('/analyze', hierarchicalAgentController.analyzeTranscript);

/**
 * @route POST /create
 * @desc Create a new analysis session
 * @access Public
 */
router.post('/create', hierarchicalAgentController.createSession);

/**
 * @route GET /:sessionId/status
 * @desc Get the status of an analysis session
 * @access Public
 */
router.get('/:sessionId/status', hierarchicalAgentController.getSessionStatus);

/**
 * @route GET /:sessionId/result
 * @desc Get the results of an analysis session
 * @access Public
 */
router.get('/:sessionId/result', hierarchicalAgentController.getSessionResult);

/**
 * @route POST /:sessionId/cancel
 * @desc Cancel an ongoing analysis session
 * @access Public
 */
router.post('/:sessionId/cancel', hierarchicalAgentController.cancelAnalysis);

export default router; 