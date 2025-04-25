/**
 * HTML template for workflow visualization
 * This template contains the client-side JavaScript for rendering the graph visualization
 */
export function generateGraphHtml(
  state: any,
  options: { title?: string } = {},
): string {
  const title = options.title || 'Workflow Visualization';
  const stateJSON = JSON.stringify(state);

  // Using a string variable instead of direct template literals to avoid TypeScript
  // trying to parse the embedded JavaScript in the template
  const htmlTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #333;
      background-color: #f8f9fa;
    }
    .container {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      padding: 1rem;
    }
    header {
      background-color: #fff;
      border-bottom: 1px solid #e1e4e8;
      padding: 1rem;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }
    h1 {
      margin: 0;
      font-size: 1.5rem;
      color: #24292e;
    }
    .content {
      display: flex;
      flex-direction: column;
      padding: 1rem;
    }
    .graph-container {
      flex: 1;
      background-color: white;
      border-radius: 6px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      overflow: hidden;
      position: relative;
      margin-bottom: 1rem;
      height: 70vh;
    }
    #graph {
      width: 100%;
      height: 100%;
    }
    .details-container {
      background-color: white;
      border-radius: 6px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.05);
      padding: 1rem;
    }
    .status {
      display: flex;
      align-items: center;
      margin-bottom: 0.5rem;
    }
    .status-indicator {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 0.5rem;
    }
    .status-indicator.completed {
      background-color: #28a745;
    }
    .status-indicator.executing {
      background-color: #007bff;
    }
    .status-indicator.ready {
      background-color: #17a2b8;
    }
    .status-indicator.error {
      background-color: #dc3545;
    }
    .status-indicator.unknown {
      background-color: #6c757d;
    }
    .status-text {
      font-weight: 500;
    }
    .metrics {
      margin-top: 1rem;
      border-top: 1px solid #e1e4e8;
      padding-top: 1rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      padding: 0.5rem;
      border-bottom: 1px solid #e1e4e8;
    }
    th {
      font-weight: 600;
    }
    
    /* Node styling */
    .node {
      cursor: pointer;
    }
    .node rect {
      stroke-width: 2px;
      stroke: #fff;
      rx: 4;
      ry: 4;
    }
    .node text {
      text-anchor: middle;
      font-size: 12px;
      fill: white;
      pointer-events: none;
      user-select: none;
      font-weight: bold;
    }
    
    /* Node type styling */
    .node[data-type="start"] rect {
      fill: #9c59f0;
    }
    .node[data-type="end"] rect {
      fill: #9c59f0;
    }
    .node[data-type="agent"] rect {
      fill: #ff7675;
    }
    .node[data-type="process"] rect {
      fill: #0984e3;
    }
    .node[data-type="orchestrator"] rect {
      fill: #00b894;
    }
    .node[data-type="intent"] rect {
      fill: #fd79a8;
    }
    .node[data-type="retrieval"] rect {
      fill: #00cec9;
    }
    .node[data-type="transform"] rect {
      fill: #6c5ce7;
    }
    .node[data-status="error"] rect {
      fill: #d63031;
    }
    
    /* Edge styling */
    .link {
      fill: none;
      stroke: #55efc4;
      stroke-opacity: 0.8;
      stroke-width: 2px;
      marker-end: url(#arrowhead);
    }
    
    /* Tooltip styling */
    .tooltip {
      position: absolute;
      background-color: rgba(255, 255, 255, 0.95);
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      pointer-events: none;
      font-size: 12px;
      max-width: 300px;
      transition: opacity 0.2s;
      opacity: 0;
      z-index: 1000;
    }
    .tooltip h4 {
      margin: 0 0 5px 0;
      font-size: 14px;
      border-bottom: 1px solid #eee;
      padding-bottom: 3px;
    }
    .tooltip p {
      margin: 3px 0;
    }
    .tooltip .label {
      font-weight: bold;
      margin-right: 5px;
    }
    .tooltip .value {
      word-break: break-word;
    }
    
    /* Connection status */
    #connection-status {
      position: fixed;
      bottom: 10px;
      right: 10px;
      padding: 5px 10px;
      border-radius: 4px;
      font-size: 12px;
    }
    .connected {
      background-color: #28a745;
      color: white;
    }
    .connecting {
      background-color: #ffc107;
      color: black;
    }
    .disconnected {
      background-color: #dc3545;
      color: white;
    }
    
    @media (min-width: 768px) {
      .content {
        flex-direction: row;
      }
      .graph-container {
        margin-right: 1rem;
        margin-bottom: 0;
        width: 70%;
      }
      .details-container {
        width: 30%;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>${title}</h1>
  </header>
  <div class="container">
    <div class="content">
      <div class="graph-container">
        <div id="graph"></div>
      </div>
      <div class="details-container">
        <div class="status">
          <div class="status-indicator" id="status-indicator"></div>
          <div class="status-text" id="status-text">Loading...</div>
        </div>
        <div id="details"></div>
        <div class="metrics" id="metrics"></div>
      </div>
    </div>
  </div>
  <div id="connection-status">Disconnected</div>
  
  <script>
    // State data from the server
    const stateData = ${stateJSON};
    
    // Update status indicator
    function updateStatus(status) {
      const indicator = document.getElementById('status-indicator');
      const text = document.getElementById('status-text');
      
      indicator.className = 'status-indicator ' + (status || 'unknown');
      text.textContent = status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
    }
    
    // Update connection status indicator
    function updateConnectionStatus(status) {
      const element = document.getElementById('connection-status');
      element.className = status;
      
      if (status === 'connected') {
        element.textContent = 'Connected';
      } else if (status === 'connecting') {
        element.textContent = 'Connecting...';
      } else {
        element.textContent = 'Disconnected';
      }
    }
    
    // Render state details
    function renderDetails(data) {
      const container = document.getElementById('details');
      container.innerHTML = '';
      
      const entries = [];
      
      if (data.runId) {
        entries.push({ label: 'Run ID', value: data.runId });
      }
      
      if (data.agentId) {
        entries.push({ label: 'Agent', value: data.agentId });
      }
      
      if (data.capability) {
        entries.push({ label: 'Capability', value: data.capability });
      }
      
      if (data.metadata && data.metadata.currentNode) {
        entries.push({ label: 'Current Node', value: data.metadata.currentNode });
      }
      
      if (data.startTime) {
        const startDate = new Date(data.startTime);
        entries.push({ 
          label: 'Start Time', 
          value: startDate.toLocaleString() 
        });
      }
      
      if (data.endTime) {
        const endDate = new Date(data.endTime);
        entries.push({ 
          label: 'End Time', 
          value: endDate.toLocaleString() 
        });
        
        if (data.startTime) {
          const duration = Math.round((data.endTime - data.startTime) / 1000);
          entries.push({ 
            label: 'Duration', 
            value: duration + ' seconds' 
          });
        }
      }
      
      const table = document.createElement('table');
      entries.forEach(entry => {
        const row = document.createElement('tr');
        
        const labelCell = document.createElement('th');
        labelCell.textContent = entry.label;
        row.appendChild(labelCell);
        
        const valueCell = document.createElement('td');
        valueCell.textContent = entry.value;
        row.appendChild(valueCell);
        
        table.appendChild(row);
      });
      
      container.appendChild(table);
    }
    
    // Render metrics
    function renderMetrics(metrics) {
      if (!metrics) return;
      
      const container = document.getElementById('metrics');
      container.innerHTML = '<h3>Metrics</h3>';
      
      const table = document.createElement('table');
      
      Object.entries(metrics).forEach(([key, value]) => {
        const row = document.createElement('tr');
        
        const labelCell = document.createElement('th');
        labelCell.textContent = key
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, str => str.toUpperCase());
        row.appendChild(labelCell);
        
        const valueCell = document.createElement('td');
        valueCell.textContent = value;
        row.appendChild(valueCell);
        
        table.appendChild(row);
      });
      
      container.appendChild(table);
    }
    
    // Render the graph
    function renderGraph(data) {
      const width = document.getElementById('graph').offsetWidth;
      const height = document.getElementById('graph').offsetHeight;
      
      // Create SVG
      const svg = d3.select('#graph')
        .append('svg')
        .attr('width', width)
        .attr('height', height)
        .append('g')
        .attr('transform', 'translate(50,50)');
        
      // Define arrow marker
      svg.append('defs')
        .append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 20)
        .attr('refY', 0)
        .attr('orient', 'auto')
        .attr('markerWidth', 8)
        .attr('markerHeight', 8)
        .attr('xoverflow', 'visible')
        .append('path')
        .attr('d', 'M 0,-5 L 10,0 L 0,5')
        .attr('fill', '#55efc4')
        .attr('stroke', 'none');
        
      // Generate graph data
      const graphData = generateGraphData(data);
      
      // Create hierarchical layout
      const treeLayout = d3.tree()
        .size([width - 100, height - 100])
        .nodeSize([120, 100])
        .separation((a, b) => a.parent === b.parent ? 1.5 : 2);
        
      // Apply layout to data
      const root = d3.hierarchy(graphData.root);
      treeLayout(root);
      
      // Create tooltip
      const tooltip = d3.select('body')
        .append('div')
        .attr('class', 'tooltip');
        
      // Create links
      const link = svg.selectAll('.link')
        .data(root.links())
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('d', d3.linkVertical()
          .x(d => d.x)
          .y(d => d.y));
          
      // Create nodes
      const node = svg.selectAll('.node')
        .data(root.descendants())
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('transform', d => \`translate(\${d.x},\${d.y})\`)
        .attr('data-type', d => d.data.type)
        .attr('data-status', d => d.data.status)
        .on('mouseover', function(event, d) {
          // Show tooltip with enhanced info
          const nodeData = d.data;
          const tooltipContent = \`
            <h4>\${nodeData.label}</h4>
            <p><span class="label">Type:</span> <span class="value">\${nodeData.type}</span></p>
            \${nodeData.status ? \`<p><span class="label">Status:</span> <span class="value">\${nodeData.status}</span></p>\` : ''}
            \${nodeData.description ? \`<p><span class="label">Description:</span> <span class="value">\${nodeData.description}</span></p>\` : ''}
            \${nodeData.agentId ? \`<p><span class="label">Agent:</span> <span class="value">\${nodeData.agentId}</span></p>\` : ''}
            \${nodeData.capability ? \`<p><span class="label">Capability:</span> <span class="value">\${nodeData.capability}</span></p>\` : ''}
            \${nodeData.executionTime ? \`<p><span class="label">Execution Time:</span> <span class="value">\${nodeData.executionTime}ms</span></p>\` : ''}
          \`;
          
          tooltip.html(tooltipContent)
            .style('left', (event.pageX + 10) + 'px')
            .style('top', (event.pageY - 28) + 'px')
            .style('opacity', 1);
            
          // Highlight node
          d3.select(this).select('rect')
            .style('stroke', '#ffd166')
            .style('stroke-width', '3px');
        })
        .on('mouseout', function() {
          // Hide tooltip
          tooltip.style('opacity', 0);
          
          // Reset highlight
          d3.select(this).select('rect')
            .style('stroke', '#fff')
            .style('stroke-width', '2px');
        });
        
      // Add rectangles to nodes
      node.append('rect')
        .attr('width', 100)
        .attr('height', 40)
        .attr('x', -50)
        .attr('y', -20);
        
      // Add text to nodes
      node.append('text')
        .attr('dy', '0.35em')
        .text(d => d.data.label);
        
      // Center the graph
      const rootNode = root.descendants()[0];
      svg.attr('transform', \`translate(\${width / 2 - rootNode.x},\${100})\`);
      
      // Add zoom behavior
      const zoom = d3.zoom()
        .scaleExtent([0.5, 3])
        .on('zoom', event => {
          svg.attr('transform', event.transform);
        });
        
      d3.select('#graph > svg').call(zoom);
    }
    
    // Generate structured graph data from state
    function generateGraphData(state) {
      // Create the root node of the graph (workflow start)
      const root = {
        id: 'start',
        label: '▶ Start',
        type: 'start',
        status: 'completed',
        children: []
      };
      
      // Create master orchestrator node
      const orchestratorNode = {
        id: 'master_orchestrator',
        label: 'Master Orchestrator',
        type: 'orchestrator',
        description: 'Coordinates the overall workflow execution',
        status: state.status === 'ERROR' ? 'error' : 'completed',
        children: []
      };
      root.children.push(orchestratorNode);
      
      // First create intent detection node
      const intentNode = {
        id: 'detect_intent',
        label: 'Detect Intent',
        type: 'intent',
        description: 'Identifies meeting analysis intent',
        status: 'completed',
        children: []
      };
      orchestratorNode.children.push(intentNode);
      
      // Create the agent selection node
      const agentSelectionNode = {
        id: 'agent_selection',
        label: 'Meeting Analysis Agent',
        type: 'agent',
        description: 'Specialized agent for analyzing meeting transcripts',
        status: 'completed',
        children: []
      };
      intentNode.children.push(agentSelectionNode);
      
      // Create chunk splitting node
      const splitNode = {
        id: 'split_transcript',
        label: 'Split Transcript',
        type: 'process',
        description: 'Divides transcript into manageable chunks',
        status: 'completed',
        children: []
      };
      agentSelectionNode.children.push(splitNode);
      
      // Create processing pipeline for chunks
      const processingNode = {
        id: 'process_chunks',
        label: 'Process Chunks',
        type: 'process',
        description: 'Processes each transcript chunk sequentially',
        status: state.currentChunkIndex >= state.chunks?.length ? 'completed' : 'executing',
        children: []
      };
      splitNode.children.push(processingNode);
      
      // Create retrievalNode for RAG
      const retrievalNode = {
        id: 'retrieval',
        label: 'Retrieve',
        type: 'retrieval',
        description: 'Fetches relevant context for analysis',
        status: 'completed',
        children: []
      };
      processingNode.children.push(retrievalNode);
      
      // Create transform node
      const transformNode = {
        id: 'transform',
        label: 'Transform Docs',
        type: 'transform',
        description: 'Prepares data for LLM processing',
        status: 'completed',
        children: []
      };
      retrievalNode.children.push(transformNode);
      
      // Create LLM analysis node
      const llmNode = {
        id: 'llm_analysis',
        label: 'LLM Answer',
        type: 'agent',
        description: 'Generates partial analysis using language model',
        status: 'completed',
        children: []
      };
      transformNode.children.push(llmNode);
      
      // Create chunk combining node
      const combineNode = {
        id: 'combine_analyses',
        label: 'Combine Analyses',
        type: 'transform',
        description: 'Merges partial analyses from all chunks',
        status: state.partialAnalyses?.length === state.chunks?.length ? 'completed' : 'ready',
        children: []
      };
      llmNode.children.push(combineNode);
      
      // Create final analysis node
      const finalAnalysisNode = {
        id: 'final_analysis',
        label: 'Final Analysis',
        type: 'process',
        description: 'Generates comprehensive meeting analysis',
        status: state.analysisResult ? 'completed' : 'ready',
        children: []
      };
      combineNode.children.push(finalAnalysisNode);
      
      // Create results node with branches for different analysis components
      const resultsNode = {
        id: 'format_results',
        label: 'Format Results',
        type: 'transform',
        description: 'Prepares analysis for presentation',
        status: state.analysisResult ? 'completed' : 'ready',
        children: []
      };
      finalAnalysisNode.children.push(resultsNode);
      
      // Add specific result component nodes
      const resultComponents = [
        {
          id: 'summary',
          label: 'Summary',
          type: 'process',
          description: 'Meeting summary and key points',
          status: state.status === 'COMPLETED' ? 'completed' : 'ready'
        },
        {
          id: 'action_items',
          label: 'Action Items',
          type: 'process', 
          description: 'Tasks and follow-ups from meeting',
          status: state.status === 'COMPLETED' ? 'completed' : 'ready'
        },
        {
          id: 'topics',
          label: 'Topics',
          type: 'process',
          description: 'Main discussion topics from meeting',
          status: state.status === 'COMPLETED' ? 'completed' : 'ready'
        }
      ];
      
      // Add each result component as a child of the results node
      resultComponents.forEach(component => {
        component.children = [];
        resultsNode.children.push(component);
      });
      
      // Add end node
      const endNode = {
        id: 'end',
        label: '◼ End',
        type: 'end',
        status: state.status === 'COMPLETED' ? 'completed' : 'ready'
      };
      
      // Connect all result components to the end node
      resultComponents.forEach(component => {
        component.children = [endNode];
      });
      
      // Add error node if there are errors
      if (state.status === 'ERROR' || (state.errors && state.errors.length > 0)) {
        const errorNode = {
          id: 'error',
          label: 'Error',
          type: 'error',
          status: 'error',
          description: state.errors && state.errors.length > 0 ? 
            state.errors[state.errors.length - 1].message : 'An error occurred',
          children: [endNode]
        };
        
        // Add error node as a child of the appropriate node based on where the error occurred
        if (state.metadata && state.metadata.currentNode) {
          const currentNode = state.metadata.currentNode;
          if (currentNode === 'process_chunk') {
            processingNode.children = [errorNode];
          } else if (currentNode === 'generate_final_analysis') {
            combineNode.children = [errorNode];
          } else {
            orchestratorNode.children.push(errorNode);
          }
        } else {
          orchestratorNode.children.push(errorNode);
        }
      }
      
      return { root };
    }
    
    // Initialize the visualization
    function init() {
      // Render the initial graph
      renderGraph(stateData);
      
      // Update status and details
      updateStatus(stateData.status);
      renderDetails(stateData);
      renderMetrics(stateData.metrics);
      
      // Attempt to connect to real-time updates
      connectToWebSocket();
    }
    
    // Connect to WebSocket for real-time updates
    function connectToWebSocket() {
      if (!stateData.runId) return;
      
      updateConnectionStatus('connecting');
      
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const ws = new WebSocket(\`\${protocol}//\${host}/ws/visualization/\${stateData.runId}\`);
      
      ws.onopen = function() {
        updateConnectionStatus('connected');
      };
      
      ws.onmessage = function(event) {
        try {
          const data = JSON.parse(event.data);
          
          // Update the visualization with new data
          updateStatus(data.status);
          renderDetails(data);
          renderMetrics(data.metrics);
          
          // Update node status in the graph
          if (data.metadata && data.metadata.currentNode) {
            // You could implement graph updates here
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };
      
      ws.onclose = function() {
        updateConnectionStatus('disconnected');
        setTimeout(connectToWebSocket, 5000); // Retry connection after 5 seconds
      };
      
      ws.onerror = function() {
        updateConnectionStatus('disconnected');
      };
    }
    
    // Start the visualization
    init();
  </script>
</body>
</html>`;

  return htmlTemplate;
}
