/**
 * Visualization Service
 *
 * Generates visualizations for agent execution, strategies, and reflections
 * @deprecated Will be replaced by agentic self-organizing behavior
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { TaskStrategy } from '../interfaces/metacognition.interface';

// Configuration for visualization generation
interface VisualizationConfig {
  outputDir: string;
  baseUrl: string;
  enabled: boolean;
  format: 'svg' | 'png' | 'html';
}

interface StrategyStepModification {
  original: string;
  revised: string;
}

interface StrategyChanges {
  addedSteps: string[];
  removedSteps: string[];
  modifiedSteps: StrategyStepModification[];
  preservedSteps: string[];
}

interface StrategyRevisionData {
  originalStrategy: TaskStrategy;
  revisedStrategy: TaskStrategy;
  changes: StrategyChanges;
}

/**
 * Visualization service for generating agent execution visualizations
 * @deprecated Will be replaced by agentic self-organizing behavior
 */
export class VisualizationService {
  private static instance: VisualizationService;
  private logger: Logger;
  private config: VisualizationConfig;

  /**
   * Private constructor (singleton pattern)
   */
  private constructor(
    options: {
      logger?: Logger;
      config?: Partial<VisualizationConfig>;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();

    // Initialize with default config and override with options
    this.config = {
      outputDir:
        process.env.VISUALIZATION_OUTPUT_DIR ||
        path.join(process.cwd(), 'visualizations'),
      baseUrl: process.env.VISUALIZATION_BASE_URL || '/visualizations',
      enabled: process.env.VISUALIZATION_ENABLED !== 'false',
      format:
        (process.env.VISUALIZATION_FORMAT as 'svg' | 'png' | 'html') || 'html',
      ...(options.config || {}),
    };

    // Ensure output directory exists
    this.ensureOutputDirectory();

    this.logger.info('VisualizationService initialized', {
      outputDir: this.config.outputDir,
      enabled: this.config.enabled,
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(
    options: {
      logger?: Logger;
      config?: Partial<VisualizationConfig>;
    } = {},
  ): VisualizationService {
    if (!VisualizationService.instance) {
      VisualizationService.instance = new VisualizationService(options);
    }
    return VisualizationService.instance;
  }

  /**
   * Ensure the output directory exists
   */
  private ensureOutputDirectory(): void {
    try {
      if (!fs.existsSync(this.config.outputDir)) {
        fs.mkdirSync(this.config.outputDir, { recursive: true });
      }
    } catch (error) {
      this.logger.warn('Failed to create visualization output directory', {
        error,
      });
    }
  }

  /**
   * Generate a visualization for strategy revision
   * @deprecated Will be replaced by agentic self-organizing behavior
   */
  public async generateStrategyRevisionVisualization(params: {
    taskId: string;
    originalStrategy: TaskStrategy;
    revisedStrategy: TaskStrategy;
    errorInfo: {
      type: string;
      message: string;
      failedStep?: string;
    };
    agent: {
      id: string;
      name: string;
    };
    timestamp: number;
  }): Promise<string | null> {
    if (!this.config.enabled) {
      return null;
    }

    try {
      const {
        taskId,
        originalStrategy,
        revisedStrategy,
        errorInfo,
        agent,
        timestamp,
      } = params;

      // Generate a unique ID for this visualization
      const vizId = `strategy-revision-${taskId}-${uuidv4().substring(0, 8)}`;

      // Create visualization data
      const visualizationData = {
        id: vizId,
        type: 'strategy-revision',
        taskId,
        agent,
        timestamp,
        originalStrategy: {
          id: originalStrategy.id,
          name: originalStrategy.name,
          description: originalStrategy.description,
          steps: originalStrategy.steps,
          revisionAttempt: originalStrategy.revisionAttempt || 0,
        },
        revisedStrategy: {
          id: revisedStrategy.id,
          name: revisedStrategy.name,
          description: revisedStrategy.description,
          steps: revisedStrategy.steps,
          revisionAttempt: revisedStrategy.revisionAttempt || 0,
          revisionReason: revisedStrategy.revisionReason || 'unknown',
        },
        error: errorInfo,
        // Track steps that changed
        changes: this.analyzeStrategyChanges(originalStrategy, revisedStrategy),
      };

      // Generate the visualization file
      const filename = `${vizId}.json`;
      const outputPath = path.join(this.config.outputDir, filename);

      // Write the data
      fs.writeFileSync(outputPath, JSON.stringify(visualizationData, null, 2));

      // For HTML format, generate the visualization
      if (this.config.format === 'html') {
        await this.generateHtmlVisualization(visualizationData, vizId);
      }

      this.logger.info(`Generated strategy revision visualization: ${vizId}`, {
        taskId,
        outputPath,
      });

      // Return the URL to the visualization
      return `${this.config.baseUrl}/${vizId}.${this.config.format}`;
    } catch (error) {
      this.logger.error('Failed to generate strategy revision visualization', {
        error,
      });
      return null;
    }
  }

  /**
   * Analyze changes between original and revised strategies
   */
  private analyzeStrategyChanges(
    originalStrategy: TaskStrategy,
    revisedStrategy: TaskStrategy,
  ): {
    addedSteps: string[];
    removedSteps: string[];
    modifiedSteps: Array<{ original: string; revised: string }>;
    preservedSteps: string[];
  } {
    const addedSteps: string[] = [];
    const removedSteps: string[] = [];
    const modifiedSteps: Array<{ original: string; revised: string }> = [];
    const preservedSteps: string[] = [];

    // Find preserved and modified steps using Levenshtein distance
    const originalSteps = new Set(originalStrategy.steps);
    const trackedOriginals = new Set<string>();

    revisedStrategy.steps.forEach((revisedStep) => {
      let bestMatch: { step: string; similarity: number } = {
        step: '',
        similarity: 0,
      };

      // Find the best match among original steps not yet tracked
      originalStrategy.steps.forEach((originalStep) => {
        if (!trackedOriginals.has(originalStep)) {
          const similarity = this.calculateSimilarity(
            originalStep,
            revisedStep,
          );
          if (similarity > bestMatch.similarity) {
            bestMatch = { step: originalStep, similarity };
          }
        }
      });

      // Decide what to do based on similarity
      if (bestMatch.similarity > 0.8) {
        // Highly similar - preserved
        trackedOriginals.add(bestMatch.step);
        if (bestMatch.similarity === 1) {
          preservedSteps.push(revisedStep);
        } else {
          modifiedSteps.push({
            original: bestMatch.step,
            revised: revisedStep,
          });
        }
      } else {
        // Low similarity - new step
        addedSteps.push(revisedStep);
      }
    });

    // Find removed steps (original steps not tracked)
    originalStrategy.steps.forEach((step) => {
      if (!trackedOriginals.has(step)) {
        removedSteps.push(step);
      }
    });

    return {
      addedSteps,
      removedSteps,
      modifiedSteps,
      preservedSteps,
    };
  }

  /**
   * Calculate similarity between two strings using Levenshtein distance
   */
  private calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (a.length === 0 || b.length === 0) return 0.0;

    // Simple implementation of Levenshtein distance
    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= a.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost, // substitution
        );
      }
    }

    // Calculate similarity as 1 - normalized distance
    const distance = matrix[a.length][b.length];
    const maxLength = Math.max(a.length, b.length);

    return 1 - distance / maxLength;
  }

