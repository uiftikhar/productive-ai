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

  return `<!DOCTYPE html>
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
    .node {
      cursor: pointer;
    }
    .node circle {
      stroke-width: 2px;
      stroke: #fff;
    }
    .node text {
      text-anchor: middle;
      font-size: 12px;
      pointer-events: none;
      user-select: none;
    }
    .node[data-type="workflow"] circle {
      fill: #6f42c1;
    }
    .node[data-type="agent"] circle {
      fill: #28a745;
    }
    .node[data-type="process"] circle {
      fill: #007bff;
    }
    .node[data-status="error"] circle {
      fill: #dc3545;
    }
    .link {
      fill: none;
      stroke: #999;
      stroke-opacity: 0.6;
      stroke-width: 1.5px;
    }
    #tooltip {
      position: absolute;
      background-color: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      padding: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      pointer-events: none;
      display: none;
      max-width: 300px;
      z-index: 1000;
    }
    #tooltip pre {
      max-height: 200px;
      overflow: auto;
      margin: 5px 0;
      background-color: #f6f8fa;
      padding: 5px;
      border-radius: 3px;
    }
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
        <div id="tooltip"></div>
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
    function renderDetails(state) {
      const container = document.getElementById('details');
      let html = '<table>';
      
      // Add key state properties
      html += '<tr><th>Run ID:</th><td>' + (state.runId || 'N/A') + '</td></tr>';
      html += '<tr><th>Start Time:</th><td>' + formatTime(state.startTime) + '</td></tr>';
      html += '<tr><th>Duration:</th><td>' + formatDurationStr(getDuration(state)) + '</td></tr>';
      
      if (state.meetingId) {
        html += '<tr><th>Meeting ID:</th><td>' + state.meetingId + '</td></tr>';
      }
      
      if (state.chunks) {
        html += '<tr><th>Chunks:</th><td>' + state.chunks.length + '</td></tr>';
        html += '<tr><th>Current Chunk:</th><td>' + (state.currentChunkIndex + 1) + ' / ' + state.chunks.length + '</td></tr>';
      }
      
      html += '</table>';
      container.innerHTML = html;
      
      // Render metrics
      renderMetrics(state);
    }
    
    // Render metrics
    function renderMetrics(state) {
      if (!state.metrics) return;
      
      const container = document.getElementById('metrics');
      let html = '<h3>Metrics</h3><table>';
      
      if (state.metrics.executionTimeMs) {
        html += '<tr><th>Execution Time:</th><td>' + formatDurationStr(state.metrics.executionTimeMs) + '</td></tr>';
      }
      
      if (state.metrics.tokensUsed) {
        html += '<tr><th>Tokens Used:</th><td>' + state.metrics.tokensUsed.toLocaleString() + '</td></tr>';
      }
      
      html += '</table>';
      container.innerHTML = html;
    }
    
    // Format timestamp
    function formatTime(timestamp) {
      if (!timestamp) return 'N/A';
      return new Date(timestamp).toLocaleString();
    }
    
    // Get duration from state
    function getDuration(state) {
      if (!state.startTime) return 0;
      const endTime = state.endTime || Date.now();
      return endTime - state.startTime;
    }
    
    // Format duration string
    function formatDurationStr(ms) {
      if (!ms) return 'N/A';
      
      if (ms < 1000) {
        return ms + 'ms';
      } else if (ms < 60000) {
        return (ms / 1000).toFixed(2) + 's';
      } else {
        const minutes = Math.floor(ms / 60000);
        const seconds = ((ms % 60000) / 1000).toFixed(0);
        return minutes + 'm ' + seconds + 's';
      }
    }
    
    // WebSocket connection for real-time updates
    let wsConnection = null;
    
    // Function to initialize WebSocket connection for real-time updates
    function initializeWebSocket() {
      // WebSocket initialization logic
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = \`\${protocol}//\${window.location.host}/visualization/\${stateData.runId}\`;
      
      try {
        wsConnection = new WebSocket(wsUrl);
        
        wsConnection.onopen = () => {
          console.log('WebSocket connection established');
          updateConnectionStatus('connected');
        };
        
        wsConnection.onmessage = (event) => {
          try {
            const updateData = JSON.parse(event.data);
            if (updateData && updateData.runId === stateData.runId) {
              // Update relevant parts of the state
              Object.assign(stateData, updateData);
              // Refresh the graph
              createGraph();
              // Update status and details
              updateStatus(stateData.status);
              renderDetails(stateData);
            }
          } catch (error) {
            console.error('Error processing WebSocket message:', error);
          }
        };
        
        wsConnection.onerror = (error) => {
          console.error('WebSocket error:', error);
          updateConnectionStatus('disconnected');
        };
        
        wsConnection.onclose = () => {
          console.log('WebSocket connection closed');
          updateConnectionStatus('disconnected');
        };
      } catch (e) {
        console.error('Failed to initialize WebSocket:', e);
        updateConnectionStatus('disconnected');
      }
    }
    
    // Create the graph visualization
    function createGraph() {
      // Clear any existing SVG
      d3.select('#graph').selectAll('svg').remove();
      
      const container = document.getElementById('graph');
      const width = container.clientWidth;
      const height = container.clientHeight;
      
      const svg = d3.select('#graph')
        .append('svg')
        .attr('width', width)
        .attr('height', height);
      
      // Create a group for the graph
      const g = svg.append('g');
      
      // Add zoom behavior
      const zoom = d3.zoom()
        .scaleExtent([0.3, 5])
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        });
      
      svg.call(zoom);
      
      // Center the graph initially
      svg.call(zoom.transform, d3.zoomIdentity.translate(width / 2, height / 2).scale(0.8));
      
      // Generate graph elements from the state data
      const graphElements = generateGraphElements(stateData);
      
      // Create a force simulation
      const simulation = d3.forceSimulation(graphElements.nodes)
        .force('link', d3.forceLink(graphElements.links).id(d => d.id).distance(120))
        .force('charge', d3.forceManyBody().strength(-800))
        .force('x', d3.forceX(0))
        .force('y', d3.forceY(0))
        .on('tick', ticked);
      
      // Add links
      const link = g.append('g')
        .attr('class', 'links')
        .selectAll('path')
        .data(graphElements.links)
        .enter()
        .append('path')
        .attr('class', 'link')
        .attr('marker-end', 'url(#arrowhead)');
      
      // Define arrow marker
      svg.append('defs').append('marker')
        .attr('id', 'arrowhead')
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 22)
        .attr('refY', 0)
        .attr('markerWidth', 6)
        .attr('markerHeight', 6)
        .attr('orient', 'auto')
        .append('path')
        .attr('d', 'M0,-5L10,0L0,5');
      
      // Add nodes
      const node = g.append('g')
        .attr('class', 'nodes')
        .selectAll('g')
        .data(graphElements.nodes)
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('data-type', d => d.type || 'default')
        .attr('data-status', d => d.status || 'normal')
        .call(d3.drag()
          .on('start', dragstarted)
          .on('drag', dragged)
          .on('end', dragended));
      
      // Add node circles
      node.append('circle')
        .attr('r', d => getNodeRadius(d))
        .on('mouseover', showTooltip)
        .on('mousemove', moveTooltip)
        .on('mouseout', hideTooltip);
      
      // Add node labels
      node.append('text')
        .text(d => d.label)
        .attr('dy', 4)
        .style('font-size', d => {
          // Adjust font size based on node type
          if (d.type === 'workflow') return '16px';
          if (d.type === 'supervisor') return '14px';
          return '13px';
        });
      
      // Function to determine node radius based on type
      function getNodeRadius(d) {
        switch(d.type) {
          case 'workflow': return 45;
          case 'supervisor': return 40;
          case 'specialized-agent': return 35;
          case 'input-data': return 30;
          case 'process': return 30;
          case 'intermediate-result': return 30;
          case 'final-result': return 35;
          default: return 25;
        }
      }
      
      // Tooltip functions
      function showTooltip(event, d) {
        const tooltip = d3.select('#tooltip');
        
        let content = '<strong>' + d.label + '</strong>';
        if (d.description) {
          content += '<br/>' + d.description;
        }
        if (d.status) {
          content += '<br/><strong>Status:</strong> ' + d.status;
        }
        if (d.data) {
          content += '<br/><pre>' + JSON.stringify(d.data, null, 2) + '</pre>';
        }
        
        tooltip.html(content)
          .style('display', 'block')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px');
      }
      
      function moveTooltip(event) {
        d3.select('#tooltip')
          .style('left', (event.pageX + 10) + 'px')
          .style('top', (event.pageY + 10) + 'px');
      }
      
      function hideTooltip() {
        d3.select('#tooltip').style('display', 'none');
      }
      
      // Simulation functions
      function ticked() {
        link.attr('d', d => {
          const dx = d.target.x - d.source.x;
          const dy = d.target.y - d.source.y;
          const dr = Math.sqrt(dx * dx + dy * dy);
          
          // Calculate the total radius (source radius + target radius)
          const sourceRadius = getNodeRadius(d.source);
          const targetRadius = getNodeRadius(d.target);
          
          // Calculate the start and end points adjusted by the node radii
          const offsetX = dx * sourceRadius / dr;
          const offsetY = dy * sourceRadius / dr;
          const startX = d.source.x + offsetX;
          const startY = d.source.y + offsetY;
          
          // Shorter path to target to account for arrow
          const endOffsetX = dx * (targetRadius + 5) / dr;
          const endOffsetY = dy * (targetRadius + 5) / dr;
          const endX = d.target.x - endOffsetX;
          const endY = d.target.y - endOffsetY;
          
          return 'M' + startX + ',' + startY + 'L' + endX + ',' + endY;
        });
        
        node.attr('transform', d => 'translate(' + d.x + ',' + d.y + ')');
      }
      
      function dragstarted(event, d) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }
      
      function dragged(event, d) {
        d.fx = event.x;
        d.fy = event.y;
      }
      
      function dragended(event, d) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }
    }
    
    // Generate graph elements from the state data
    function generateGraphElements(state) {
      const nodes = [];
      const links = [];
      
      // Add workflow node
      nodes.push({
        id: 'workflow',
        label: 'Workflow',
        type: 'workflow',
        status: state.status,
        data: { type: 'workflow', runId: state.runId, status: state.status }
      });
      
      // Add master orchestrator/supervisor node
      nodes.push({
        id: 'orchestrator',
        label: 'Master Orchestrator',
        type: 'agent',
        data: { type: 'supervisor', phase: state.currentPhase || 'orchestration' }
      });
      
      // Link workflow to orchestrator
      links.push({
        source: 'workflow',
        target: 'orchestrator',
        active: true
      });
      
      // Add meeting analysis agent node
      nodes.push({
        id: 'meeting-analysis',
        label: 'Meeting Analysis Agent',
        type: 'agent',
        data: { type: 'specialized-agent', specialty: 'meeting analysis' }
      });
      
      // Link orchestrator to meeting analysis agent
      links.push({
        source: 'orchestrator',
        target: 'meeting-analysis',
        active: true
      });
      
      // Add data flow nodes
      nodes.push({
        id: 'input-data',
        label: 'Meeting Transcript',
        type: 'process',
        status: 'active',
        data: { type: 'input-data' }
      });
      
      // Link input data to workflow
      links.push({
        source: 'input-data',
        target: 'workflow',
        active: true
      });
      
      // Add analysis tasks based on meeting chunks
      if (state.chunks && state.chunks.length > 0) {
        // Represent chunk processing
        nodes.push({
          id: 'chunk-processing',
          label: 'Transcript Chunks',
          type: 'process',
          status: state.currentChunkIndex < state.chunks.length ? 'active' : 'complete',
          data: { 
            type: 'process', 
            currentChunk: state.currentChunkIndex, 
            totalChunks: state.chunks.length 
          }
        });
        
        // Link orchestrator to chunk processing
        links.push({
          source: 'orchestrator',
          target: 'chunk-processing',
          active: true
        });
        
        // Link chunk processing to meeting analysis agent
        links.push({
          source: 'chunk-processing',
          target: 'meeting-analysis',
          active: true
        });
      }
      
      // Add response node if we have partial analyses
      if (state.partialAnalyses && state.partialAnalyses.length > 0) {
        nodes.push({
          id: 'partial-analyses',
          label: 'Partial Analyses',
          type: 'process',
          status: state.analysisResult ? 'complete' : 'active',
          data: { 
            type: 'intermediate-result', 
            count: state.partialAnalyses.length 
          }
        });
        
        // Link meeting analysis agent to partial analyses
        links.push({
          source: 'meeting-analysis',
          target: 'partial-analyses',
          active: true
        });
      }
      
      // Add final result node if available
      if (state.analysisResult) {
        nodes.push({
          id: 'final-result',
          label: 'Final Analysis',
          type: 'process',
          status: 'complete',
          data: { type: 'final-result' }
        });
        
        // Link partial analyses to final result
        if (state.partialAnalyses && state.partialAnalyses.length > 0) {
          links.push({
            source: 'partial-analyses',
            target: 'final-result',
            active: true
          });
        } else {
          // Direct link from meeting analysis agent if no partial analyses
          links.push({
            source: 'meeting-analysis',
            target: 'final-result',
            active: true
          });
        }
        
        // Link back to orchestrator
        links.push({
          source: 'final-result',
          target: 'orchestrator',
          active: true
        });
      }
      
      return { nodes, links };
    }
    
    // Initialize the page
    function initialize() {
      createGraph();
      initializeWebSocket();
      
      // Update status and details initially
      updateStatus(stateData.status);
      renderDetails(stateData);
      
      // Check if visualization is still in progress and enable auto-refresh
      if (stateData.status === 'executing' || stateData.status === 'ready') {
        // Only use auto-refresh as fallback if WebSocket isn't working
        setTimeout(() => {
          if (wsConnection?.readyState !== 1) { // Not OPEN
            console.log('WebSocket not connected, falling back to page refresh');
            window.location.reload();
          }
        }, 5000);
      }
    }
    
    // Call initialize when the page loads
    initialize();
  </script>
</body>
</html>`;
}
