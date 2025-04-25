/**
 * Graph renderer for visualizing LangGraph workflows
 */

export function generateGraphRenderer(graphData: any, containerId: string): string {
  return `
    // Global graph data variable will be defined in a separate script tag
    // or use the data directly provided to this function
    const graphData = ${graphData ? JSON.stringify(transformGraphData(graphData)) : 'window.LG_GRAPH_DATA'} || { nodes: [], edges: [] };
    
    // Initialize D3 graph renderer
    function initializeGraph() {
      try {
        const container = document.getElementById('${containerId || "graph-content"}');
        if (!container) {
          console.error('Container element not found');
          return;
        }
        
        // Get container dimensions
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        // Clear any existing content
        container.innerHTML = '';
        
        // If no nodes, display a friendly message
        if (!graphData.nodes || graphData.nodes.length === 0) {
          displayNoDataMessage(container);
          return;
        }
        
        // Create SVG element
        const svg = d3.select(container)
          .append("svg")
          .attr("width", "100%")
          .attr("height", "100%");
        
        // Add zoom behavior
        const zoomBehavior = d3.zoom()
          .scaleExtent([0.1, 3])
          .on("zoom", (event) => {
            mainGroup.attr("transform", event.transform);
          });
          
        svg.call(zoomBehavior);
        
        // Add a background rect to capture zoom events
        svg.append("rect")
          .attr("width", "100%")
          .attr("height", "100%")
          .attr("fill", "none")
          .attr("pointer-events", "all");
        
        // Create main group for graph elements
        const mainGroup = svg.append("g");
        
        // Create tooltip
        const tooltip = d3.select(container.parentNode)
          .append("div")
          .attr("class", "tooltip")
          .style("opacity", 0);
        
        // Add arrowhead marker
        svg.append("defs").append("marker")
          .attr("id", "arrowhead")
          .attr("viewBox", "0 -5 10 10")
          .attr("refX", 20)
          .attr("refY", 0)
          .attr("markerWidth", 6)
          .attr("markerHeight", 6)
          .attr("orient", "auto")
          .append("path")
          .attr("class", "graph-edge-arrow")
          .attr("d", "M0,-5L10,0L0,5");
        
        // Process nodes and edges
        const nodes = structureData(graphData.nodes, graphData.edges);
        
        // Set up dagre graph
        const g = new dagre.graphlib.Graph();
        g.setGraph({
          rankdir: 'TB',  // Top to bottom layout
          align: 'UL',    // Upstream left alignment
          nodesep: 70,    // Distance between nodes in the same rank (increased)
          ranksep: 100,   // Distance between ranks (increased)
          marginx: 30,    // Margin on x-axis (increased)
          marginy: 30,    // Margin on y-axis (increased)
          edgesep: 15,    // Edge separation
          ranker: 'network-simplex'  // Best for hierarchical graphs
        });
        g.setDefaultEdgeLabel(() => ({}));
        
        // Add nodes to dagre graph
        nodes.forEach(node => {
          const width = calculateNodeWidth(node);
          g.setNode(node.id, { 
            label: node.title || node.id,
            width: width,
            height: 50,
            node: node
          });
        });
        
        // Add edges to dagre graph
        graphData.edges.forEach(edge => {
          g.setEdge(edge.source, edge.target);
        });
        
        // Run layout
        dagre.layout(g);
        
        // Draw edges first (so nodes appear on top)
        const edges = mainGroup.selectAll(".graph-edge")
          .data(graphData.edges)
          .join("path")
          .attr("class", d => \`graph-edge \${getEdgeClass(d, nodes)}\`)
          .attr("marker-end", "url(#arrowhead)")
          .attr("d", d => {
            const sourceNode = g.node(d.source);
            const targetNode = g.node(d.target);
            
            if (!sourceNode || !targetNode) return "M0,0 L0,0";
            
            // Start/end points
            const x1 = sourceNode.x;
            const y1 = sourceNode.y;
            const x2 = targetNode.x;
            const y2 = targetNode.y;
            
            return generateSmoothPath(x1, y1, x2, y2);
          });
        
        // Create nodes
        const nodeElements = mainGroup.selectAll(".graph-node")
          .data(nodes)
          .join("g")
          .attr("class", d => \`graph-node node-type-\${d.type || 'process'} \${d.status || 'pending'}\`)
          .attr("transform", d => {
            const nodeInfo = g.node(d.id);
            return \`translate(\${nodeInfo.x},\${nodeInfo.y})\`;
          })
          .call(d3.drag()
            .on("start", dragStarted)
            .on("drag", dragging)
            .on("end", dragEnded)
          );
        
        // Add node backgrounds (rectangles)
        nodeElements.append("rect")
          .attr("width", d => calculateNodeWidth(d))
          .attr("height", 50)
          .attr("rx", 6)
          .attr("ry", 6)
          .attr("x", d => -calculateNodeWidth(d) / 2)
          .attr("y", -25);
        
        // Add node title text
        nodeElements.append("text")
          .attr("class", "node-title")
          .attr("text-anchor", "middle")
          .attr("y", -5)
          .text(d => d.title || d.id);
        
        // Add node type label
        nodeElements.append("text")
          .attr("class", "node-type")
          .attr("text-anchor", "middle")
          .attr("y", 15)
          .text(d => d.type.toUpperCase());
        
        // Show tooltip on mouseover
        nodeElements.on("mouseover", function(event, d) {
          // Format node data for tooltip
          const content = formatTooltipContent(d);
          
          // Position tooltip near the node
          tooltip.html(content)
            .style("left", (event.pageX + 10) + "px")
            .style("top", (event.pageY - 10) + "px")
            .style("opacity", 1);
            
          // Highlight the node
          d3.select(this).select("rect")
            .style("stroke", "#ffd166")
            .style("stroke-width", "3px");
            
          // Highlight incoming and outgoing edges
          highlightConnections(d, edges);
        })
        .on("mouseout", function() {
          tooltip.style("opacity", 0);
          
          // Reset node highlight
          d3.select(this).select("rect")
            .style("stroke", null)
            .style("stroke-width", null);
            
          // Reset edge highlights
          edges.classed("highlighted", false);
        })
        .on("click", function(event, d) {
          // Handle node click event
          console.log("Node clicked:", d);
          
          // Toggle persistent highlight
          const isHighlighted = d3.select(this).classed("highlighted");
          
          // Clear all highlights first
          nodeElements.classed("highlighted", false);
          nodeElements.classed("connected", false);
          edges.classed("highlighted", false);
          
          if (!isHighlighted) {
            // Set new highlights
            d3.select(this).classed("highlighted", true);
            highlightConnections(d, edges, nodeElements);
          }
          
          event.stopPropagation();
        });
        
        // Add click handler to background to clear highlights
        svg.on("click", function() {
          nodeElements.classed("highlighted", false);
          nodeElements.classed("connected", false);
          edges.classed("highlighted", false);
        });
        
        // Calculate node width based on text length
        function calculateNodeWidth(node) {
          const minWidth = 120;
          const title = node.title || node.id;
          const textLength = title.length * 8;
          return Math.max(minWidth, textLength + 20);
        }
        
        // Format tooltip content
        function formatTooltipContent(node) {
          let content = \`
            <div class="tooltip-header">
              <span>\${node.title || node.id}</span>
              <span class="tooltip-type">\${node.type || 'node'}</span>
            </div>
            <div class="tooltip-body">
              <div class="tooltip-row">
                <span class="tooltip-label">Status:</span>
                <span class="tooltip-value">\${node.status || 'pending'}</span>
              </div>
          \`;
          
          // Add additional data if available
          if (node.data) {
            try {
              // Extract useful properties from data
              const dataProps = Object.keys(node.data).filter(key => 
                key !== 'id' && 
                key !== 'title' && 
                key !== 'type' && 
                key !== 'status' && 
                key !== 'inputs' && 
                key !== 'outputs'
              );
              
              dataProps.forEach(key => {
                const value = node.data[key];
                if (value !== undefined && value !== null) {
                  const displayValue = typeof value === 'object' 
                    ? JSON.stringify(value).slice(0, 100) 
                    : String(value);
                  
                  content += \`
                    <div class="tooltip-row">
                      <span class="tooltip-label">\${key}:</span>
                      <span class="tooltip-value">\${displayValue}</span>
                    </div>
                  \`;
                }
              });
            } catch (error) {
              content += '<div class="tooltip-row">Unable to display node data</div>';
            }
          }
          
          content += '</div>';
          return content;
        }
        
        // Gets edge class based on node statuses
        function getEdgeClass(edge, nodes) {
          const sourceNode = nodes.find(n => n.id === edge.source);
          const targetNode = nodes.find(n => n.id === edge.target);
          
          if (!sourceNode || !targetNode) return '';
          
          if (sourceNode.status === 'completed' && targetNode.status === 'completed') {
            return 'completed';
          } else if (sourceNode.status === 'completed' && targetNode.status === 'running') {
            return 'active';
          } else if (sourceNode.status === 'error' || targetNode.status === 'error') {
            return 'error';
          }
          
          return '';
        }
        
        // Generate a smooth path between two points
        function generateSmoothPath(x1, y1, x2, y2) {
          const dx = Math.abs(x2 - x1);
          const dy = Math.abs(y2 - y1);
          const isHorizontal = dx > dy;
          
          // Add some curvature variation based on distance
          const curveFactor = Math.min(dx, dy) * 0.5;
          
          if (isHorizontal) {
            // For horizontal paths use a simple S-curve with more pronounced curve
            const midX = (x1 + x2) / 2;
            return \`M\${x1},\${y1} C\${midX},\${y1} \${midX},\${y2} \${x2},\${y2}\`;
          } else {
            // For vertical paths, use a more direct curve with a slight bend
            const yOffset = Math.min(50, Math.abs(y2 - y1) / 2.5);
            const y1Control = y1 + yOffset * (y2 > y1 ? 1 : -1);
            const y2Control = y2 - yOffset * (y2 > y1 ? 1 : -1);
            
            // Add a slight horizontal offset for more natural curves
            const xOffset = Math.min(30, dx / 2);
            const x1Control = x1 + (x2 > x1 ? xOffset : -xOffset);
            const x2Control = x2 - (x2 > x1 ? xOffset : -xOffset);
            
            return \`M\${x1},\${y1} C\${x1Control},\${y1Control} \${x2Control},\${y2Control} \${x2},\${y2}\`;
          }
        }
        
        // Highlight connections for a node
        function highlightConnections(node, edges, nodeElements) {
          // Find incoming and outgoing edges
          edges.classed("highlighted", d => 
            d.source === node.id || d.target === node.id
          );
          
          // If nodeElements provided, highlight connected nodes too
          if (nodeElements) {
            const connectedNodes = new Set();
            
            // Find all connected nodes
            edges.each(function(d) {
              if (d.source === node.id) {
                connectedNodes.add(d.target);
              }
              if (d.target === node.id) {
                connectedNodes.add(d.source);
              }
            });
            
            // Highlight connected nodes
            nodeElements.classed("connected", d => connectedNodes.has(d.id));
          }
        }
        
        // Drag functions
        function dragStarted(event, d) {
          mainGroup.attr("cursor", "grabbing");
        }
        
        function dragging(event, d) {
          // Update node position
          const nodeInfo = g.node(d.id);
          nodeInfo.x += event.dx;
          nodeInfo.y += event.dy;
          
          // Update node visual position
          d3.select(this).attr("transform", \`translate(\${nodeInfo.x},\${nodeInfo.y})\`);
          
          // Update connected edges
          edges.filter(edge => edge.source === d.id || edge.target === d.id)
            .attr("d", edge => {
              const sourceNode = g.node(edge.source);
              const targetNode = g.node(edge.target);
              
              if (!sourceNode || !targetNode) return "M0,0 L0,0";
              
              return generateSmoothPath(sourceNode.x, sourceNode.y, targetNode.x, targetNode.y);
            });
        }
        
        function dragEnded(event, d) {
          mainGroup.attr("cursor", "grab");
        }
        
        // Add zoom controls
        const zoomControls = d3.select(container.parentNode)
          .append("div")
          .attr("class", "zoom-controls");
        
        zoomControls.append("button")
          .attr("class", "zoom-button zoom-in")
          .text("+")
          .on("click", function() {
            svg.transition().duration(300)
              .call(zoomBehavior.scaleBy, 1.3);
          });
        
        zoomControls.append("button")
          .attr("class", "zoom-button zoom-out")
          .text("−")
          .on("click", function() {
            svg.transition().duration(300)
              .call(zoomBehavior.scaleBy, 0.7);
          });
        
        zoomControls.append("button")
          .attr("class", "zoom-button zoom-reset")
          .text("⟲")
          .on("click", function() {
            resetZoom(svg, zoomBehavior, mainGroup, g);
          });
        
        // Initial fit to view
        resetZoom(svg, zoomBehavior, mainGroup, g);
        
      } catch (error) {
        console.error('Error initializing graph:', error);
        const errorContainer = document.getElementById('error-container');
        if (errorContainer) {
          const errorMessage = document.getElementById('error-message');
          if (errorMessage) {
            errorMessage.textContent = error.message || "Unknown error";
          }
          errorContainer.style.display = 'block';
        }
      }
    }
    
    // Structure data into a workflow pattern
    function structureData(nodes, edges) {
      // Clone nodes to avoid modifying the originals
      const processedNodes = JSON.parse(JSON.stringify(nodes));
      
      // Create a map for faster lookups
      const nodeMap = {};
      processedNodes.forEach(node => {
        nodeMap[node.id] = node;
      });
      
      // Process node types if not specified
      processedNodes.forEach(node => {
        // Default to process type
        if (!node.type) node.type = 'process';
        
        // Special handling for certain node IDs for better visualization
        if (/start|init|begin/i.test(node.id)) node.type = 'start';
        if (/end|final|complete/i.test(node.id)) node.type = 'end';
        
        // Improved detection for agent nodes
        if (/agent|llm|gpt|ai|assistant|answer/i.test(node.id)) node.type = 'agent';
        
        // Improved detection for transform nodes
        if (/transform|convert|format|docs|cite|sources/i.test(node.id)) node.type = 'transform';
        
        // Improved detection for retrieval nodes
        if (/retriev|rag|search|lookup|retrieve/i.test(node.id)) node.type = 'retrieval';
        
        // Improved detection for intent nodes
        if (/intent|detect|classify|split|questions/i.test(node.id)) node.type = 'intent';
        
        // Make sure title is available and properly formatted
        if (!node.title) {
          node.title = formatNodeName(node.id);
        }
        
        // Further enhance title for better readability
        if (node.type === 'start') {
          node.title = '▶ Start';
        } else if (node.type === 'end') {
          node.title = '■ End';
        } else if (/llm/i.test(node.id) && /answer/i.test(node.id)) {
          node.title = 'LLM Answer';
        } else if (/rag/i.test(node.id) && /answer/i.test(node.id)) {
          node.title = 'RAG Answer';
        } else if (/detect/i.test(node.id) && /intent/i.test(node.id)) {
          node.title = 'Detect Intent';
        } else if (/split/i.test(node.id) && /question/i.test(node.id)) {
          node.title = 'Split Questions';
        } else if (/cite/i.test(node.id) && /sources/i.test(node.id)) {
          node.title = 'Cite Sources';
        } else if (/transform/i.test(node.id) && /docs/i.test(node.id)) {
          node.title = 'Transform Docs';
        } else if (/retriev/i.test(node.id)) {
          node.title = 'Retrieve';
        }
      });
      
      return processedNodes;
    }
    
    // Display a message when no data is available
    function displayNoDataMessage(container) {
      const noDataDiv = document.createElement('div');
      noDataDiv.className = 'no-data-message';
      noDataDiv.innerHTML = \`
        <div class="no-data-icon">📊</div>
        <div class="no-data-title">No Data Available</div>
        <div class="no-data-subtitle">The graph data is empty or not properly formatted.</div>
      \`;
      container.appendChild(noDataDiv);
    }
    
    // Reset zoom to fit all nodes
    function resetZoom(svg, zoomBehavior, mainGroup, graph) {
      if (!svg || !zoomBehavior || !mainGroup) return;
      
      // Get graph dimensions
      const graphWidth = graph.graph().width || 100;
      const graphHeight = graph.graph().height || 100;
      
      // Get container dimensions
      const container = svg.node().parentElement;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      // Calculate the scale to fit the graph
      const scaleFactor = Math.min(
        containerWidth / (graphWidth + 100),
        containerHeight / (graphHeight + 100)
      );
      
      // Apply the scale and center the graph
      const xOffset = (containerWidth - graphWidth * scaleFactor) / 2;
      const yOffset = (containerHeight - graphHeight * scaleFactor) / 2;
      
      svg.transition()
        .duration(500)
        .call(
          zoomBehavior.transform,
          d3.zoomIdentity
            .translate(xOffset, yOffset)
            .scale(scaleFactor * 0.9)
        );
    }
    
    // Format a node ID into a readable name
    function formatNodeName(nodeId) {
      if (!nodeId) return 'Unknown';
      
      // Remove any hash or ID part
      let name = nodeId.split('#')[0].trim();
      
      // Replace underscores, hyphens, and camelCase with spaces
      name = name
        .replace(/[_-]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2');
      
      // Capitalize each word
      name = name.replace(/\w\S*/g, txt => 
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
      );
      
      return name;
    }
    
    // Initialize graph when DOM is ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", initializeGraph);
    } else {
      initializeGraph();
    }
  `;
}

