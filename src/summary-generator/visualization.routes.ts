import { Router } from 'express';
import { Request, Response } from 'express';
import { LangChainTracer } from 'langchain/callbacks';
import path from 'path';

const router = Router();

// Serve the visualization HTML page
router.get('/', (req: Request, res: Response) => {
  const traceId = req.query.traceId as string;

  if (!traceId) {
    return res.status(400).send('Missing traceId parameter');
  }

  // Serve a simple HTML page that loads the LangChain visualization
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Agent Visualization</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        h1 { color: #333; }
        #visualization { width: 100%; height: 80vh; border: 1px solid #ddd; }
      </style>
    </head>
    <body>
      <h1>Meeting Analysis Visualization</h1>
      <p>Trace ID: ${traceId}</p>
      <div id="visualization"></div>
      <script src="https://cdn.jsdelivr.net/npm/langchain@latest/visualization.js"></script>
      <script>
        // Load the LangChain visualization
        document.addEventListener('DOMContentLoaded', function() {
          const container = document.getElementById('visualization');
          LangChainVisualization.load({
            traceId: '${traceId}',
            container
          });
        });
      </script>
    </body>
    </html>
  `);
});

// API endpoint to get trace data
router.get('/api/trace/:traceId', async (req: Request, res: Response) => {
  try {
    const traceId = req.params.traceId;
    const tracer = new LangChainTracer();

    // Use convertToRunTree which is available in the API
    const runTree = tracer.convertToRunTree(traceId);

    res.json(runTree || { error: 'Trace not found' });
  } catch (error) {
    console.error('Error retrieving trace data:', error);
    res.status(500).json({ error: 'Failed to retrieve trace data' });
  }
});

export { router as visualizationRoutes };
