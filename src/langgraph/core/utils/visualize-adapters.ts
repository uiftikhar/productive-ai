/**
 * Adapter-specific visualization utilities for LangGraph
 */

import * as path from 'path';
import { exec } from 'child_process';
import { BaseAgentAdapter } from '../adapters/base-agent.adapter';
import { MeetingAnalysisLangGraphAdapter } from '../adapters/meeting-analysis-langgraph.adapter';
import { TaskExecutionAdapter } from '../adapters/task-execution.adapter';
import {
  saveGraphHtml,
  createVisualizationServer,
  GraphMetadata,
  extractGraphMetadata
} from './graph-visualization';

/**
 * Default visualization directory
 */
const DEFAULT_VIZ_DIR = path.join(process.cwd(), 'visualizations');

/**
 * Custom node descriptions for the BaseAgentAdapter graph
 */
const BASE_AGENT_DESCRIPTIONS: Record<string, string> = {
  "initialize": "Initialize the agent and prepare its state",
  "pre_execute": "Perform pre-execution setup and validation",
  "execute": "Execute the agent's main capability",
  "post_execute": "Process results and cleanup after execution",
  "handle_error": "Handle any errors that occurred during execution"
};

/**
 * Custom node descriptions for the MeetingAnalysisAdapter graph
 */
const MEETING_ANALYSIS_DESCRIPTIONS: Record<string, string> = {
  "initialize": "Initialize the meeting analysis workflow",
  "process_chunk": "Process an individual chunk of the meeting transcript",
  "check_chunks": "Check if there are more chunks to process",
  "generate_final_analysis": "Combine chunk analyses to generate a final meeting summary",
  "store_results": "Store the final meeting analysis results",
  "handle_error": "Handle errors in the meeting analysis process"
};

/**
 * Custom node descriptions for the TaskExecutionAdapter graph
 */
const TASK_EXECUTION_DESCRIPTIONS: Record<string, string> = {
  "prepare": "Prepare the task for execution",
  "execute": "Execute the task with the specified capability",
  "error_handler": "Handle errors and implement retry logic",
  "finalize": "Finalize the task and clean up resources"
};

/**
 * Create a visualization for a BaseAgentAdapter
 * @param adapter The adapter to visualize
 * @param outputDir Directory to save the visualization (default: ./visualizations)
 * @param openInBrowser Whether to open the visualization in a browser (default: true)
 */
export async function visualizeBaseAgentAdapter(
  adapter: BaseAgentAdapter,
  outputDir: string = DEFAULT_VIZ_DIR,
  openInBrowser: boolean = true
): Promise<string> {
  // Create the graph
  const graph = adapter.createGraph();
  
  // Define metadata
  const metadata: GraphMetadata = extractGraphMetadata(
    graph,
    `${adapter.constructor.name} - BaseAgentAdapter Workflow`,
    BASE_AGENT_DESCRIPTIONS
  );
  
  // Generate and save the HTML visualization
  const filename = `base_agent_${Date.now()}`;
  const filePath = await saveGraphHtml(
    graph,
    filename,
    metadata.title,
    outputDir
  );
  
  // Open in browser if requested
  if (openInBrowser) {
    openVisualization(filePath);
  }
  
  return filePath;
}

/**
 * Create a visualization for a MeetingAnalysisLangGraphAdapter
 * @param adapter The adapter to visualize
 * @param outputDir Directory to save the visualization (default: ./visualizations)
 * @param openInBrowser Whether to open the visualization in a browser (default: true)
 */
export async function visualizeMeetingAnalysisAdapter(
  adapter: MeetingAnalysisLangGraphAdapter,
  outputDir: string = DEFAULT_VIZ_DIR,
  openInBrowser: boolean = true
): Promise<string> {
  // Use private method to create the graph
  // We need to access the private method using type assertion
  const createGraphMethod = (adapter as any).createMeetingAnalysisGraph;
  if (!createGraphMethod) {
    throw new Error('Unable to access graph creation method');
  }
  
  const graph = createGraphMethod.call(adapter);
  
  // Define metadata
  const metadata: GraphMetadata = extractGraphMetadata(
    graph,
    'Meeting Analysis Workflow',
    MEETING_ANALYSIS_DESCRIPTIONS
  );
  
  // Generate and save the HTML visualization
  const filename = `meeting_analysis_${Date.now()}`;
  const filePath = await saveGraphHtml(
    graph,
    filename,
    metadata.title,
    outputDir
  );
  
  // Open in browser if requested
  if (openInBrowser) {
    openVisualization(filePath);
  }
  
  return filePath;
}

/**
 * Create a visualization for a TaskExecutionAdapter
 * @param adapter The adapter to visualize
 * @param outputDir Directory to save the visualization (default: ./visualizations)
 * @param openInBrowser Whether to open the visualization in a browser (default: true)
 */
export async function visualizeTaskExecutionAdapter(
  adapter: TaskExecutionAdapter,
  outputDir: string = DEFAULT_VIZ_DIR,
  openInBrowser: boolean = true
): Promise<string> {
  // Use private method to create the graph
  // We need to access the private method using type assertion
  const createGraphMethod = (adapter as any).createTaskExecutionGraph;
  if (!createGraphMethod) {
    throw new Error('Unable to access graph creation method');
  }
  
  const graph = createGraphMethod.call(adapter);
  
  // Define metadata
  const metadata: GraphMetadata = extractGraphMetadata(
    graph,
    'Task Execution Workflow',
    TASK_EXECUTION_DESCRIPTIONS
  );
  
  // Generate and save the HTML visualization
  const filename = `task_execution_${Date.now()}`;
  const filePath = await saveGraphHtml(
    graph,
    filename,
    metadata.title,
    outputDir
  );
  
  // Open in browser if requested
  if (openInBrowser) {
    openVisualization(filePath);
  }
  
  return filePath;
}