/**
 * Get the script tag that defines the graph data object
 */
export function generateGraphDataScript(graphData: any): string {
  try {
    const data = transformGraphData(graphData);
    
    // Create a script that sets a global variable with the data
    return `
    window.LG_GRAPH_DATA = ${JSON.stringify(data, null, 2)};
    `;
  } catch (error) {
    console.error('Error generating graph data script:', error);
    return 'window.LG_GRAPH_DATA = { nodes: [], edges: [] };';
  }
}

/**
 * Transform the graph data from the server format to the D3 visualization format
 */
function transformGraphData(data: any): { nodes: any[], edges: any[] } {
  // Default empty graph
  const defaultGraph = { nodes: [], edges: [] };
  
  try {
    // Handle empty data
    if (!data) return defaultGraph;
    
    // If the data is a string, parse it first
    const stateData = typeof data === 'string' ? JSON.parse(data) : data;
    
    // If the data already has nodes and edges in the expected format
    if (stateData.nodes && Array.isArray(stateData.nodes) && stateData.edges && Array.isArray(stateData.edges)) {
      // Check if this is a meeting analysis workflow
      const isMeetingAnalysis = isMeetingAnalysisWorkflow(stateData);
      
      if (isMeetingAnalysis) {
        return transformMeetingAnalysisGraph(stateData);
      }
      
      return stateData;
    }
    
    const nodes: any[] = [];
    const edges: any[] = [];
    const nodeMap: Record<string, boolean> = {};
    
    // Extract state information
    const state = stateData.state || stateData;
    
    // Process nodes
    if (typeof state === 'object') {
      // First pass: create nodes
      Object.entries(state).forEach(([nodeId, nodeData]: [string, any]) => {
        // Skip if not an object
        if (typeof nodeData !== 'object' || nodeData === null) return;
        
        // Determine node type
        let nodeType = nodeData.type || 'process';
        
        // Special handling for certain node IDs
        if (/start|init|begin/i.test(nodeId)) nodeType = 'start';
        if (/end|final|complete/i.test(nodeId)) nodeType = 'end';
        if (/agent|llm|gpt|ai|assistant/i.test(nodeId)) nodeType = 'agent';
        if (/transform|convert|format/i.test(nodeId)) nodeType = 'transform';
        if (/retriev|rag|search|lookup/i.test(nodeId)) nodeType = 'retrieval';
        if (/intent|detect|classify/i.test(nodeId)) nodeType = 'intent';
        
        // Determine node status
        const nodeStatus = nodeData.status || 'pending';
        
        // Create node object with improved title
        const node = {
          id: nodeId,
          title: nodeData.name || formatNodeName(nodeId),
          type: nodeType,
          status: nodeStatus,
          data: nodeData
        };
        
        nodes.push(node);
        nodeMap[nodeId] = true;
      });
      
      // Second pass: create edges
      Object.entries(state).forEach(([nodeId, nodeData]: [string, any]) => {
        if (typeof nodeData !== 'object' || nodeData === null) return;
        
        // Process edges based on inputs
        if (Array.isArray(nodeData.inputs)) {
          nodeData.inputs.forEach((input: string) => {
            if (input && nodeMap[input]) {
              edges.push({
                source: input,
                target: nodeId
              });
            }
          });
        }
      });
      
      // Create implicit edges if no edges defined but nodes are related by ID patterns
      if (edges.length === 0 && nodes.length > 1) {
        createImplicitEdges(nodes, edges);
      }
    }
    
    // Check if this is a meeting analysis workflow based on node names
    const meetingAnalysisNodes = nodes.filter(node => 
      /chunks|analysis|partial|metadata|participant|transcript/i.test(node.id)
    );
    
    if (meetingAnalysisNodes.length > 3) {
      return transformMeetingAnalysisNodesEdges(nodes, edges);
    }
    
    // Fallback for empty graph
    if (nodes.length === 0) {
      nodes.push({
        id: 'no-data',
        title: 'No Data Available',
        type: 'process',
        status: 'pending'
      });
    }
    
    return { nodes, edges };
  } catch (error) {
    console.error('Error transforming graph data:', error);
    return defaultGraph;
  }
}

