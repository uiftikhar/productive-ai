/**
 * Utilities for visualizing LangGraph workflows
 */

import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';

/**
 * Graph metadata interface for visualization
 */
export interface GraphMetadata {
  title: string;
  nodes: Array<{
    id: string;
    type: 'start' | 'end' | 'process' | 'conditional';
    description?: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    condition?: string;
  }>;
}

/**
 * Extract metadata from a graph for visualization
 * @param graph The graph object to extract metadata from
 * @param title Title for the visualization
 * @param nodeDescriptions Optional descriptions for nodes
 */
export function extractGraphMetadata(
  graph: any,
  title: string = 'LangGraph Workflow',
  nodeDescriptions: Record<string, string> = {}
): GraphMetadata {
  // Default node descriptions
  const defaultDescriptions: Record<string, string> = {
    "__start__": "Starting point of the workflow",
    "__end__": "End point of the workflow",
    "initialize": "Initializes the workflow state",
    "process_chunk": "Processes a chunk of the input data",
    "check_chunks": "Checks if there are more chunks to process",
    "generate_final_analysis": "Generates the final analysis from processed chunks",
    "store_results": "Stores the analysis results",
    "handle_error": "Handles any errors that occur during processing",
    "prepare": "Prepares the task for execution",
    "execute": "Executes the main task logic",
    "finalize": "Finalizes the task and cleans up resources",
    "error_handler": "Handles errors and determines retry strategy"
  };

  // Merge default and custom descriptions
  const descriptions = { ...defaultDescriptions, ...nodeDescriptions };

  // Extract nodes and edges
  let nodes: GraphMetadata['nodes'] = [];
  let edges: GraphMetadata['edges'] = [];

  try {
    // First try to extract vizData to get consistent data
    let vizData: any;
    if (typeof graph.get_graph === 'function') {
      vizData = graph.get_graph();
    } else if (typeof graph.getGraph === 'function') {
      vizData = graph.getGraph();
    } else if (graph.graph) {
      vizData = graph.graph;
    }
    
    // If we have vizData and it has nodes, use that for consistent node data
    if (vizData && vizData.nodes && Array.isArray(vizData.nodes)) {
      // Extract nodes from vizData
      for (const node of vizData.nodes) {
        let nodeType: 'start' | 'end' | 'process' | 'conditional' = 'process';
        
        if (node.id === '__start__') nodeType = 'start';
        else if (node.id === '__end__') nodeType = 'end';
        else if (node.id.includes('conditional')) nodeType = 'conditional';
        
        nodes.push({
          id: node.id,
          type: nodeType,
          description: descriptions[node.id] || `Node ${node.id}`
        });
      }
      
      // Extract edges from vizData
      if (vizData.edges && Array.isArray(vizData.edges)) {
        for (const edge of vizData.edges) {
          edges.push({
            source: edge.source,
            target: edge.target,
            condition: edge.conditional ? 'Conditional' : undefined
          });
        }
      }
    }
    // If we don't have vizData or it doesn't have nodes, fall back to graph structure
    else if (graph._graph) {
      // Extract from compiled graph
      const graphData = graph._graph;
      
      // Extract nodes
      for (const nodeId in graphData.nodes) {
        let nodeType: 'start' | 'end' | 'process' | 'conditional' = 'process';
        
        if (nodeId === '__start__') nodeType = 'start';
        else if (nodeId === '__end__') nodeType = 'end';
        else if (nodeId.includes('conditional')) nodeType = 'conditional';
        
        nodes.push({
          id: nodeId,
          type: nodeType,
          description: descriptions[nodeId] || `Node ${nodeId}`
        });
      }
      
      // Extract edges
      for (const edge of graphData.edges) {
        edges.push({
          source: edge.source,
          target: edge.target,
          condition: edge.condition ? 'Conditional' : undefined
        });
      }
    } 
    // If we have a state graph with internal structure
    else if (graph.nodes && graph.edges) {
      // Extract nodes
      for (const nodeId in graph.nodes) {
        let nodeType: 'start' | 'end' | 'process' | 'conditional' = 'process';
        
        if (nodeId === '__start__') nodeType = 'start';
        else if (nodeId === '__end__') nodeType = 'end';
        else if (nodeId.includes('conditional')) nodeType = 'conditional';
        
        nodes.push({
          id: nodeId,
          type: nodeType,
          description: descriptions[nodeId] || `Node ${nodeId}`
        });
      }
      
      // Extract edges
      for (const edge of graph.edges) {
        edges.push({
          source: edge.source,
          target: edge.target,
          condition: edge.condition ? 'Conditional' : undefined
        });
      }
    }
    
    // If we still don't have any nodes, use default fallback
    if (nodes.length === 0) {
      // Use default metadata for unknown graph structure
      nodes = [
        { id: '__start__', type: 'start', description: 'Start of workflow' },
        { id: 'process', type: 'process', description: 'Process node' },
        { id: '__end__', type: 'end', description: 'End of workflow' }
      ];
      
      edges = [
        { source: '__start__', target: 'process' },
        { source: 'process', target: '__end__' }
      ];
    }
  } catch (error) {
    console.warn('Unable to extract graph structure:', error);
    // Provide fallback generic metadata
    nodes = [
      { id: '__start__', type: 'start', description: 'Start of workflow' },
      { id: 'process', type: 'process', description: 'Process node' },
      { id: '__end__', type: 'end', description: 'End of workflow' }
    ];
    
    edges = [
      { source: '__start__', target: 'process' },
      { source: 'process', target: '__end__' }
    ];
  }

  return {
    title,
    nodes,
    edges
  };
}

