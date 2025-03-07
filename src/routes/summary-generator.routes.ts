import { Router } from 'express';

import { getSummary } from '../controllers/summary-generator.controller.ts';

const router = Router();

router.get('/', getSummary);

export default router;