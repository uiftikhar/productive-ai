/**
 * Styles for the graph visualization
 * This file contains all CSS styles used in the graph visualization
 */
export function generateStyles(): string {
  return `
    /* Global styles */
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    }
    
    body {
      background-color: #f5f7fa;
      color: #333;
    }
    
    .container {
      max-width: 100%;
      margin: 0 auto;
      padding: 20px;
    }
    
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 10px;
      border-bottom: 1px solid #e0e0e0;
    }
    
    header h1 {
      font-size: 1.6rem;
      font-weight: 600;
      color: #2a2f45;
    }
    
    .header-details {
      display: flex;
      gap: 20px;
      font-size: 0.9rem;
    }
    
    .connection-status {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.85rem;
      font-weight: 500;
    }
    
    .connection-status.connected {
      background-color: rgba(0, 200, 83, 0.2);
      color: #00a854;
    }
    
    .connection-status.disconnected {
      background-color: rgba(255, 77, 79, 0.2);
      color: #f5222d;
    }
    
    .connection-status.connecting {
      background-color: rgba(250, 173, 20, 0.2);
      color: #faad14;
    }
    
    .connection-status::before {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      margin-right: 6px;
    }
    
    .connection-status.connected::before {
      background-color: #00a854;
    }
    
    .connection-status.disconnected::before {
      background-color: #f5222d;
    }
    
    .connection-status.connecting::before {
      background-color: #faad14;
    }
    
    /* No data message */
    .no-data-message {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 20px;
      background-color: rgba(0,0,0,0.02);
      border-radius: 8px;
      text-align: center;
    }
    
    .no-data-icon {
      font-size: 48px;
      margin-bottom: 15px;
      opacity: 0.5;
    }
    
    .no-data-title {
      font-size: 1.2rem;
      font-weight: 600;
      margin-bottom: 5px;
      color: #555;
    }
    
    .no-data-subtitle {
      font-size: 0.9rem;
      color: #888;
      max-width: 300px;
    }
    
    /* Controls */
    .controls {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 15px;
      margin-bottom: 15px;
    }
    
    .refresh-button {
      display: flex;
      align-items: center;
      gap: 5px;
      background-color: #fff;
      border: 1px solid #d9d9d9;
      border-radius: 4px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.2s;
    }
    
    .refresh-button:hover {
      background-color: #f0f0f0;
      border-color: #b5b5b5;
    }
    
    .refresh-button svg {
      width: 14px;
      height: 14px;
    }
    
    .auto-refresh {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
    }
    
    .auto-refresh select {
      padding: 5px 8px;
      border: 1px solid #d9d9d9;
      border-radius: 4px;
      background-color: #fff;
      font-size: 0.85rem;
    }
    
    /* Legend styles */
    .legend {
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      padding: 15px;
      margin-bottom: 20px;
    }
    
    .legend h3 {
      font-size: 0.95rem;
      font-weight: 500;
      margin-bottom: 10px;
      color: #2a2f45;
    }
    
    .legend-items {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-bottom: 15px;
    }
    
    .legend-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
    }
    
    .legend-color, .legend-status {
      width: 14px;
      height: 14px;
      border-radius: 3px;
    }
    
    /* Node type colors */
    .node-type-start {
      background-color: #a37cf0;
    }
    
    .node-type-end {
      background-color: #a37cf0;
    }
    
    .node-type-agent {
      background-color: #f27979;
    }
    
    .node-type-process {
      background-color: #5b9be6;
    }
    
    .node-type-intent {
      background-color: #8a7eec;
    }
    
    .node-type-retrieval {
      background-color: #23d5ab;
    }
    
    .node-type-transform {
      background-color: #8a7eec;
    }
    
    /* Node status colors */
    .legend-status.pending {
      background-color: #bdbdbd;
    }
    
    .legend-status.running {
      background-color: #2196f3;
    }
    
    .legend-status.completed {
      background-color: #4caf50;
    }
    
    .legend-status.error {
      background-color: #f44336;
    }
    
    /* Graph container */
    .graph-container {
      position: relative;
      background-color: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
      overflow: hidden;
      height: calc(100vh - 200px);
      min-height: 500px;
    }
    
    .graph-content {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    
    /* SVG elements */
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
    
    /* Node styles */
    .graph-node {
      cursor: pointer;
      transition: opacity 0.2s, filter 0.2s;
    }
    
    .graph-node:hover {
      filter: brightness(1.1);
    }
    
    .graph-node rect {
      stroke-width: 1px;
      stroke: rgba(255, 255, 255, 0.4);
      rx: 8px;
      ry: 8px;
    }
    
    .graph-node.highlighted rect {
      stroke: #ffd166;
      stroke-width: 3px;
    }
    
    .graph-node.connected rect {
      stroke: #ffd166;
      stroke-width: 2px;
    }
    
    .graph-node .node-title {
      font-weight: 600;
      font-size: 12px;
      fill: white;
      pointer-events: none;
    }
    
    .graph-node .node-type {
      font-size: 10px;
      fill: rgba(255, 255, 255, 0.7);
      text-transform: uppercase;
      pointer-events: none;
    }
    
    /* Node type styling */
    .graph-node.node-type-start rect {
      fill: #a37cf0;
    }
    
    .graph-node.node-type-end rect {
      fill: #a37cf0;
    }
    
    .graph-node.node-type-agent rect {
      fill: #f27979;
    }
    
    .graph-node.node-type-process rect {
      fill: #5b9be6;
    }
    
    .graph-node.node-type-intent rect {
      fill: #8a7eec;
    }
    
    .graph-node.node-type-retrieval rect {
      fill: #23d5ab;
    }
    
    .graph-node.node-type-transform rect {
      fill: #8a7eec;
    }
    
    /* Node status styling */
    .graph-node.pending rect {
      fill-opacity: 0.7;
    }
    
    .graph-node.running rect {
      stroke: #2196f3;
      stroke-width: 2px;
      stroke-dasharray: none;
    }
    
    .graph-node.completed rect {
      fill-opacity: 1;
    }
    
    .graph-node.error rect {
      fill: #f44336;
    }
    
    /* Edge styling */
    .graph-edge {
      stroke: #aae2d0;
      stroke-width: 1.5px;
      fill: none;
      stroke-opacity: 0.7;
      transition: stroke 0.2s, stroke-width 0.2s, stroke-opacity 0.2s;
    }
    
    .graph-edge.highlighted {
      stroke: #aae2d0;
      stroke-width: 2.5px;
      stroke-opacity: 1;
    }
    
    .graph-edge.completed {
      stroke: #aae2d0;
      stroke-opacity: 0.9;
    }
    
    .graph-edge.active {
      stroke: #aae2d0;
      stroke-opacity: 1;
      stroke-width: 2px;
    }
    
    .graph-edge.error {
      stroke: #d63031;
      stroke-opacity: 0.8;
    }
    
    .graph-edge-arrow {
      fill: #aae2d0;
    }
    
    /* Tooltip */
    .tooltip {
      position: absolute;
      background-color: rgba(255, 255, 255, 0.95);
      border-radius: 4px;
      padding: 12px;
      font-size: 0.85rem;
      z-index: 1000;
      max-width: 300px;
      box-shadow: 0 2px 14px rgba(0, 0, 0, 0.15);
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.2s;
      border: 1px solid rgba(0, 0, 0, 0.1);
    }
    
    .tooltip-header {
      display: flex;
      justify-content: space-between;
      margin-bottom: 8px;
      border-bottom: 1px solid #eee;
      padding-bottom: 8px;
    }
    
    .tooltip-header span:first-child {
      font-weight: 600;
      font-size: 14px;
    }
    
    .tooltip-type {
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 10px;
      text-transform: uppercase;
      background-color: #f0f0f0;
      color: #666;
    }
    
    .tooltip-body {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }
    
    .tooltip-row {
      display: flex;
      align-items: flex-start;
    }
    
    .tooltip-label {
      font-weight: 500;
      min-width: 80px;
      color: #666;
    }
    
    .tooltip-value {
      flex: 1;
      word-break: break-word;
    }
    
    /* Pagination */
    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 10px;
      gap: 10px;
      font-size: 0.9rem;
      border-top: 1px solid #eeeeee;
    }
    
    .pagination button {
      background-color: #f5f7fa;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 0.85rem;
      transition: background-color 0.2s;
    }
    
    .pagination button:hover {
      background-color: #e9ecef;
    }
    
    .pagination button:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
    
    .pagination-info {
      font-size: 0.85rem;
      color: #757575;
    }
    
    /* Zoom controls */
    .zoom-controls {
      position: absolute;
      top: 10px;
      right: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 10;
    }
    
    .zoom-button {
      width: 30px;
      height: 30px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: white;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      transition: background-color 0.2s;
    }
    
    .zoom-button:hover {
      background-color: #f5f7fa;
    }
    
    /* Responsive adjustments */
    @media (max-width: 768px) {
      .header {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
      }
      
      .header-details {
        flex-direction: column;
        gap: 5px;
      }
      
      .legend-items {
        gap: 10px;
      }
      
      .controls {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
      }
      
      .graph-container {
        height: calc(100vh - 280px);
      }
      
      .zoom-controls {
        top: auto;
        bottom: 10px;
      }
    }
  `;
}