/**
 * Save visualization data for a LangGraph instance
 * @param graph The compiled graph to visualize
 * @param filename Name of the file to save (without extension)
 * @param outputDir Directory to save the file (defaults to ./visualizations)
 */
export async function saveGraphVisualization(
  graph: any,
  filename: string,
  outputDir: string = './visualizations'
): Promise<string> {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Get visualization data
  let vizData: string;
  try {
    // Check if it's a compiled graph with a `get_graph` method
    if (typeof graph.get_graph === 'function') {
      vizData = await graph.get_graph();
    } 
    // Check if it's a state graph with a `getGraph` method
    else if (typeof graph.getGraph === 'function') {
      vizData = await graph.getGraph();
    }
    // Try to directly retrieve it as a property if methods aren't available
    else if (graph.graph) {
      vizData = graph.graph;
    } else {
      throw new Error('Unable to extract graph visualization data');
    }
  } catch (error) {
    console.error('Error extracting graph visualization data:', error);
    throw error;
  }
  
  // Create full file path
  const filePath = path.join(outputDir, `${filename}.json`);
  
  // Save the visualization data
  fs.writeFileSync(filePath, JSON.stringify(vizData, null, 2));
  
  console.log(`Graph visualization saved to: ${filePath}`);
  return filePath;
}

/**
 * Generate HTML representation of a graph for direct rendering
 * @param graph The compiled graph to visualize
 * @param title Title of the visualization
 * @param metadata Optional metadata to use instead of extracting from graph
 */
