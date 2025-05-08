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
   * Basic health check endpoint
   * Returns 200 if the API is running
   */
  async checkHealth(req: Request, res: Response) {
    return res.status(200).json({
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime(),
      version: packageInfo.version || 'unknown'
    });
  },
  
  /**
   * Detailed health check endpoint
   * Returns detailed status of all systems
   */
  async checkDetailedHealth(req: Request, res: Response) {
    try {
      const serviceRegistry = ServiceRegistry.getInstance();
      
      // Check services initialization
      const servicesInitialized = serviceRegistry.isInitialized();
      
      // Get storage health
      let storageHealth: any = { status: 'unknown' };
      try {
        const supervisorService = serviceRegistry.getSupervisorCoordinationService();
        const persistentState = supervisorService['persistentState'];
        
        // Check if storage is initialized
        const storageInitialized = persistentState && typeof persistentState['storageAdapter'] !== 'undefined';
        storageHealth = {
          status: storageInitialized ? 'ok' : 'error',
          adapter: persistentState ? persistentState['storageAdapter'].constructor.name : 'unknown',
          initialized: storageInitialized
        };
      } catch (storageError) {
        storageHealth = { 
          status: 'error',
          error: (storageError as Error).message
        };
      }
      
      // Get system metrics
      const systemMetrics = {
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          usage: Math.round((1 - os.freemem() / os.totalmem()) * 100)
        },
        cpu: {
          cores: os.cpus().length,
          load: os.loadavg()
        },
        uptime: {
          system: os.uptime(),
          process: process.uptime()
        }
      };
      
      // Prepare response
      const healthStatus = {
        status: servicesInitialized && storageHealth.status === 'ok' ? 'ok' : 'degraded',
        timestamp: Date.now(),
        version: packageInfo.version || 'unknown',
        components: {
          api: { status: 'ok' },
          services: { 
            status: servicesInitialized ? 'ok' : 'initializing',
            initialized: servicesInitialized
          },
          storage: storageHealth
        },
        metrics: systemMetrics
      };
      
      return res.status(200).json(healthStatus);
    } catch (error: any) {
      logger.error('Error in detailed health check', { error });
      
      return res.status(500).json({
        status: 'error',
        timestamp: Date.now(),
        error: error.message,
        version: packageInfo.version || 'unknown'
      });
    }
  }
}; 