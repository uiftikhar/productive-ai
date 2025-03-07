import express from 'express';

import summaryRoutes from './routes/summary-generator.routes.js';

const app = express();

app.use(express.json());

app.use('/api/generate-summary', summaryRoutes);

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
