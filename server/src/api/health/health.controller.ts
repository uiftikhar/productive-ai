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
  },
  
  /**
   * Check service status
   * Checks the status of all required services
   */
  async checkServiceStatus(req: Request, res: Response) {
    try {
      // Get service registry
      const serviceRegistry = ServiceRegistry.getInstance();
      
      // Get agent status report
      const agentStatus = serviceRegistry.getAgentStatusReport();
      
      // Generate overall service report
      const serviceStatus = {
        status: agentStatus.status,
        timestamp: agentStatus.timestamp,
        services: agentStatus.services,
        system: {
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          uptime: process.uptime(),
          platform: process.platform,
          nodeVersion: process.version
        },
        version: packageInfo.version
      };
      
      return res.status(200).json(serviceStatus);
    } catch (error) {
      logger.error('Error checking service status:', {error});
      return res.status(500).json({
        status: 'ERROR',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
        services: []
      });
    }
  }
}; 