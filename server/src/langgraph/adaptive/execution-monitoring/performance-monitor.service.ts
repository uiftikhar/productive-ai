import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import {
  ExecutionStatusLevel,
  PerformanceMetric,
  PerformanceMonitorService,
  TaskExecutionMetrics,
} from '../interfaces/execution-monitoring.interface';

/**
 * Implementation of the performance monitoring service
 */
export class PerformanceMonitorServiceImpl
  implements PerformanceMonitorService
{
  private logger: Logger;
  private metrics: Map<string, PerformanceMetric> = new Map();
  private taskMetrics: Map<string, TaskExecutionMetrics> = new Map();
  private metricChangeListeners: Map<
    string,
    ((metric: PerformanceMetric) => void)[]
  > = new Map();
  private historicalData: Map<
    string,
    {
      timestamps: Date[];
      values: number[];
    }
  > = new Map();
  private anomalyDetectionThreshold = 2.0; // Standard deviations for anomaly detection
  private dataRetentionLimit = 100; // Maximum historical data points to keep

  constructor(
    options: {
      logger?: Logger;
      anomalyDetectionThreshold?: number;
      dataRetentionLimit?: number;
    } = {},
  ) {
    this.logger = options.logger || new ConsoleLogger();

    if (options.anomalyDetectionThreshold !== undefined) {
      this.anomalyDetectionThreshold = options.anomalyDetectionThreshold;
    }

    if (options.dataRetentionLimit !== undefined) {
      this.dataRetentionLimit = options.dataRetentionLimit;
    }

    this.logger.info('Performance monitor service initialized', {
      anomalyDetectionThreshold: this.anomalyDetectionThreshold,
      dataRetentionLimit: this.dataRetentionLimit,
    });
  }

  /**
   * Register a new performance metric
   */
  registerMetric(
    metric: Omit<PerformanceMetric, 'timestamp' | 'trendData'>,
  ): string {
    const metricId = metric.id || uuidv4();
    const now = new Date();

    // Create full metric object with defaults
    const fullMetric: PerformanceMetric = {
      ...metric,
      id: metricId,
      timestamp: now,
      trendData: {
        timestamps: [now],
        values: [metric.value],
      },
    };

    // Store the metric
    this.metrics.set(metricId, fullMetric);

    // Initialize historical data
    this.historicalData.set(metricId, {
      timestamps: [now],
      values: [metric.value],
    });

    this.logger.info(
      `Registered performance metric: ${metric.name} (${metricId})`,
      {
        metricId,
        name: metric.name,
        value: metric.value,
        unit: metric.unit,
      },
    );

    return metricId;
  }

  /**
   * Update a metric's value
   */
  updateMetric(metricId: string, value: number): boolean {
    const metric = this.metrics.get(metricId);
    if (!metric) {
      this.logger.warn(`Cannot update non-existent metric ${metricId}`);
      return false;
    }

    const now = new Date();

    // Update historical data
    const history = this.historicalData.get(metricId);
    if (history) {
      history.timestamps.push(now);
      history.values.push(value);

      // Trim history if exceeds limit
      if (history.timestamps.length > this.dataRetentionLimit) {
        history.timestamps = history.timestamps.slice(-this.dataRetentionLimit);
        history.values = history.values.slice(-this.dataRetentionLimit);
      }

      this.historicalData.set(metricId, history);
    }

    // Update metric
    const updatedMetric: PerformanceMetric = {
      ...metric,
      value,
      timestamp: now,
      trendData: {
        timestamps: history?.timestamps.slice(-10) || [now],
        values: history?.values.slice(-10) || [value],
      },
    };

    // Store updated metric
    this.metrics.set(metricId, updatedMetric);

    // Check if the metric indicates a significant status change
    const status = this.getMetricStatus(updatedMetric);
    if (this.isSignificantStatusChange(status)) {
      this.logger.info(
        `Significant status change in metric ${metric.name}: ${status}`,
        {
          metricId,
          value,
          status,
        },
      );
    }

    // Notify listeners
    this.notifyMetricListeners(metricId, updatedMetric);

    return true;
  }

  /**
   * Get a metric by ID
   */
  getMetric(metricId: string): PerformanceMetric | undefined {
    return this.metrics.get(metricId);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Record<string, PerformanceMetric> {
    const result: Record<string, PerformanceMetric> = {};

    for (const [id, metric] of this.metrics.entries()) {
      result[id] = metric;
    }

    return result;
  }

  /**
   * Get overall execution status based on all metrics
   */
  getExecutionStatus(): ExecutionStatusLevel {
    const metrics = Array.from(this.metrics.values());
    if (metrics.length === 0) {
      return ExecutionStatusLevel.GOOD; // Default to good if no metrics
    }

    // Get status level for each metric
    const statusLevels = metrics.map((metric) => this.getMetricStatus(metric));

    // Count status level occurrences
    const statusCounts: Record<ExecutionStatusLevel, number> = {
      [ExecutionStatusLevel.OPTIMAL]: 0,
      [ExecutionStatusLevel.GOOD]: 0,
      [ExecutionStatusLevel.ACCEPTABLE]: 0,
      [ExecutionStatusLevel.CONCERNING]: 0,
      [ExecutionStatusLevel.PROBLEMATIC]: 0,
      [ExecutionStatusLevel.CRITICAL]: 0,
      [ExecutionStatusLevel.FAILED]: 0,
    };

    for (const status of statusLevels) {
      statusCounts[status]++;
    }

    // Determine overall status using a pessimistic approach:
    // - If any metric is FAILED, the system is FAILED
    // - If any metric is CRITICAL, the system is CRITICAL
    // - If any metric is PROBLEMATIC, the system is PROBLEMATIC
    // - And so on...
    if (statusCounts[ExecutionStatusLevel.FAILED] > 0) {
      return ExecutionStatusLevel.FAILED;
    } else if (statusCounts[ExecutionStatusLevel.CRITICAL] > 0) {
      return ExecutionStatusLevel.CRITICAL;
    } else if (statusCounts[ExecutionStatusLevel.PROBLEMATIC] > 0) {
      return ExecutionStatusLevel.PROBLEMATIC;
    } else if (statusCounts[ExecutionStatusLevel.CONCERNING] > 0) {
      return ExecutionStatusLevel.CONCERNING;
    } else if (statusCounts[ExecutionStatusLevel.ACCEPTABLE] > 0) {
      return ExecutionStatusLevel.ACCEPTABLE;
    } else if (statusCounts[ExecutionStatusLevel.GOOD] > 0) {
      return ExecutionStatusLevel.GOOD;
    } else {
      return ExecutionStatusLevel.OPTIMAL;
    }
  }

  /**
   * Get the metrics for a specific task
   */
  getTaskMetrics(taskId: string): TaskExecutionMetrics | undefined {
    return this.taskMetrics.get(taskId);
  }

  /**
   * Update metrics for a specific task
   */
  updateTaskMetrics(
    taskId: string,
    metrics: Partial<TaskExecutionMetrics>,
  ): boolean {
    const existingMetrics = this.taskMetrics.get(taskId);

    // Create or update task metrics
    if (existingMetrics) {
      // Merge existing metrics with updates
      const updatedMetrics: TaskExecutionMetrics = {
        ...existingMetrics,
        ...metrics,
      };

      // Merge resource utilization if provided
      if (metrics.resourceUtilization) {
        updatedMetrics.resourceUtilization = {
          ...existingMetrics.resourceUtilization,
          ...metrics.resourceUtilization,
        };
      }

      // Add to events if provided
      if (metrics.events && metrics.events.length > 0) {
        updatedMetrics.events = [...existingMetrics.events, ...metrics.events];
      }

      // Add to status history if status changed
      if (metrics.status && metrics.status !== existingMetrics.status) {
        updatedMetrics.statusHistory = [
          ...existingMetrics.statusHistory,
          {
            timestamp: new Date(),
            status: metrics.status,
            reason: metrics.events?.[0]?.description, // Use first event as reason if available
          },
        ];
      }

      // Store updated metrics
      this.taskMetrics.set(taskId, updatedMetrics);
    } else {
      // Create new task metrics
      const now = new Date();
      const newMetrics: TaskExecutionMetrics = {
        taskId,
        status: 'pending',
        progress: 0,
        resourceUtilization: {},
        metrics: {},
        events: [],
        statusHistory: [
          {
            timestamp: now,
            status: metrics.status || 'pending',
          },
        ],
        ...metrics,
      };

      // Initialize events if not provided
      if (!metrics.events || metrics.events.length === 0) {
        newMetrics.events = [
          {
            timestamp: now,
            type: 'initialization',
            description: 'Task metrics initialized',
          },
        ];
      }

      // Store new metrics
      this.taskMetrics.set(taskId, newMetrics);
    }

    this.logger.debug(`Updated metrics for task ${taskId}`, {
      taskId,
      metrics: Object.keys(metrics),
    });

    return true;
  }

  /**
   * Generate a system performance report
   */
  getSystemPerformanceReport(): Record<string, any> {
    const now = new Date();
    const metrics = Array.from(this.metrics.values());
    const tasks = Array.from(this.taskMetrics.values());

    // Calculate overall status
    const overallStatus = this.getExecutionStatus();

    // Calculate metrics by status
    const metricsByStatus: Record<string, string[]> = {};

    for (const metric of metrics) {
      const status = this.getMetricStatus(metric);
      if (!metricsByStatus[status]) {
        metricsByStatus[status] = [];
      }
      metricsByStatus[status].push(metric.id);
    }

    // Calculate tasks by status
    const tasksByStatus: Record<string, string[]> = {};

    for (const task of tasks) {
      if (!tasksByStatus[task.status]) {
        tasksByStatus[task.status] = [];
      }
      tasksByStatus[task.status].push(task.taskId);
    }

    // Identify resources with highest utilization
    const resourceUtilization: Record<string, number> = {};

    for (const task of tasks) {
      for (const [resourceId, utilization] of Object.entries(
        task.resourceUtilization,
      )) {
        if (
          !resourceUtilization[resourceId] ||
          utilization > resourceUtilization[resourceId]
        ) {
          resourceUtilization[resourceId] = utilization;
        }
      }
    }

    // Sort resources by utilization (descending)
    const sortedResources = Object.entries(resourceUtilization)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5) // Top 5 most utilized resources
      .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {});

    // Detect anomalies
    const anomalies = this.detectAnomalies();

    return {
      timestamp: now,
      overallStatus,
      metricCount: metrics.length,
      taskCount: tasks.length,
      metricsByStatus,
      tasksByStatus,
      topResourceUtilization: sortedResources,
      anomalyCount: anomalies.length,
      criticalAnomalyCount: anomalies.filter((a) => a.severity === 'critical')
        .length,
    };
  }

  /**
   * Detect anomalies in metrics
   */
  detectAnomalies(): {
    metricId: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    value: number;
    threshold: number;
  }[] {
    const anomalies: {
      metricId: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
      value: number;
      threshold: number;
    }[] = [];

    // Check each metric for anomalies
    for (const [metricId, metric] of this.metrics.entries()) {
      const history = this.historicalData.get(metricId);
      if (!history || history.values.length < 3) {
        continue; // Not enough data for anomaly detection
      }

      // Calculate mean and standard deviation
      const values = history.values;
      const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
      const variance =
        values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
        values.length;
      const stdDev = Math.sqrt(variance);

      // Check if current value is an anomaly
      const currentValue = metric.value;
      const deviation = Math.abs(currentValue - mean);
      const deviationRatio = stdDev > 0 ? deviation / stdDev : 0;

      if (deviationRatio >= this.anomalyDetectionThreshold) {
        // Determine severity based on how extreme the anomaly is
        let severity: 'low' | 'medium' | 'high' | 'critical';

        if (deviationRatio >= 5.0) {
          severity = 'critical';
        } else if (deviationRatio >= 4.0) {
          severity = 'high';
        } else if (deviationRatio >= 3.0) {
          severity = 'medium';
        } else {
          severity = 'low';
        }

        // Check which threshold was crossed
        const threshold = this.getClosestThreshold(metric, currentValue);

        anomalies.push({
          metricId,
          severity,
          description: `Metric "${metric.name}" has anomalous value ${currentValue} ${metric.unit} (${deviationRatio.toFixed(2)} standard deviations from mean)`,
          value: currentValue,
          threshold,
        });
      }
    }

    return anomalies;
  }

  /**
   * Subscribe to changes in a metric
   */
  subscribeToMetricChanges(
    metricId: string,
    callback: (metric: PerformanceMetric) => void,
  ): () => void {
    if (!this.metricChangeListeners.has(metricId)) {
      this.metricChangeListeners.set(metricId, []);
    }

    this.metricChangeListeners.get(metricId)?.push(callback);

    // Return unsubscribe function
    return () => {
      const listeners = this.metricChangeListeners.get(metricId);
      if (listeners) {
        this.metricChangeListeners.set(
          metricId,
          listeners.filter((cb) => cb !== callback),
        );
      }
    };
  }

  /**
   * Get metric status based on thresholds
   */
  private getMetricStatus(metric: PerformanceMetric): ExecutionStatusLevel {
    const { value, thresholds } = metric;

    if (value <= thresholds.critical) {
      return ExecutionStatusLevel.CRITICAL;
    } else if (value <= thresholds.problematic) {
      return ExecutionStatusLevel.PROBLEMATIC;
    } else if (value <= thresholds.concerning) {
      return ExecutionStatusLevel.CONCERNING;
    } else if (value <= thresholds.acceptable) {
      return ExecutionStatusLevel.ACCEPTABLE;
    } else if (value <= thresholds.good) {
      return ExecutionStatusLevel.GOOD;
    } else {
      return ExecutionStatusLevel.OPTIMAL;
    }
  }

  /**
   * Check if a status change is significant
   */
  private isSignificantStatusChange(status: ExecutionStatusLevel): boolean {
    // Consider problematic, critical, and failed as significant status levels
    return (
      status === ExecutionStatusLevel.PROBLEMATIC ||
      status === ExecutionStatusLevel.CRITICAL ||
      status === ExecutionStatusLevel.FAILED
    );
  }

  /**
   * Get the closest threshold that was crossed
   */
  private getClosestThreshold(
    metric: PerformanceMetric,
    value: number,
  ): number {
    const { thresholds } = metric;
    const thresholdValues = [
      thresholds.optimal,
      thresholds.good,
      thresholds.acceptable,
      thresholds.concerning,
      thresholds.problematic,
      thresholds.critical,
    ];

    // Find the closest threshold to the current value
    return thresholdValues.reduce((closest, threshold) => {
      return Math.abs(value - threshold) < Math.abs(value - closest)
        ? threshold
        : closest;
    }, thresholdValues[0]);
  }

  /**
   * Notify metric change listeners
   */
  private notifyMetricListeners(
    metricId: string,
    metric: PerformanceMetric,
  ): void {
    const listeners = this.metricChangeListeners.get(metricId) || [];

    for (const listener of listeners) {
      try {
        listener(metric);
      } catch (error) {
        this.logger.error(`Error in metric change listener for ${metricId}`, {
          error,
        });
      }
    }
  }

  /**
   * Add a task completion event
   */
  recordTaskCompletion(
    taskId: string,
    duration: number,
    success: boolean,
  ): boolean {
    const task = this.taskMetrics.get(taskId);
    if (!task) {
      this.logger.warn(`Cannot record completion for unknown task: ${taskId}`);
      return false;
    }

    const now = new Date();
    const status = success ? 'completed' : 'failed';

    // Create updated task metrics
    const updatedMetrics: TaskExecutionMetrics = {
      ...task,
      status,
      endTime: now,
      duration,
      events: [
        ...task.events,
        {
          timestamp: now,
          type: success ? 'completion' : 'failure',
          description: success
            ? `Task completed successfully in ${duration}ms`
            : `Task failed after ${duration}ms`,
        },
      ],
      statusHistory: [
        ...task.statusHistory,
        {
          timestamp: now,
          status,
          reason: success ? 'Completed successfully' : 'Failed',
        },
      ],
    };

    // Store updated metrics
    this.taskMetrics.set(taskId, updatedMetrics);

    this.logger.info(`Recorded ${status} for task ${taskId}`, {
      taskId,
      duration,
      success,
    });

    return true;
  }

  /**
   * Clear all metrics and history
   */
  clearMetrics(): void {
    this.metrics.clear();
    this.taskMetrics.clear();
    this.historicalData.clear();
    this.logger.info('All metrics cleared');
  }
}