  /**
   * Generate HTML visualization file from visualization data
   */
  private async generateHtmlVisualization(
    data: any,
    vizId: string,
  ): Promise<string> {
    const filename = `${vizId}.html`;
    const outputPath = path.join(this.config.outputDir, filename);

    // Simple HTML template for strategy revision visualization
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Strategy Revision Visualization</title>
  <style>
    body { font-family: sans-serif; line-height: 1.6; max-width: 1200px; margin: 0 auto; padding: 20px; }
    .header { background: #f0f0f0; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .strategy { margin-bottom: 30px; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
    .strategy-name { font-size: 1.2em; font-weight: bold; margin-bottom: 10px; }
    .strategy-description { color: #666; margin-bottom: 15px; }
    .steps { list-style-type: none; padding: 0; }
    .step { padding: 8px 10px; margin: 5px 0; border-radius: 3px; }
    .preserved { background: #e0f0e0; border-left: 4px solid #4caf50; }
    .added { background: #e0f0ff; border-left: 4px solid #2196f3; }
    .removed { background: #ffe0e0; border-left: 4px solid #f44336; text-decoration: line-through; }
    .modified { background: #fff0e0; border-left: 4px solid #ff9800; }
    .error-info { background: #ffe0e0; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .changes-summary { margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 5px; }
    .metadata { font-size: 0.8em; color: #666; margin-top: 30px; border-top: 1px solid #eee; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Strategy Revision Visualization</h1>
    <p>Task ID: ${data.taskId}</p>
    <p>Agent: ${data.agent.name} (${data.agent.id})</p>
    <p>Time: ${new Date(data.timestamp).toLocaleString()}</p>
  </div>
  
  <div class="error-info">
    <h2>Error Information</h2>
    <p><strong>Type:</strong> ${data.error.type}</p>
    <p><strong>Message:</strong> ${data.error.message}</p>
    ${data.error.failedStep ? `<p><strong>Failed Step:</strong> ${data.error.failedStep}</p>` : ''}
  </div>
  
  <div class="changes-summary">
    <h2>Changes Summary</h2>
    <p><strong>Steps added:</strong> ${data.changes.addedSteps.length}</p>
    <p><strong>Steps removed:</strong> ${data.changes.removedSteps.length}</p>
    <p><strong>Steps modified:</strong> ${data.changes.modifiedSteps.length}</p>
    <p><strong>Steps preserved:</strong> ${data.changes.preservedSteps.length}</p>
  </div>
  
  <div class="strategies-container">
    <div class="strategy original-strategy">
      <div class="strategy-name">Original Strategy: ${data.originalStrategy.name}</div>
      <div class="strategy-description">${data.originalStrategy.description}</div>
      <ul class="steps">
        ${data.originalStrategy.steps
          .map((step: string) => {
            const isRemoved = data.changes.removedSteps.includes(step);
            const isModified = data.changes.modifiedSteps.some(
              (m: StrategyStepModification) => m.original === step,
            );
            let className = 'step';
            if (isRemoved) className += ' removed';
            else if (isModified) className += ' modified';
            else className += ' preserved';
            return `<li class="${className}">${step}</li>`;
          })
          .join('')}
      </ul>
    </div>
    
    <div class="strategy revised-strategy">
      <div class="strategy-name">Revised Strategy: ${data.revisedStrategy.name}</div>
      <div class="strategy-description">${data.revisedStrategy.description}</div>
      <p><strong>Revision Reason:</strong> ${data.revisedStrategy.revisionReason}</p>
      <ul class="steps">
        ${data.revisedStrategy.steps
          .map((step: string) => {
            const isAdded = data.changes.addedSteps.includes(step);
            const isModified = data.changes.modifiedSteps.some(
              (m: StrategyStepModification) => m.revised === step,
            );
            let className = 'step';
            if (isAdded) className += ' added';
            else if (isModified) className += ' modified';
            else className += ' preserved';
            return `<li class="${className}">${step}</li>`;
          })
          .join('')}
      </ul>
    </div>
  </div>
  
  <div class="metadata">
    <p>Visualization ID: ${vizId}</p>
    <p>Generated: ${new Date().toISOString()}</p>
  </div>
  
  <script>
    // Add any interactive functionality here if needed
  </script>
</body>
</html>`;

    // Write the HTML file
    fs.writeFileSync(outputPath, html);

    return filename;
  }

  /**
   * Generate a visualization for execution progress
   */
  public async generateProgressVisualization(params: {
    taskId: string;
    capability: string;
    progress: any;
    agent: {
      id: string;
      name: string;
    };
  }): Promise<string | null> {
    // Implementation simplified for brevity
    if (!this.config.enabled) {
      return null;
    }

    try {
      const { taskId, capability, progress, agent } = params;
      const vizId = `progress-${taskId}-${uuidv4().substring(0, 8)}`;

      // Just store the data for now
      const visualizationData = {
        id: vizId,
        type: 'progress',
        taskId,
        capability,
        agent,
        progress,
        timestamp: Date.now(),
      };

      const filename = `${vizId}.json`;
      const outputPath = path.join(this.config.outputDir, filename);

      fs.writeFileSync(outputPath, JSON.stringify(visualizationData, null, 2));

      this.logger.info(`Generated progress visualization: ${vizId}`, {
        taskId,
        outputPath,
      });

      return `${this.config.baseUrl}/${vizId}.${this.config.format}`;
    } catch (error) {
      this.logger.error('Failed to generate progress visualization', { error });
      return null;
    }
  }
}
