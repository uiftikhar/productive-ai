import type {
  Request,
  Response,
} from 'express';
import express from 'express';

import summaryRoutes from './routes/summary-generator.routes.ts';

const app = express();

app.use(express.json());

app.use('/api/generate-summary', summaryRoutes);

app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'OK' });
})

app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

export default app;