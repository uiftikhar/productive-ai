import { Request, Response } from 'express';
import { ServiceRegistry } from '../../langgraph/agentic-meeting-analysis/services/service-registry';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import * as os from 'os';

const logger = new ConsoleLogger();
const packageInfo = require('../../../package.json');

/**
 * Controller for health check endpoints
 */
export const healthController = {
  /**
   * Simple health check endpoint
   */
  checkHealth(req: Request, res: Response) {
    return res.status(200).json({ status: 'OK' });
  },

  /**
   * Detailed health check with system information
   */
  checkDetailedHealth(req: Request, res: Response) {
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      env: process.env.NODE_ENV || 'development',
      memory: process.memoryUsage(),
      cpu: process.cpuUsage()
    };

    return res.status(200).json(health);
  }
}; 