/**
 * Create a live debugging server for a BaseAgentAdapter
 * @param adapter The adapter to visualize
 * @param port Port to run the server on (default: 3300)
 * @param openInBrowser Whether to open the visualization in a browser (default: true)
 */
export function createBaseAgentDebugServer(
  adapter: BaseAgentAdapter,
  port: number = 3300,
  openInBrowser: boolean = true
): void {
  // Create the graph
  const graph = adapter.createGraph();
  
  // Start the server
  const server = createVisualizationServer(
    graph,
    port,
    `${adapter.constructor.name} - Live Debug View`
  );
  
  // Open in browser if requested
  if (openInBrowser) {
    openVisualization(`http://localhost:${port}`);
  }
  
  console.log(`Debug server running at http://localhost:${port}`);
}

/**
 * Create a live debugging server for a MeetingAnalysisLangGraphAdapter
 * @param adapter The adapter to visualize
 * @param port Port to run the server on (default: 3301)
 * @param openInBrowser Whether to open the visualization in a browser (default: true)
 */
export function createMeetingAnalysisDebugServer(
  adapter: MeetingAnalysisLangGraphAdapter,
  port: number = 3301,
  openInBrowser: boolean = true
): void {
  // Use private method to create the graph
  // We need to access the private method using type assertion
  const createGraphMethod = (adapter as any).createMeetingAnalysisGraph;
  if (!createGraphMethod) {
    throw new Error('Unable to access graph creation method');
  }
  
  const graph = createGraphMethod.call(adapter);
  
  // Start the server
  const server = createVisualizationServer(
    graph,
    port,
    'Meeting Analysis - Live Debug View'
  );
  
  // Open in browser if requested
  if (openInBrowser) {
    openVisualization(`http://localhost:${port}`);
  }
  
  console.log(`Debug server running at http://localhost:${port}`);
}

/**
 * Create a live debugging server for a TaskExecutionAdapter
 * @param adapter The adapter to visualize
 * @param port Port to run the server on (default: 3302)
 * @param openInBrowser Whether to open the visualization in a browser (default: true)
 */
export function createTaskExecutionDebugServer(
  adapter: TaskExecutionAdapter,
  port: number = 3302,
  openInBrowser: boolean = true
): void {
  // Use private method to create the graph
  // We need to access the private method using type assertion
  const createGraphMethod = (adapter as any).createTaskExecutionGraph;
  if (!createGraphMethod) {
    throw new Error('Unable to access graph creation method');
  }
  
  const graph = createGraphMethod.call(adapter);
  
  // Start the server
  const server = createVisualizationServer(
    graph,
    port,
    'Task Execution - Live Debug View'
  );
  
  // Open in browser if requested
  if (openInBrowser) {
    openVisualization(`http://localhost:${port}`);
  }
  
  console.log(`Debug server running at http://localhost:${port}`);
}

/**
 * Open a visualization in the default browser
 * @param filePath Path to the visualization file
 */
function openVisualization(filePath: string): void {
  // Determine the command based on the platform
  let command: string;
  
  switch (process.platform) {
    case 'darwin':
      command = `open "${filePath}"`;
      break;
    case 'win32':
      command = `start "" "${filePath}"`;
      break;
    default:
      command = `xdg-open "${filePath}"`;
      break;
  }
  
  // Execute the command
  exec(command, (error) => {
    if (error) {
      console.error(`Error opening visualization: ${error.message}`);
    }
  });
}

/**
 * Export a function to add visualization methods to adapter instances
 * This allows calling adapter.visualize() directly
 */
export function addVisualizationMethods(): void {
  // Add to BaseAgentAdapter prototype
  (BaseAgentAdapter.prototype as any).visualize = function(
    outputDir: string = DEFAULT_VIZ_DIR,
    openInBrowser: boolean = true
  ): Promise<string> {
    return visualizeBaseAgentAdapter(this, outputDir, openInBrowser);
  };
  
  (BaseAgentAdapter.prototype as any).createDebugServer = function(
    port: number = 3300,
    openInBrowser: boolean = true
  ): void {
    return createBaseAgentDebugServer(this, port, openInBrowser);
  };
  
  // Add to MeetingAnalysisLangGraphAdapter prototype
  (MeetingAnalysisLangGraphAdapter.prototype as any).visualize = function(
    outputDir: string = DEFAULT_VIZ_DIR,
    openInBrowser: boolean = true
  ): Promise<string> {
    return visualizeMeetingAnalysisAdapter(this, outputDir, openInBrowser);
  };
  
  (MeetingAnalysisLangGraphAdapter.prototype as any).createDebugServer = function(
    port: number = 3301,
    openInBrowser: boolean = true
  ): void {
    return createMeetingAnalysisDebugServer(this, port, openInBrowser);
  };
  
  // Add to TaskExecutionAdapter prototype
  (TaskExecutionAdapter.prototype as any).visualize = function(
    outputDir: string = DEFAULT_VIZ_DIR,
    openInBrowser: boolean = true
  ): Promise<string> {
    return visualizeTaskExecutionAdapter(this, outputDir, openInBrowser);
  };
  
  (TaskExecutionAdapter.prototype as any).createDebugServer = function(
    port: number = 3302,
    openInBrowser: boolean = true
  ): void {
    return createTaskExecutionDebugServer(this, port, openInBrowser);
  };
} 