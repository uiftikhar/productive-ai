import { Router } from 'express';
import multer from 'multer';

import { getTickets } from './jira-ticket-generator.controller';

const upload = multer({ dest: 'uploads/' });
const router = Router();

router.post('/', upload.single('transcript'), getTickets);

export { router as ticketGeneratorRoutes };
