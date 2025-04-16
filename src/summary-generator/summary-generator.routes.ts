import { Router } from 'express';
import multer from 'multer';

import { getSummary, getDecisionReport } from './summary-generator.controller';

const upload = multer({ dest: 'uploads/' });
const router = Router();

router.post('/', upload.single('transcript'), getSummary);
router.post('/decisions/report', getDecisionReport);

export { router as summaryRoutes };
