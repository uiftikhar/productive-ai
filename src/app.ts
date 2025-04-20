import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import path from 'path';
import fs from 'fs';

import { authRoutes } from './auth/index';
import { passportClient } from './database/index';
import { ticketGeneratorRoutes } from './jira-ticket-generator/jira-ticket-generator.routes';
import { summaryRoutes } from './summary-generator/index';

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

// Serve static files from the visualizations directory
const visualizationsPath = path.join(process.cwd(), 'visualizations');
console.log('Serving visualizations from:', visualizationsPath);

// First, add a direct handler for visualization HTML files
app.get('/visualizations/:filename', (req, res, next) => {
  const filename = req.params.filename;
  if (!filename.endsWith('.html')) {
    return next(); // Not an HTML file, let express.static handle it
  }

  const filePath = path.join(visualizationsPath, filename);
  console.log('Directly serving visualization HTML file:', filePath);

  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error('Visualization file not found:', filePath);
    return res.status(404).send('Visualization not found');
  }

  res.sendFile(filePath);
});

// Then set up static serving as a fallback
app.use(
  '/visualizations',
  express.static(visualizationsPath, {
    index: false,
    extensions: ['html'],
    setHeaders: (res, path) => {
      if (path.endsWith('.html')) {
        res.setHeader('Content-Type', 'text/html');
      }
    },
  }),
);

app.use('/auth', authRoutes);
app.use('/api/generate-summary', summaryRoutes);
app.use('/api/generate-tickets', ticketGeneratorRoutes);

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
