import { Router } from 'express';
import { debugController } from './debug.controller';

// Create the debug router
export const debugRouter = Router();

// Agent system status endpoint
debugRouter.get('/agent-status', debugController.getAgentStatus);

// Agent progress endpoint
debugRouter.get('/agent-progress/:sessionId', debugController.getAgentProgress);

// Agent communications endpoint
debugRouter.get('/agent-communications/:sessionId', debugController.getAgentCommunications); 