export async function generateGraphHtml(
  graph: any,
  title: string = 'LangGraph Visualization',
  metadata?: GraphMetadata
): Promise<string> {
  // Get visualization data
  let vizData: any;
  try {
    // Check if it's a compiled graph with a `get_graph` method
    if (typeof graph.get_graph === 'function') {
      vizData = await graph.get_graph();
    } 
    // Check if it's a state graph with a `getGraph` method
    else if (typeof graph.getGraph === 'function') {
      vizData = await graph.getGraph();
    }
    // Try to directly retrieve it as a property if methods aren't available
    else if (graph.graph) {
      vizData = graph.graph;
    } else {
      throw new Error('Unable to extract graph visualization data');
    }
  } catch (error) {
    console.error('Error extracting graph visualization data:', error);
    throw error;
  }

  // Extract or use provided metadata
  const graphMetadata = metadata || extractGraphMetadata(graph, title);

  // Ensure we have consistent node data between visualization and metadata
  let nodeData = graphMetadata.nodes;
  if (vizData && vizData.nodes && Array.isArray(vizData.nodes)) {
    // Create a mapping of node IDs from vizData for the table
    const nodeMap = new Map();
    vizData.nodes.forEach((node: { id: string, type?: string }) => {
      let nodeType = 'process';
      if (node.id === '__start__') nodeType = 'start';
      else if (node.id === '__end__') nodeType = 'end';
      else if (node.id.includes('conditional')) nodeType = 'conditional';
      
      // Lookup description from metadata if available
      const existingNode = graphMetadata.nodes.find(n => n.id === node.id);
      const description = existingNode ? existingNode.description : `Node ${node.id}`;
      
      nodeMap.set(node.id, {
        id: node.id,
        type: nodeType,
        description: description
      });
    });
    
    // Convert map to array
    nodeData = Array.from(nodeMap.values());
  }
  
  // Generate edge data from vizData if available
  let edgeData = graphMetadata.edges;
  if (vizData && vizData.edges && Array.isArray(vizData.edges)) {
    edgeData = vizData.edges.map((edge: { source: string, target: string, conditional?: boolean }) => ({
      source: edge.source,
      target: edge.target,
      condition: edge.conditional ? 'Conditional' : undefined
    }));
  }

  // Create HTML with embedded visualization
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>${graphMetadata.title}</title>
  <script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
  <script src="https://cdn.jsdelivr.net/npm/@langchain/langgraph-vizjs@0.0.1-alpha.2/dist/index.min.js"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      background-color: #f8f9fa;
    }
    #header {
      width: 100%;
      background-color: #fff;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      padding: 20px 0;
      text-align: center;
    }
    h1 {
      margin: 0;
      color: #333;
    }
    .container {
      width: 90%;
      max-width: 1400px;
      margin: 20px auto;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    #graph {
      width: 100%;
      height: 600px;
      border: 1px solid #ddd;
      border-radius: 8px;
      background-color: #fff;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .info-box {
      background-color: #fff;
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 20px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
    }
    .controls {
      display: flex;
      justify-content: space-between;
      margin-bottom: 15px;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 10px;
    }
    .legend-item {
      display: flex;
      align-items: center;
      margin-right: 15px;
    }
    .legend-color {
      width: 15px;
      height: 15px;
      border-radius: 50%;
      margin-right: 5px;
    }
    .node-info {
      margin-top: 20px;
    }
    .node-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 10px;
    }
    .node-table th, .node-table td {
      border: 1px solid #ddd;
      padding: 8px 12px;
      text-align: left;
    }
    .node-table th {
      background-color: #f2f2f2;
    }
    .help-text {
      font-style: italic;
      color: #666;
      margin-top: 10px;
    }
    .selected-node {
      background-color: #e3f2fd;
    }
    button {
      padding: 8px 12px;
      background: #2196F3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }
    button:hover {
      background: #0b7dda;
    }
    .edge-list {
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div id="header">
    <h1>${graphMetadata.title}</h1>
  </div>
  
  <div class="container">
    <div class="info-box">
      <div class="controls">
        <h2>Workflow Visualization</h2>
        <div>
          <button id="resetView">Reset View</button>
          <button id="downloadSvg">Download SVG</button>
        </div>
      </div>
      <p>This visualization shows the workflow as a directed graph. Each node represents a processing step, and edges show the flow between steps.</p>
      
      <div class="legend">
        <h3>Legend:</h3>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #4CAF50;"></div>
          <span>Start</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #F44336;"></div>
          <span>End</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #2196F3;"></div>
          <span>Process Node</span>
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background-color: #FF9800;"></div>
          <span>Conditional Node</span>
        </div>
      </div>
      
      <div class="help-text">
        <p>Tip: You can zoom in/out using the mouse wheel and pan by clicking and dragging. Click on nodes to see more details.</p>
      </div>
    </div>
    
    <div id="graph"></div>
    
    <div class="info-box node-info">
      <h2>Process Nodes</h2>
      <p>Click on a node in the graph to see more details.</p>
      <div id="selectedNodeInfo"></div>
      
      <table class="node-table">
        <thead>
          <tr>
            <th>Node</th>
            <th>Type</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          ${nodeData.map(node => `
            <tr data-node-id="${node.id}" class="node-row">
              <td>${node.id}</td>
              <td>${node.type}</td>
              <td>${node.description || ''}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="edge-list">
        <h2>Connections</h2>
        <table class="node-table">
          <thead>
            <tr>
              <th>From</th>
              <th>To</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            ${edgeData.map(edge => `
              <tr>
                <td>${edge.source}</td>
                <td>${edge.target}</td>
                <td>${edge.condition ? 'Conditional' : 'Direct'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>
  
  <script>
    const vizData = ${JSON.stringify(vizData)};
    let viz;
    
    document.addEventListener('DOMContentLoaded', function() {
      viz = new LangGraphViz(document.getElementById('graph'));
      viz.drawGraph(vizData);
      
      // Add interactivity to the node table
      const nodeRows = document.querySelectorAll('.node-row');
      nodeRows.forEach(row => {
        row.addEventListener('click', () => {
          // Remove selected class from all rows
          nodeRows.forEach(r => r.classList.remove('selected-node'));
          
          // Add selected class to clicked row
          row.classList.add('selected-node');
          
          // Get node ID
          const nodeId = row.dataset.nodeId;
          
          // Highlight node in graph
          viz.highlightNode(nodeId);
          
          // Update selected node info
          const nodeInfo = nodesData.find(n => n.id === nodeId);
          if (nodeInfo) {
            updateSelectedNodeInfo(nodeInfo);
          }
        });
      });
      
      // Reset view button
      document.getElementById('resetView').addEventListener('click', () => {
        viz.resetView();
      });
      
      // Download SVG button
      document.getElementById('downloadSvg').addEventListener('click', () => {
        viz.downloadSVG('${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_graph');
      });
    });
    
    // Store the nodes and edges data as global variables
    const nodesData = ${JSON.stringify(nodeData)};
    const edgesData = ${JSON.stringify(edgeData)};
    
    function updateSelectedNodeInfo(node) {
      const infoDiv = document.getElementById('selectedNodeInfo');
      
      // Find incoming and outgoing edges
      const incomingEdges = edgesData.filter(e => e.target === node.id);
      const outgoingEdges = edgesData.filter(e => e.source === node.id);
      
      let html = \`
        <div style="padding: 15px; background: #f5f5f5; border-radius: 4px; margin: 15px 0;">
          <h3>\${node.id}</h3>
          <p><strong>Type:</strong> \${node.type}</p>
          <p><strong>Description:</strong> \${node.description || 'No description available'}</p>
          <p><strong>Incoming connections:</strong> \${incomingEdges.length > 0 ? incomingEdges.map(e => e.source).join(', ') : 'None'}</p>
          <p><strong>Outgoing connections:</strong> \${outgoingEdges.length > 0 ? outgoingEdges.map(e => e.target).join(', ') : 'None'}</p>
        </div>
      \`;
      
      infoDiv.innerHTML = html;
    }
  </script>
</body>
</html>
  `;
  
  return html;
}

/**
 * Create and save an HTML visualization of a graph
 * @param graph The compiled graph to visualize
 * @param filename Name of the file to save (without extension)
 * @param title Title of the visualization
 * @param outputDir Directory to save the file (defaults to ./visualizations)
 */
export async function saveGraphHtml(
  graph: any,
  filename: string,
  title: string = 'LangGraph Visualization',
  outputDir: string = './visualizations'
): Promise<string> {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Generate HTML
  const html = await generateGraphHtml(graph, title);
  
  // Create full file path
  const filePath = path.join(outputDir, `${filename}.html`);
  
  // Save the HTML
  fs.writeFileSync(filePath, html);
  
  console.log(`Graph HTML visualization saved to: ${filePath}`);
  return filePath;
}

/**
 * Create a debugging server to visualize a graph in real-time
 * @param graph The graph to visualize
 * @param port Port to run the server on (default: 3300)
 * @param title Title for the visualization
 */
export function createVisualizationServer(
  graph: any,
  port: number = 3300,
  title: string = 'LangGraph Visualization'
): http.Server {
  // Create a simple HTTP server
  const server = http.createServer(async (req, res) => {
    if (req.url === '/') {
      // Generate HTML visualization
      try {
        const html = await generateGraphHtml(graph, title);
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } catch (error) {
        console.error('Error generating visualization:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error generating visualization');
      }
    } else if (req.url === '/data') {
      // Endpoint to get updated graph data
      try {
        let vizData;
        // Check if it's a compiled graph with a `get_graph` method
        if (typeof graph.get_graph === 'function') {
          vizData = await graph.get_graph();
        } 
        // Check if it's a state graph with a `getGraph` method
        else if (typeof graph.getGraph === 'function') {
          vizData = await graph.getGraph();
        }
        // Try to directly retrieve it as a property if methods aren't available
        else if (graph.graph) {
          vizData = graph.graph;
        } else {
          throw new Error('Unable to extract graph visualization data');
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(vizData));
      } catch (error) {
        console.error('Error fetching graph data:', error);
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error fetching graph data');
      }
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    }
  });

  server.listen(port, () => {
    console.log(`LangGraph visualization server running at http://localhost:${port}/`);
  });

  return server;
} 