/**
 * Check if this graph represents a meeting analysis workflow
 */
function isMeetingAnalysisWorkflow(data: any): boolean {
  if (!data.nodes || !Array.isArray(data.nodes)) return false;
  
  // Check for key meeting analysis node types
  const hasChunks = data.nodes.some((node: any) => /chunks/i.test(node.id));
  const hasAnalysis = data.nodes.some((node: any) => /analysis|result/i.test(node.id));
  const hasPartial = data.nodes.some((node: any) => /partial/i.test(node.id));
  
  return hasChunks && hasAnalysis && hasPartial;
}

/**
 * Transform a meeting analysis graph into a more detailed representation
 */
function transformMeetingAnalysisGraph(data: any): { nodes: any[], edges: any[] } {
  const { nodes: originalNodes, edges: originalEdges } = data;
  
  // Create new arrays for the enhanced graph
  const nodes: any[] = [];
  const edges: any[] = [];
  
  // Add a start node if not present
  if (!originalNodes.some((node: any) => node.type === 'start')) {
    nodes.push({
      id: 'start_node',
      title: '▶ Start',
      type: 'start',
      status: 'completed'
    });
  }
  
  // Create Meeting Analysis Agent node as the core processor
  const meetingAgentNode = {
    id: 'meeting_analysis_agent',
    title: 'Meeting Analysis Agent',
    type: 'agent',
    status: 'completed'
  };
  nodes.push(meetingAgentNode);
  
  // Process the original nodes and categorize them
  const metadataNodes = originalNodes.filter((node: any) => /metadata|participant|errors|metrics/i.test(node.id));
  const chunksNode = originalNodes.find((node: any) => /chunks/i.test(node.id));
  const partialAnalysesNode = originalNodes.find((node: any) => /partial/i.test(node.id));
  const analysisResultNode = originalNodes.find((node: any) => /analysisResult|result/i.test(node.id));
  
  // Add metadata processing node if metadata exists
  if (metadataNodes.length > 0) {
    const metadataProcessNode = {
      id: 'process_metadata',
      title: 'Process Metadata',
      type: 'process',
      status: 'completed'
    };
    nodes.push(metadataProcessNode);
    
    // Connect start to meeting agent
    edges.push({
      source: 'start_node',
      target: 'meeting_analysis_agent'
    });
    
    // Connect meeting agent to metadata process
    edges.push({
      source: 'meeting_analysis_agent',
      target: 'process_metadata'
    });
    
    // Add the actual metadata nodes
    metadataNodes.forEach((node: any) => {
      nodes.push(node);
      edges.push({
        source: 'process_metadata',
        target: node.id
      });
    });
  }
  
  // Add chunk splitting node if chunks exist
  if (chunksNode) {
    const chunkSplitterNode = {
      id: 'split_transcript',
      title: 'Split Transcript',
      type: 'transform',
      status: 'completed'
    };
    nodes.push(chunkSplitterNode);
    nodes.push(chunksNode);
    
    // Connect meeting agent to chunk splitter
    edges.push({
      source: 'meeting_analysis_agent',
      target: 'split_transcript'
    });
    
    // Connect chunk splitter to chunks
    edges.push({
      source: 'split_transcript',
      target: chunksNode.id
    });
    
    // Add chunk processing node
    const chunkProcessorNode = {
      id: 'process_chunks',
      title: 'Process Chunks',
      type: 'process',
      status: 'completed'
    };
    nodes.push(chunkProcessorNode);
    
    // Connect chunks to processor
    edges.push({
      source: chunksNode.id,
      target: 'process_chunks'
    });
    
    // Add LLM for chunk analysis
    const chunkAnalyzerNode = {
      id: 'chunk_analyzer',
      title: 'LLM Analyzer',
      type: 'agent',
      status: 'completed'
    };
    nodes.push(chunkAnalyzerNode);
    
    // Connect processor to LLM analyzer
    edges.push({
      source: 'process_chunks',
      target: 'chunk_analyzer'
    });
    
    // Add partial analyses if they exist
    if (partialAnalysesNode) {
      nodes.push(partialAnalysesNode);
      
      // Connect analyzer to partial results
      edges.push({
        source: 'chunk_analyzer',
        target: partialAnalysesNode.id
      });
      
      // Add a combiner node
      const combinerNode = {
        id: 'combine_analyses',
        title: 'Combine Analyses',
        type: 'transform',
        status: 'completed'
      };
      nodes.push(combinerNode);
      
      // Connect partial results to combiner
      edges.push({
        source: partialAnalysesNode.id,
        target: 'combine_analyses'
      });
      
      // Connect combiner back to meeting agent for final processing
      edges.push({
        source: 'combine_analyses',
        target: 'meeting_analysis_agent'
      });
    }
  }
  
  // Add the final analysis result if it exists
  if (analysisResultNode) {
    nodes.push(analysisResultNode);
    
    // Connect meeting agent to analysis result
    edges.push({
      source: 'meeting_analysis_agent',
      target: analysisResultNode.id
    });
    
    // Add an end node
    const endNode = {
      id: 'end_node',
      title: '■ End',
      type: 'end',
      status: 'completed'
    };
    nodes.push(endNode);
    
    // Connect result to end
    edges.push({
      source: analysisResultNode.id,
      target: 'end_node'
    });
  }
  
  return { nodes, edges };
}

