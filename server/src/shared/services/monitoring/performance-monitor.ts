/**
 * Performance Monitoring Service
 *
 * Provides monitoring and metrics collection for API and WebSocket operations
 */

import { Request, Response, NextFunction } from 'express';
import { Socket } from 'socket.io';
import { Logger } from '../../logger/logger.interface';
import { ConsoleLogger } from '../../logger/console-logger';

// Define metrics types
export interface PerformanceMetrics {
  // API metrics
  requestCount: number;
  errorCount: number;
  responseTimes: number[];
  averageResponseTime: number;
  maxResponseTime: number;
  requestsPerMinute: number;

  // Endpoint specific metrics
  endpointMetrics: Record<
    string,
    {
      count: number;
      errors: number;
      averageResponseTime: number;
    }
  >;

  // WebSocket metrics
  socketConnections: number;
  activeConnections: number;
  messagesSent: number;
  messagesReceived: number;
  messagesSentPerMinute: number;
  messagesReceivedPerMinute: number;

  // Status code distribution
  statusCodeDistribution: Record<string, number>;

  // Time-based metrics
  hourlyRequestCounts: Record<string, number>;

  // Resource metrics
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  cpuUsage?: number;
}

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: PerformanceMetrics;
  private startTime: number;
  private lastMinuteRequests: number[];
  private lastMinuteWsMessagesSent: number[];
  private lastMinuteWsMessagesReceived: number[];
  private logger: Logger;
  private metricsInterval: NodeJS.Timeout;

  private constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
    this.startTime = Date.now();
    this.lastMinuteRequests = [];
    this.lastMinuteWsMessagesSent = [];
    this.lastMinuteWsMessagesReceived = [];

    // Initialize metrics
    this.metrics = {
      requestCount: 0,
      errorCount: 0,
      responseTimes: [],
      averageResponseTime: 0,
      maxResponseTime: 0,
      requestsPerMinute: 0,
      endpointMetrics: {},
      socketConnections: 0,
      activeConnections: 0,
      messagesSent: 0,
      messagesReceived: 0,
      messagesSentPerMinute: 0,
      messagesReceivedPerMinute: 0,
      statusCodeDistribution: {},
      hourlyRequestCounts: {},
      memoryUsage: {
        rss: 0,
        heapTotal: 0,
        heapUsed: 0,
        external: 0,
      },
    };

    // Start capturing system metrics periodically
    this.metricsInterval = setInterval(
      () => this.captureSystemMetrics(),
      30000,
    ).unref();

    // Log initial startup
    this.logger.info('Performance monitoring initialized', {
      startTime: new Date(this.startTime).toISOString(),
    });
  }

  public static getInstance(logger?: Logger): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor(logger);
    }
    return PerformanceMonitor.instance;
  }

  /**
   * Middleware for Express to track API performance
   */
  public apiMonitoringMiddleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();

      // Track request
      this.trackRequest();

      // Track endpoint-specific information
      const endpoint = `${req.method} ${req.path}`;
      this.initializeEndpointMetricsIfNeeded(endpoint);
      this.metrics.endpointMetrics[endpoint].count++;

      // Track response
      const originalEnd = res.end;
      res.end = function (
        this: Response,
        chunk?: any,
        encoding?: BufferEncoding,
        callback?: () => void,
      ) {
        const responseTime = Date.now() - startTime;

        // Update response time metrics
        PerformanceMonitor.instance.trackResponseTime(responseTime);

        // Update endpoint metrics
        PerformanceMonitor.instance.metrics.endpointMetrics[
          endpoint
        ].averageResponseTime =
          (PerformanceMonitor.instance.metrics.endpointMetrics[endpoint]
            .averageResponseTime *
            (PerformanceMonitor.instance.metrics.endpointMetrics[endpoint]
              .count -
              1) +
            responseTime) /
          PerformanceMonitor.instance.metrics.endpointMetrics[endpoint].count;

        // Track status code
        const statusCode = res.statusCode.toString();
        if (
          !PerformanceMonitor.instance.metrics.statusCodeDistribution[
            statusCode
          ]
        ) {
          PerformanceMonitor.instance.metrics.statusCodeDistribution[
            statusCode
          ] = 0;
        }
        PerformanceMonitor.instance.metrics.statusCodeDistribution[
          statusCode
        ]++;

        // Track errors
        if (res.statusCode >= 400) {
          PerformanceMonitor.instance.trackError();
          PerformanceMonitor.instance.metrics.endpointMetrics[endpoint]
            .errors++;
        }

        // Add response time header for debugging
        res.setHeader('X-Response-Time', `${responseTime}ms`);
        // Call original end
        return originalEnd.apply(this, [
          chunk,
          encoding as BufferEncoding,
          callback,
        ]);
      } as any;

      next();
    };
  }

  /**
   * Middleware to monitor WebSocket connections
   */
  public socketMonitoringMiddleware() {
    return (socket: Socket, next: (err?: Error) => void) => {
      this.trackSocketConnect();

      // Track messages
      socket.onAny((eventName, ...args) => {
        this.trackSocketMessageReceived();
      });

      // Track outgoing messages
      const originalEmit = socket.emit;
      socket.emit = function (
        this: Socket,
        ev: string,
        ...args: any[]
      ): boolean {
        PerformanceMonitor.instance.trackSocketMessageSent();
        return originalEmit.apply(this, [ev, ...args]);
      } as any;

      // Track disconnection
      socket.on('disconnect', () => {
        this.trackSocketDisconnect();
      });

      next();
    };
  }

  /**
   * Track a new request
   */
  public trackRequest() {
    this.metrics.requestCount++;

    // Update per-minute tracking
    const now = Date.now();
    this.lastMinuteRequests.push(now);

    // Remove requests older than 1 minute
    this.lastMinuteRequests = this.lastMinuteRequests.filter(
      (time) => now - time < 60000,
    );
    this.metrics.requestsPerMinute = this.lastMinuteRequests.length;

    // Update hourly counts
    const hourKey = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH format
    if (!this.metrics.hourlyRequestCounts[hourKey]) {
      this.metrics.hourlyRequestCounts[hourKey] = 0;
    }
    this.metrics.hourlyRequestCounts[hourKey]++;
  }

  /**
   * Track response time
   */
  public trackResponseTime(ms: number) {
    this.metrics.responseTimes.push(ms);

    // Keep only the last 100 response times to avoid memory growth
    if (this.metrics.responseTimes.length > 100) {
      this.metrics.responseTimes.shift();
    }

    // Update average
    this.metrics.averageResponseTime =
      this.metrics.responseTimes.reduce((sum, time) => sum + time, 0) /
      this.metrics.responseTimes.length;

    // Update max
    this.metrics.maxResponseTime = Math.max(this.metrics.maxResponseTime, ms);
  }

  /**
   * Track an error
   */
  public trackError() {
    this.metrics.errorCount++;
  }

  /**
   * Track socket connection
   */
  public trackSocketConnect() {
    this.metrics.socketConnections++;
    this.metrics.activeConnections++;
  }

  /**
   * Track socket disconnection
   */
  public trackSocketDisconnect() {
    this.metrics.activeConnections = Math.max(
      0,
      this.metrics.activeConnections - 1,
    );
  }

  /**
   * Track socket message sent
   */
  public trackSocketMessageSent() {
    this.metrics.messagesSent++;

    // Update per-minute tracking
    const now = Date.now();
    this.lastMinuteWsMessagesSent.push(now);

    // Remove messages older than 1 minute
    this.lastMinuteWsMessagesSent = this.lastMinuteWsMessagesSent.filter(
      (time) => now - time < 60000,
    );
    this.metrics.messagesSentPerMinute = this.lastMinuteWsMessagesSent.length;
  }

  /**
   * Track socket message received
   */
  public trackSocketMessageReceived() {
    this.metrics.messagesReceived++;

    // Update per-minute tracking
    const now = Date.now();
    this.lastMinuteWsMessagesReceived.push(now);

    // Remove messages older than 1 minute
    this.lastMinuteWsMessagesReceived =
      this.lastMinuteWsMessagesReceived.filter((time) => now - time < 60000);
    this.metrics.messagesReceivedPerMinute =
      this.lastMinuteWsMessagesReceived.length;
  }

  /**
   * Get current metrics
   */
  public getMetrics(): PerformanceMetrics {
    // Get the latest memory usage
    this.captureSystemMetrics();

    return { ...this.metrics };
  }

  /**
   * Capture system-level metrics
   */
  private captureSystemMetrics() {
    // Memory usage
    const memoryUsage = process.memoryUsage();
    this.metrics.memoryUsage = {
      rss: memoryUsage.rss / (1024 * 1024), // MB
      heapTotal: memoryUsage.heapTotal / (1024 * 1024), // MB
      heapUsed: memoryUsage.heapUsed / (1024 * 1024), // MB
      external: memoryUsage.external / (1024 * 1024), // MB
    };

    // CPU usage (if possible)
    // This is a simple approach, for production consider using a more robust solution
    try {
      const startUsage = process.cpuUsage();

      // Wait a short amount of time
      const now = Date.now();
      while (Date.now() - now < 100) {
        // Busy wait to measure CPU
      }

      const endUsage = process.cpuUsage(startUsage);
      const totalCPUTime = endUsage.user + endUsage.system;
      this.metrics.cpuUsage = totalCPUTime / 1000000; // Convert to seconds
    } catch (error) {
      this.logger.warn('Failed to get CPU usage', { error });
    }
  }

  /**
   * Initialize endpoint metrics object if needed
   */
  private initializeEndpointMetricsIfNeeded(endpoint: string) {
    if (!this.metrics.endpointMetrics[endpoint]) {
      this.metrics.endpointMetrics[endpoint] = {
        count: 0,
        errors: 0,
        averageResponseTime: 0,
      };
    }
  }

  /**
   * Clean up resources
   */
  public dispose() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }
  }
}
