import { Router } from 'express';
import { Request, Response } from 'express';
import { LangChainTracer } from 'langchain/callbacks';
import path from 'path';
import fs from 'fs';

const router = Router();

// Serve the visualization HTML page for LangChain traces
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

// Serve static LangGraph visualizations from the visualizations directory
router.get('/visualizations/:filename', (req: Request, res: Response) => {
  const filename = req.params.filename;
  const visualizationDir = path.join(process.cwd(), 'visualizations');
  const filePath = path.join(visualizationDir, filename);
  
  // Security check - make sure we're only serving HTML files from the visualizations directory
  if (!filePath.startsWith(visualizationDir) || !filePath.endsWith('.html')) {
    return res.status(403).send('Access denied');
  }
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('Visualization not found');
  }
  
  // Serve the static visualization file
  res.sendFile(filePath);
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

// API endpoint to provide information about visualization options
router.get('/api/visualization-options', (req: Request, res: Response) => {
  try {
    const hasLangSmith = !!(process.env.LANGSMITH_API_KEY && process.env.LANGSMITH_PROJECT);
    
    res.json({
      options: {
        langgraph: {
          available: true,
          description: "Uses LangGraph for a visualized workflow of the meeting analysis process"
        },
        langsmith: {
          available: hasLangSmith,
          description: hasLangSmith 
            ? "Uses LangSmith for detailed tracing and debugging of the meeting analysis" 
            : "LangSmith is not configured - set LANGSMITH_API_KEY and LANGSMITH_PROJECT environment variables"
        }
      },
      usage: {
        langgraph: "Add ?langgraph=true to your API request",
        langsmith: hasLangSmith 
          ? "LangSmith tracing is automatically enabled when langgraph=true" 
          : "Not available"
      }
    });
  } catch (error) {
    console.error('Error retrieving visualization options:', error);
    res.status(500).json({ error: 'Failed to retrieve visualization options' });
  }
});

// Serve a dashboard of all available visualizations
router.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const visualizationDir = path.join(process.cwd(), 'visualizations');
    const hasLangSmith = !!(process.env.LANGSMITH_API_KEY && process.env.LANGSMITH_PROJECT);
    
    // Get list of visualization files
    let visualizationFiles: string[] = [];
    if (fs.existsSync(visualizationDir)) {
      const files = await fs.promises.readdir(visualizationDir);
      visualizationFiles = files.filter(file => file.endsWith('.html'));
    }
    
    // Generate HTML for the dashboard
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Meeting Analysis Visualizations</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 0; padding: 20px; line-height: 1.6; }
          h1, h2 { color: #333; }
          .container { max-width: 1200px; margin: 0 auto; }
          .card { border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin-bottom: 20px; background: #f9f9f9; }
          .options { display: flex; gap: 20px; flex-wrap: wrap; }
          .option { flex: 1; min-width: 300px; }
          .files { margin-top: 30px; }
          table { width: 100%; border-collapse: collapse; }
          table th, table td { text-align: left; padding: 12px; border-bottom: 1px solid #ddd; }
          table th { background: #f2f2f2; }
          .button { display: inline-block; background: #4CAF50; color: white; padding: 10px 15px; text-decoration: none; border-radius: 4px; }
          .no-files { padding: 20px; background: #f2f2f2; border-radius: 4px; text-align: center; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>Meeting Analysis Visualizations</h1>
          
          <div class="card">
            <h2>Visualization Options</h2>
            <div class="options">
              <div class="option">
                <h3>LangGraph</h3>
                <p>Visualizes the workflow of the meeting analysis process with a graph of nodes and edges.</p>
                <p><strong>Status:</strong> Available</p>
                <p><strong>Usage:</strong> Add <code>?langgraph=true</code> to your API request</p>
              </div>
              
              <div class="option">
                <h3>LangSmith</h3>
                <p>Provides detailed tracing and debugging of the meeting analysis process.</p>
                <p><strong>Status:</strong> ${hasLangSmith ? 'Available' : 'Not Configured'}</p>
                <p><strong>Usage:</strong> ${hasLangSmith 
                  ? 'Automatically enabled with LangGraph' 
                  : 'Set LANGSMITH_API_KEY and LANGSMITH_PROJECT environment variables'}</p>
              </div>
            </div>
          </div>
          
          <div class="files">
            <h2>Available Visualizations</h2>
            ${visualizationFiles.length > 0 ? `
              <table>
                <thead>
                  <tr>
                    <th>Visualization</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  ${visualizationFiles.map(file => {
                    const filePath = path.join(visualizationDir, file);
                    const stats = fs.statSync(filePath);
                    const created = new Date(stats.birthtime).toLocaleString();
                    const meetingId = file.replace('meeting-analysis-', '').replace('.html', '');
                    
                    return `
                      <tr>
                        <td>${file}</td>
                        <td>${created}</td>
                        <td>
                          <a href="/visualizations/${file}" target="_blank" class="button">View</a>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            ` : `
              <div class="no-files">
                <p>No visualizations available yet. Generate a meeting analysis with <code>?langgraph=true</code> to create visualizations.</p>
              </div>
            `}
          </div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Error generating visualization dashboard:', error);
    res.status(500).send('Error generating visualization dashboard');
  }
});

// Debug endpoint to check visualization directory structure
router.get('/debug', async (req: Request, res: Response) => {
  try {
    const visualizationDir = path.join(process.cwd(), 'visualizations');
    
    interface FileInfo {
      name: string;
      path: string;
      url: string;
      size: number;
      created: Date;
      isDirectory: boolean;
      isFile: boolean;
      exists: boolean;
    }
    
    interface DebugInfo {
      directory: string;
      exists: boolean;
      isDirectory: boolean;
      files: FileInfo[];
    }
    
    const debug: DebugInfo = {
      directory: visualizationDir,
      exists: fs.existsSync(visualizationDir),
      isDirectory: fs.existsSync(visualizationDir) ? fs.statSync(visualizationDir).isDirectory() : false,
      files: []
    };
    
    if (debug.exists && debug.isDirectory) {
      const files = await fs.promises.readdir(visualizationDir);
      debug.files = await Promise.all(files.map(async (file) => {
        const filePath = path.join(visualizationDir, file);
        const stats = fs.statSync(filePath);
        return {
          name: file,
          path: filePath,
          url: `/visualizations/${file}`,
          size: stats.size,
          created: stats.birthtime,
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
          exists: fs.existsSync(filePath)
        };
      }));
    }
    
    res.json(debug);
  } catch (error) {
    console.error('Error in debug endpoint:', error);
    res.status(500).json({ error: String(error) });
  }
});

export { router as visualizationRoutes };
