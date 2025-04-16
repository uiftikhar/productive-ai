import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';

import { authRoutes } from './auth/index';
import { passportClient } from './database/index';
import { ticketGeneratorRoutes } from './jira-ticket-generator/jira-ticket-generator.routes';
import { summaryRoutes } from './summary-generator/index';
import { visualizationRoutes } from './summary-generator/visualization.routes';

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
  }),
);

app.use(passportClient.initialize());
app.use(passportClient.session());

app.use('/auth', authRoutes);
app.use('/api/generate-summary', summaryRoutes);
app.use('/api/generate-tickets', ticketGeneratorRoutes);
app.use('/visualization', visualizationRoutes);

app.get('/api/health', (_req: express.Request, res: express.Response) => {
  res.json({ status: 'OK' });
});

app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error(err);
    res
      .status(err.status || 500)
      .json({ error: err.message || 'Internal Server Error' });
  },
);

export default app;
