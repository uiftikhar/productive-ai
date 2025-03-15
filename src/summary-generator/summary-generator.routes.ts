import { Router } from 'express';
import multer from 'multer';

import { getSummary } from './summary-generator.controller.ts';

const upload = multer({ dest: 'uploads/' });
const router = Router();

router.post('/', upload.single('transcript'), getSummary);

export { router as summaryRoutes };
