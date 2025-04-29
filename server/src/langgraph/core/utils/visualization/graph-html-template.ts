/**
 * HTML template for the graph visualization
 */

import { generateStyles } from './styles';
import {
  generateGraphRenderer,
  generateGraphDataScript,
} from './graph-renderer';

export function generateGraphHtml(graphId: string, initialState: any): string {
  const timestamp = Date.now();

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LangGraph Flow: ${graphId}</title>
  <!-- External libraries -->
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js"></script>
  <!-- Error handling -->
  <script>
    window.onerror = function(message, source, lineno, colno, error) {
      console.error('Error in visualization:', message, 'at', source, 'line', lineno, 'column', colno);
      
      // Only show error if container exists
      const errorContainer = document.getElementById('error-container');
      const errorMessage = document.getElementById('error-message');
      const errorLocation = document.getElementById('error-location');
      
      if (errorContainer && errorMessage && errorLocation) {
        errorContainer.style.display = 'block';
        errorMessage.textContent = message;
        errorLocation.textContent = 'Location: ' + source + ' (line ' + lineno + ', column ' + colno + ')';
      } else {
        // If the error happens before the DOM is ready, add an event listener to show it later
        document.addEventListener('DOMContentLoaded', function() {
          const errorContainer = document.getElementById('error-container');
          const errorMessage = document.getElementById('error-message');
          const errorLocation = document.getElementById('error-location');
          
          if (errorContainer && errorMessage && errorLocation) {
            errorContainer.style.display = 'block';
            errorMessage.textContent = message;
            errorLocation.textContent = 'Location: ' + source + ' (line ' + lineno + ', column ' + colno + ')';
          }
        });
      }
      return false;
    };
  </script>
  <!-- Graph data script - defined separately to avoid JSON escaping issues -->
  <script>
    ${generateGraphDataScript(initialState)}
  </script>
  <style>
    ${generateStyles()}
    
    /* Error message styling */
    #error-container {
      display: none;
      background-color: #fff5f5;
      border: 1px solid #ffcdd2;
      border-left: 4px solid #f44336;
      border-radius: 4px;
      margin: 20px 0;
      padding: 15px;
    }
    
    #error-container h3 {
      color: #d32f2f;
      margin-top: 0;
      margin-bottom: 10px;
    }
    
    #error-message {
      font-family: monospace;
      margin-bottom: 10px;
      word-break: break-word;
    }
    
    #error-location {
      font-size: 0.85rem;
      color: #757575;
    }
    
    #reload-btn {
      background-color: #f44336;
      color: white;
      border: none;
      border-radius: 4px;
      padding: 8px 16px;
      cursor: pointer;
      margin-top: 10px;
      font-weight: 500;
    }
    
    #reload-btn:hover {
      background-color: #d32f2f;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>AI Workflow Visualization</h1>
      <div class="header-details">
        <div>Flow ID: <span>${graphId}</span></div>
        <div id="connection-status" class="connection-status disconnected">Disconnected</div>
      </div>
    </header>
    
    <!-- Error message container -->
    <div id="error-container">
      <h3>Visualization Error</h3>
      <div id="error-message"></div>
      <div id="error-location"></div>
      <button id="reload-btn" onclick="window.location.reload()">Reload Page</button>
    </div>
    
    <div class="legend">
      <h3>Node Types</h3>
      <div class="legend-items">
        <div class="legend-item">
          <div class="legend-color node-type-start"></div>
          <div>Start</div>
        </div>
        <div class="legend-item">
          <div class="legend-color node-type-end"></div>
          <div>End</div>
        </div>
        <div class="legend-item">
          <div class="legend-color node-type-agent"></div>
          <div>Agent</div>
        </div>
        <div class="legend-item">
          <div class="legend-color node-type-process"></div>
          <div>Process</div>
        </div>
        <div class="legend-item">
          <div class="legend-color node-type-intent"></div>
          <div>Intent</div>
        </div>
        <div class="legend-item">
          <div class="legend-color node-type-retrieval"></div>
          <div>Retrieval</div>
        </div>
        <div class="legend-item">
          <div class="legend-color node-type-transform"></div>
          <div>Transform</div>
        </div>
      </div>
      
      <h3>Status</h3>
      <div class="legend-items">
        <div class="legend-item">
          <div class="legend-status pending"></div>
          <div>Pending</div>
        </div>
        <div class="legend-item">
          <div class="legend-status running"></div>
          <div>Running</div>
        </div>
        <div class="legend-item">
          <div class="legend-status completed"></div>
          <div>Completed</div>
        </div>
        <div class="legend-item">
          <div class="legend-status error"></div>
          <div>Error</div>
        </div>
      </div>
    </div>
    
    <div class="controls">
      <button id="refresh-btn" class="refresh-button">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
        </svg>
        Refresh
      </button>
      <div class="auto-refresh">
        <label for="auto-refresh-toggle">Auto-refresh: </label>
        <select id="auto-refresh-toggle">
          <option value="0">Off</option>
          <option value="5">Every 5s</option>
          <option value="10">Every 10s</option>
          <option value="30" selected>Every 30s</option>
        </select>
      </div>
    </div>
    
    <div class="graph-container">
      <div id="graph-content" class="graph-content"></div>
      <div id="pagination" class="pagination"></div>
    </div>
  </div>

  <!-- Graph renderer script - depends on the graph data being defined above -->
  <script>
    // Prevent caching issues with timestamp: ${timestamp}
    ${generateGraphRenderer(null, 'graph-content')}
    
    // Auto-refresh functionality
    let refreshTimer;
    
    function setupAutoRefresh() {
      try {
        const autoRefreshSelect = document.getElementById('auto-refresh-toggle');
        const refreshBtn = document.getElementById('refresh-btn');
        
        if (!autoRefreshSelect || !refreshBtn) return;
        
        // Handle manual refresh
        refreshBtn.addEventListener('click', function() {
          window.location.reload();
        });
        
        // Handle auto-refresh change
        autoRefreshSelect.addEventListener('change', function() {
          const seconds = parseInt(this.value, 10);
          
          // Clear existing timer
          if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
          }
          
          // Set new timer if not disabled
          if (seconds > 0) {
            refreshTimer = setInterval(function() {
              window.location.reload();
            }, seconds * 1000);
          }
        });
        
        // Initialize auto-refresh based on initial selection
        const initialSeconds = parseInt(autoRefreshSelect.value, 10);
        if (initialSeconds > 0) {
          refreshTimer = setInterval(function() {
            window.location.reload();
          }, initialSeconds * 1000);
        }
      } catch (error) {
        console.error('Error setting up auto-refresh:', error);
      }
    }
    
    // Debug graph data for troubleshooting
    console.log('Graph data:', window.LG_GRAPH_DATA);
    
    // Set up auto-refresh when the document is loaded
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", setupAutoRefresh);
    } else {
      setupAutoRefresh();
    }
  </script>
</body>
</html>
  `;
}
