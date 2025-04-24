import express from 'express';
import {
  getVisualization,
  listVisualizations,
} from '../controllers/visualization.controller';

const router = express.Router();

/**
 * @route GET /api/visualizations
 * @description Get a list of all available visualizations
 * @access Public
 */
router.get('/', listVisualizations);

/**
 * @route GET /api/visualizations/:filename
 * @description Get a specific visualization file
 * @param {string} filename - The filename of the visualization
 * @access Public
 */
router.get('/:filename', getVisualization);

export default router;