/**
 * Transform meeting analysis nodes and edges into a more detailed representation
 * when we only have the raw nodes/edges without metadata
 */
function transformMeetingAnalysisNodesEdges(originalNodes: any[], originalEdges: any[]): { nodes: any[], edges: any[] } {
  // Create new arrays for the enhanced graph
  const nodes: any[] = [];
  const edges: any[] = [];
  
  // Add a start node
  const startNode = {
    id: 'start_node',
    title: '▶ Start',
    type: 'start',
    status: 'completed'
  };
  nodes.push(startNode);
  
  // Create Meeting Analysis Agent node as the core processor
  const meetingAgentNode = {
    id: 'meeting_analysis_agent',
    title: 'Meeting Analysis Agent',
    type: 'agent',
    status: 'completed'
  };
  nodes.push(meetingAgentNode);
  
  // Connect start to agent
  edges.push({
    source: 'start_node',
    target: 'meeting_analysis_agent'
  });
  
  // Process the original nodes and categorize them
  const metadataNodes = originalNodes.filter((node: any) => /metadata|participant|errors|metrics/i.test(node.id));
  const chunksNode = originalNodes.find((node: any) => /chunks/i.test(node.id));
  const partialAnalysesNode = originalNodes.find((node: any) => /partial/i.test(node.id));
  const analysisResultNode = originalNodes.find((node: any) => /analysisResult|result/i.test(node.id));
  
  // Add original nodes (we'll still keep these)
  originalNodes.forEach((node: any) => {
    nodes.push(node);
  });
  
  // Add metadata processing node
  if (metadataNodes.length > 0) {
    const metadataProcessNode = {
      id: 'process_metadata',
      title: 'Process Metadata',
      type: 'process',
      status: 'completed'
    };
    nodes.push(metadataProcessNode);
    
    // Connect agent to processor
    edges.push({
      source: 'meeting_analysis_agent',
      target: 'process_metadata'
    });
    
    // Connect processor to each metadata node
    metadataNodes.forEach((node: any) => {
      edges.push({
        source: 'process_metadata',
        target: node.id
      });
    });
  }
  
  // Add transcript splitter if chunks exist
  if (chunksNode) {
    const splitNode = {
      id: 'split_transcript',
      title: 'Split Transcript',
      type: 'transform',
      status: 'completed'
    };
    nodes.push(splitNode);
    
    // Connect agent to splitter
    edges.push({
      source: 'meeting_analysis_agent',
      target: 'split_transcript'
    });
    
    // Connect splitter to chunks
    edges.push({
      source: 'split_transcript',
      target: chunksNode.id
    });
    
    // Add chunk processor
    const chunkProcessorNode = {
      id: 'chunk_processor',
      title: 'Process Chunks',
      type: 'process',
      status: 'completed'
    };
    nodes.push(chunkProcessorNode);
    
    // Connect chunks to processor
    edges.push({
      source: chunksNode.id,
      target: 'chunk_processor'
    });
    
    // Add LLM analyzer
    const llmNode = {
      id: 'llm_analyzer',
      title: 'LLM Analyzer',
      type: 'agent',
      status: 'completed'
    };
    nodes.push(llmNode);
    
    // Connect processor to LLM
    edges.push({
      source: 'chunk_processor',
      target: 'llm_analyzer'
    });
    
    if (partialAnalysesNode) {
      // Connect LLM to partial analyses
      edges.push({
        source: 'llm_analyzer',
        target: partialAnalysesNode.id
      });
      
      // Add combiner
      const combinerNode = {
        id: 'combine_analyses',
        title: 'Combine Analyses',
        type: 'transform',
        status: 'completed'
      };
      nodes.push(combinerNode);
      
      // Connect partial analyses to combiner
      edges.push({
        source: partialAnalysesNode.id,
        target: 'combine_analyses'
      });
      
      // Connect combiner back to agent
      edges.push({
        source: 'combine_analyses',
        target: 'meeting_analysis_agent'
      });
    }
  }
  
  // Add final analysis step
  if (analysisResultNode) {
    // Connect agent to result
    edges.push({
      source: 'meeting_analysis_agent',
      target: analysisResultNode.id
    });
    
    // Add end node
    const endNode = {
      id: 'end_node',
      title: '■ End',
      type: 'end',
      status: 'completed'
    };
    nodes.push(endNode);
    
    // Connect result to end
    edges.push({
      source: analysisResultNode.id,
      target: 'end_node'
    });
  }
  
  // Now incorporate original edges where they make sense
  originalEdges.forEach(edge => {
    // Avoid duplicate edges
    if (!edges.some(e => e.source === edge.source && e.target === edge.target)) {
      edges.push(edge);
    }
  });
  
  return { nodes, edges };
}

