import { Request, Response } from 'express';
import express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { ServiceRegistry } from '../../langgraph/agentic-meeting-analysis/services/service-registry';

// Define WebSocket interfaces instead of module augmentation
interface WebSocket {
  readonly readyState: number;
  send(data: string): void;
  on(event: 'message', cb: (data: string) => void): this;
  on(event: 'close', cb: () => void): this;
  on(event: 'error', cb: (err: Error) => void): this;
  on(event: string, cb: (...args: any[]) => void): this;
}

interface WebSocketServer {
  on(event: 'connection', cb: (ws: WebSocket) => void): void;
}

interface WebSocketStatic {
  readonly OPEN: number;
  Server: new (options: {
    server: http.Server;
    path: string;
  }) => WebSocketServer;
}

// Use standard require import for ws

const WebSocket: WebSocketStatic = require('ws');

// Map to store active WebSocket connections by runId
const activeConnections: Map<string, WebSocket[]> = new Map();
const logger = new ConsoleLogger();

/**
 * Initialize WebSocket server for real-time visualization updates
 */
export function initializeVisualizationWebSocket(server: http.Server) {
  // Create WebSocket server with just the basic options
  const wss = new WebSocket.Server({ 
    server,
    path: '/ws/visualization'
  });

  // Log all connections for debugging
  logger.info('WebSocket server for visualizations initialized at /ws/visualization');

  wss.on('connection', (ws: WebSocket) => {
    let runId: string | null = null;
    
    logger.info('New WebSocket connection established');

    // Handle messages from clients
    ws.on('message', (message: string) => {
      try {
        const data = JSON.parse(message);

        // If this is a subscription message, register the connection
        if (data.type === 'subscribe' && data.runId) {
          runId = data.runId;

          if (runId) {
            // Add this connection to the activeConnections map
            if (!activeConnections.has(runId)) {
              activeConnections.set(runId, []);
            }

            const connections = activeConnections.get(runId);
            if (connections) {
              connections.push(ws);
            }

            logger.info(
              `Client subscribed to visualization updates for runId: ${runId}`,
            );

            // Send confirmation back to the client
            ws.send(
              JSON.stringify({
                type: 'subscribed',
                runId: runId,
              }),
            );
          }
        }
      } catch (error) {
        logger.error('Error processing WebSocket message', { error });
      }
    });

    // Remove the connection when it's closed
    ws.on('close', () => {
      if (runId) {
        const connections = activeConnections.get(runId);
        if (connections) {
          const index = connections.indexOf(ws);
          if (index !== -1) {
            connections.splice(index, 1);
          }

          // If no more connections for this runId, clean up
          if (connections.length === 0) {
            activeConnections.delete(runId);
          }
        }
        logger.info(`Client unsubscribed from runId: ${runId}`);
      }
    });

    // Send initial connection acknowledgment
    ws.send(JSON.stringify({ type: 'connected' }));
  });

  logger.info('WebSocket server for visualizations initialized');
  return wss;
}

/**
 * Broadcast a state update to all clients subscribed to a particular runId
 */
export function broadcastStateUpdate(runId: string, state: any) {
  const connections = activeConnections.get(runId);
  if (!connections || connections.length === 0) {
    return;
  }

  const message = JSON.stringify({
    type: 'stateUpdate',
    runId: runId,
    state: state,
    timestamp: Date.now(),
  });

  let activeCount = 0;
  connections.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      activeCount++;
    }
  });

  if (activeCount > 0) {
    logger.debug(
      `Sent state update to ${activeCount} clients for runId: ${runId}`,
    );
  }
}

/**
 * Serve visualization file
 */
export const getVisualization = async (req: Request, res: Response) => {
  try {
    const filename = req.params.filename;

    // Validate the filename to prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return res.status(400).json({
        error: 'Invalid filename',
        message: 'The requested filename is invalid',
      });
    }

    const visualizationsPath = 'visualizations';
    const filePath = path.join(process.cwd(), visualizationsPath, filename);

    // Check if the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: 'File not found',
        message: `Visualization file "${filename}" not found`,
      });
    }

    // Serve the HTML file
    res.sendFile(filePath);
  } catch (error) {
    logger.error('Error serving visualization file', { error });
    res.status(500).json({
      error: 'Server error',
      message: 'An error occurred while serving the visualization',
    });
  }
};

/**
 * Get list of available visualizations
 */
export const listVisualizations = async (req: Request, res: Response) => {
  try {
    const visualizationsPath = path.join(process.cwd(), 'visualizations');

    // Ensure the directory exists
    if (!fs.existsSync(visualizationsPath)) {
      return res.json({ visualizations: [] });
    }

    // Get all HTML files in the visualizations directory
    const files = fs
      .readdirSync(visualizationsPath)
      .filter((file) => file.endsWith('.html'))
      .map((file) => {
        const stats = fs.statSync(path.join(visualizationsPath, file));
        return {
          filename: file,
          runId: file.replace('.html', ''),
          url: `/visualizations/${file}`,
          createdAt: stats.mtime.toISOString(),
          size: stats.size,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );

    return res.json({ visualizations: files });
  } catch (error) {
    logger.error('Error listing visualizations', { error });
    res.status(500).json({
      error: 'Server error',
      message: 'An error occurred while listing visualizations',
    });
  }
};

/**
 * Get agent graph data for a specific session
 */
export const getAgentGraphData = async (req: Request, res: Response) => {
  try {
    const sessionId = req.params.sessionId;
    
    if (!sessionId) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Session ID is required'
      });
    }
    
    // Get the visualization service from the registry
    const registry = ServiceRegistry.getInstance();
    const visualizationService = registry.getAgentVisualizationService();
    
    if (!visualizationService) {
      logger.info('Agent visualization service not available, creating empty response');
      // Return empty graph data rather than error
      return res.json({
        sessionId,
        timestamp: new Date().toISOString(),
        nodes: [],
        edges: []
      });
    }
    
    // Get current graph data for the session
    const graphData = visualizationService.getGraphData(sessionId);
    
    if (!graphData) {
      logger.info(`No graph data found for session ${sessionId}, returning empty graph`);
      // Return empty graph data rather than 404 error
      return res.json({
        sessionId,
        timestamp: new Date().toISOString(),
        nodes: [],
        edges: []
      });
    }
    
    // Return the graph data
    return res.json({
      sessionId,
      timestamp: new Date().toISOString(),
      nodes: graphData.nodes || [],
      edges: graphData.edges || []
    });
  } catch (error) {
    logger.error('Error serving graph data', { error });
    // Return empty graph instead of error
    return res.json({
      sessionId: req.params.sessionId,
      timestamp: new Date().toISOString(),
      error: 'An error occurred while serving the graph data',
      nodes: [],
      edges: []
    });
  }
};
