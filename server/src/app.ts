import dotenv from 'dotenv';
import express from 'express';
import session from 'express-session';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import http from 'http';

import { authRoutes } from './auth/index';
import { passportClient } from './database/index';
import { ticketGeneratorRoutes } from './api/routes/jira-ticket-generator.routes';
import { initializeApi } from './api/index';

// Import dependencies for API initialization
import { ConsoleLogger } from './shared/logger/console-logger';
import { UserContextFacade } from './shared/services/user-context/user-context.facade';
import { securityHeaders } from './chat/middleware/security-headers';
import { PerformanceMonitor } from './shared/services/monitoring/performance-monitor';
import { summaryRoutes } from './api/routes/summary-generator.routes';
import visualizationRoutes from './api/routes/visualization.routes';
import { initializeVisualizationWebSocket } from './api/controllers/visualization.controller';
import { OpenAIConnector } from './connectors/openai-connector';

dotenv.config();

const app = express();
// Create HTTP server for WebSocket support
const server = http.createServer(app);

// Configure CORS - this must be before any routes
app.use(
  cors({
    origin: process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:8080',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // Important for cookies/auth to work
  }),
);

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

// Serve static files from the public directory
app.use(express.static(path.join(process.cwd(), 'public')));

// Serve static files from the visualizations directory
const visualizationsPath = path.join(process.cwd(), 'visualizations');
console.log('Serving visualizations from:', visualizationsPath);

// Ensure the visualizations directory exists
if (!fs.existsSync(visualizationsPath)) {
  fs.mkdirSync(visualizationsPath, { recursive: true });
  console.log('Created visualizations directory:', visualizationsPath);
}

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

// Initialize common services
const logger = new ConsoleLogger();
const userContextFacade = new UserContextFacade({
  logger,
});
const llmConnector = new OpenAIConnector({
  modelConfig: {
    model: process.env.OPENAI_MODEL || 'gpt-4o',
  },
  logger,
});
// const agentRegistry = AgentRegistryService.getInstance(logger);

// Initialize and register all API routes
// const apiRouter = initializeApi(
//   userContextFacade,
//   llmConnector,
//   agentRegistry,
//   logger,
// );

// Register auth and existing routes
app.use('/auth', authRoutes);
app.use('/api/generate-summary', summaryRoutes);
app.use('/api/generate-tickets', ticketGeneratorRoutes);

// Register visualization routes
app.use('/api/visualizations', visualizationRoutes);


// Register new API routes
// app.use('/api', apiRouter);

app.get('/api/health', (_req: express.Request, res: express.Response) => {
  res.json({ status: 'OK' });
});

// Initialize performance monitoring
const performanceMonitor = PerformanceMonitor.getInstance(logger);

// Apply security headers to all responses
app.use(securityHeaders());

// Add performance monitoring middleware
app.use(performanceMonitor.apiMonitoringMiddleware());

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

// Initialize WebSocket server for visualizations
initializeVisualizationWebSocket(server);

// Export both app and server
export { app, server };
export default app;