/**
 * Format node ID to a more readable title
 */
function formatNodeName(nodeId: string): string {
  if (!nodeId) return 'Unknown';
  
  // Remove any hash or ID part
  let name = nodeId.split('#')[0].trim();
  
  // Replace underscores, hyphens, and camelCase with spaces
  name = name
    .replace(/[_-]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
  
  // Capitalize each word
  name = name.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
  
  return name;
}

/**
 * Create implicit edges between nodes based on naming patterns
 */
function createImplicitEdges(nodes: any[], edges: any[]): void {
  // Look for start nodes
  const startNodes = nodes.filter(node => 
    node.type === 'start' || /start|init|begin/i.test(node.id)
  );
  
  // Look for end nodes
  const endNodes = nodes.filter(node => 
    node.type === 'end' || /end|final|complete/i.test(node.id)
  );
  
  // Find specific node types
  const intentNodes = nodes.filter(node => node.type === 'intent');
  const retrievalNodes = nodes.filter(node => node.type === 'retrieval');
  const transformNodes = nodes.filter(node => node.type === 'transform');
  const agentNodes = nodes.filter(node => node.type === 'agent');
  
  // If we have identifiable start and end, create a more complex flow
  if (startNodes.length > 0) {
    let startNode = startNodes[0];
    let endNode = endNodes.length > 0 ? endNodes[0] : null;
    
    // Create structured graph based on typical workflow patterns
    if (intentNodes.length > 0) {
      // Connect start to intent detection
      edges.push({
        source: startNode.id,
        target: intentNodes[0].id
      });
      
      // Connect intent to next node (split questions or retrieval)
      const nextNode = transformNodes.find(n => /split|question/i.test(n.id)) || retrievalNodes[0] || agentNodes[0];
      if (nextNode) {
        edges.push({
          source: intentNodes[0].id,
          target: nextNode.id
        });
        
        // Connect to retrieval if available
        if (retrievalNodes.length > 0 && nextNode.id !== retrievalNodes[0].id) {
          edges.push({
            source: nextNode.id,
            target: retrievalNodes[0].id
          });
          
          // Connect retrieval to transform docs
          const transformDocsNode = transformNodes.find(n => /docs|transform/i.test(n.id));
          if (transformDocsNode) {
            edges.push({
              source: retrievalNodes[0].id,
              target: transformDocsNode.id
            });
            
            // Connect transform to agents (LLM Answer and RAG Answer)
            const llmNode = agentNodes.find(n => /llm/i.test(n.id));
            const ragNode = agentNodes.find(n => /rag/i.test(n.id));
            
            if (llmNode) {
              edges.push({
                source: transformDocsNode.id,
                target: llmNode.id
              });
            }
            
            if (ragNode) {
              edges.push({
                source: transformDocsNode.id,
                target: ragNode.id
              });
            }
            
            // Connect to cite sources node if exists
            const citeNode = transformNodes.find(n => /cite|sources/i.test(n.id));
            if (citeNode) {
              if (llmNode) {
                edges.push({
                  source: llmNode.id,
                  target: citeNode.id
                });
              }
              
              if (ragNode) {
                edges.push({
                  source: ragNode.id,
                  target: citeNode.id
                });
              }
              
              // Connect cite sources to end
              if (endNode) {
                edges.push({
                  source: citeNode.id,
                  target: endNode.id
                });
              }
            } else if (endNode) {
              // Connect agents directly to end if no cite node
              if (llmNode) {
                edges.push({
                  source: llmNode.id,
                  target: endNode.id
                });
              }
              
              if (ragNode) {
                edges.push({
                  source: ragNode.id,
                  target: endNode.id
                });
              }
            }
          }
        }
      }
    } else {
      // No clear workflow structure, fall back to simple connection
      // Connect nodes in a simple sequence based on array order
      for (let i = 0; i < nodes.length - 1; i++) {
        edges.push({
          source: nodes[i].id,
          target: nodes[i + 1].id
        });
      }
    }
  } else {
    // No clear start/end, connect nodes in sequence based on array order
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        source: nodes[i].id,
        target: nodes[i + 1].id
      });
    }
  }
} 