import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../../shared/logger/logger.interface';
import {
  generateGraphRenderer,
  generateGraphDataScript,
} from './visualization/graph-renderer';
import { generateGraphHtml } from './visualization/graph-html-template';

/**
 * Interface for state objects passed to graph visualization
 */
interface GraphState {
  runId: string;
  [key: string]: any;
}

/**
 * Options for the visualization generator
 */
interface VisualizationOptions {
  visualizationsPath?: string;
  logger?: Logger;
  title?: string;
}

/**
 * Generate a visualization for a workflow execution
 *
 * @param state The workflow state to visualize
 * @param options Options for visualization generation
 * @returns The URL to the generated visualization, or null if generation failed
 */
export function generateVisualization(
  state: GraphState,
  options: VisualizationOptions = {},
): string | null {
  if (!state || !state.runId) {
    if (options.logger) {
      options.logger.warn(
        'Cannot generate visualization: missing state or runId',
      );
    }
    return null;
  }

  try {
    // Ensure the visualizations directory exists
    const visualizationsPath = options.visualizationsPath || 'visualizations';
    const dirPath = path.join(process.cwd(), visualizationsPath);

    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }

    // Prepare data for visualization
    const visualizationData = prepareStateDataForVisualization(state);

    // Generate the HTML visualization
    const html = generateGraphHtml(state.runId, visualizationData);

    // Write to file
    const fileName = `${state.runId}.html`;
    const filePath = path.join(dirPath, fileName);
    fs.writeFileSync(filePath, html, 'utf8');

    // Generate and return the URL
    const urlPath = `/${visualizationsPath}/${fileName}`;

    if (options.logger) {
      options.logger.debug(`Generated visualization at ${urlPath}`);
    }

    return urlPath;
  } catch (error) {
    if (options.logger) {
      options.logger.error('Error generating visualization', {
        error: error instanceof Error ? error.message : String(error),
        runId: state.runId,
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return null;
  }
}

/**
 * Prepare state data for visualization by simplifying and sanitizing values
 */
function prepareStateDataForVisualization(state: GraphState): any {
  try {
    // Create a copy of the state to avoid modifying the original
    return simplifyValue(state);
  } catch (error) {
    console.error('Error preparing state data:', error);
    // Return a minimal state
    return {
      runId: state.runId,
      status: state.status || 'unknown',
      error: 'Failed to process state data for visualization',
    };
  }
}

/**
 * Simplify complex objects for visualization
 */
function simplifyValue(value: any, depth = 0): any {
  // Prevent circular references and overly deep nesting
  if (depth > 3) {
    if (Array.isArray(value)) {
      return `Array(${value.length})`;
    }
    if (typeof value === 'object' && value !== null) {
      return 'Object';
    }
    return value;
  }

  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'function') {
    return 'function';
  }

  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      if (value.length > 10) {
        return value
          .slice(0, 10)
          .map((v) => simplifyValue(v, depth + 1))
          .concat([`...${value.length - 10} more items`]);
      }
      return value.map((v) => simplifyValue(v, depth + 1));
    }

    const result: Record<string, any> = {};
    for (const key in value) {
      if (Object.prototype.hasOwnProperty.call(value, key)) {
        // Skip functions and private/internal properties
        if (
          typeof value[key] !== 'function' &&
          !key.startsWith('_') &&
          key !== 'state' &&
          key !== 'messages' &&
          key !== 'artifacts' &&
          key !== 'runnables'
        ) {
          result[key] = simplifyValue(value[key], depth + 1);
        }
      }
    }
    return result;
  }

  // Handle specific value types that might cause issues
  if (typeof value === 'string' && value.length > 1000) {
    return value.substring(0, 1000) + '...';
  }

  return value;
}
