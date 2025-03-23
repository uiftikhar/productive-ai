import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';

import { isAuthenticated } from '../auth/index.ts';
import {
  activateFineTunedModel,
  getFineTuningStatus,
  startFineTuning,
} from './fine-tune.controller.ts';

// Admin role middleware
const isAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user?.isAdmin && !req.user?.roles?.includes('admin')) {
    return res
      .status(403)
      .json({ error: 'Unauthorized. Admin access required.' });
  }
  next();
};

const router = Router();

// All admin routes require authentication
router.use(isAuthenticated);
router.use(isAdmin);

// Fine-tuning routes - use standard router without extra wrappers
router.post('/fine-tune/start', startFineTuning);
router.get('/fine-tune/status/:jobId', getFineTuningStatus);
router.post('/fine-tune/activate', activateFineTunedModel);

export { router as adminRoutes };
