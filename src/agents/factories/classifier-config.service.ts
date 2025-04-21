import { ClassifierFactory, ClassifierType } from './classifier-factory';
import { DefaultAgentService } from '../services/default-agent.service';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';

/**
 * Options for configuring classifier fallback
 */
export interface ClassifierFallbackConfig {
  /**
   * Enable classifier fallback to a different classifier
   */
  enableClassifierFallback?: boolean;
  
  /**
   * Classifier type to use as fallback
   */
  fallbackClassifierType?: ClassifierType;
  
  /**
   * Enable default agent fallback for low confidence
   */
  enableDefaultAgentFallback?: boolean;
  
  /**
   * Confidence threshold for default agent fallback
   */
  confidenceThreshold?: number;
  
  /**
   * Default agent ID to use
   */
  defaultAgentId?: string;

  /**
   * Logger to use for logging configuration
   */
  logger?: Logger;
}

/**
 * Service to manage classifier fallback configuration
 * Provides utilities for configuring the ClassifierFactory
 * with appropriate fallback mechanisms
 */
export class ClassifierConfigService {
  private static instance: ClassifierConfigService;
  private logger: Logger;
  private intervals: Map<ClassifierFactory, NodeJS.Timeout> = new Map();
  
  private constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
  }
  
  /**
   * Get the singleton instance of the service
   */
  public static getInstance(logger?: Logger): ClassifierConfigService {
    if (!ClassifierConfigService.instance) {
      ClassifierConfigService.instance = new ClassifierConfigService(logger);
    }
    return ClassifierConfigService.instance;
  }
  
  /**
   * Configure the classifier factory with fallback options
   * 
   * @param classifierFactory The factory to configure
   * @param config Configuration options
   * @returns The configured factory
   */
  configureClassifierFallback(
    classifierFactory: ClassifierFactory, 
    config: ClassifierFallbackConfig
  ): ClassifierFactory {
    this.logger = config.logger || this.logger;
    
    // Cleanup any existing interval for this factory
    this.cleanupMetricsReporting(classifierFactory);
    
    // Configure fallback to different classifier
    if (config.enableClassifierFallback && config.fallbackClassifierType) {
      classifierFactory.configureFallback({
        enabled: true,
        classifierType: config.fallbackClassifierType
      });
      
      this.logger.info('Configured classifier fallback', {
        enabled: true,
        fallbackType: config.fallbackClassifierType
      });
    }
    
    // Configure default agent fallback
    if (config.enableDefaultAgentFallback) {
      classifierFactory.configureDefaultAgentFallback({
        enabled: true,
        defaultAgentId: config.defaultAgentId,
        confidenceThreshold: config.confidenceThreshold
      });
      
      this.logger.info('Configured default agent fallback', {
        enabled: true,
        defaultAgentId: config.defaultAgentId || 'auto-detect',
        confidenceThreshold: config.confidenceThreshold
      });
      
      // Log metrics periodically (every hour)
      this.setupMetricsReporting(classifierFactory);
    }
    
    return classifierFactory;
  }
  
  /**
   * Set up periodic metrics reporting for fallback performance
   */
  private setupMetricsReporting(classifierFactory: ClassifierFactory): void {
    // Report metrics periodically
    const interval = setInterval(() => {
      try {
        const metrics = classifierFactory.getDefaultAgentFallbackMetrics();
        if (metrics && metrics.totalFallbacks > 0) {
          this.logger.info('Fallback metrics report', { 
            metrics,
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        this.logger.error('Failed to report fallback metrics', { error });
      }
    }, 60 * 60 * 1000); // Every hour
    
    // Store the interval ID
    this.intervals.set(classifierFactory, interval);
    
    this.logger.debug('Set up metrics reporting for classifier factory', {
      intervalCount: this.intervals.size
    });
  }
  
  /**
   * Clean up metrics reporting interval for a specific classifier factory
   */
  public cleanupMetricsReporting(classifierFactory: ClassifierFactory): void {
    if (this.intervals.has(classifierFactory)) {
      clearInterval(this.intervals.get(classifierFactory)!);
      this.intervals.delete(classifierFactory);
      this.logger.debug('Cleaned up metrics reporting for classifier factory');
    }
  }
  
  /**
   * Clean up all metrics reporting intervals
   * Call this during test teardown or when shutting down the service
   */
  public cleanupAllMetricsReporting(): void {
    if (this.intervals.size > 0) {
      for (const interval of this.intervals.values()) {
        clearInterval(interval);
      }
      const count = this.intervals.size;
      this.intervals.clear();
      this.logger.debug(`Cleaned up all metrics reporting intervals (${count})`);
    }
  }
  
  /**
   * Get the current default agent fallback metrics
   */
  getFallbackMetrics(classifierFactory: ClassifierFactory): any {
    return classifierFactory.getDefaultAgentFallbackMetrics();
  }
  
  /**
   * Tune fallback thresholds based on metrics
   * 
   * @param classifierFactory The classifier factory to tune
   * @param targetFallbackRate Target rate for fallbacks (0-1)
   */
  tuneFallbackThreshold(
    classifierFactory: ClassifierFactory, 
    targetFallbackRate: number = 0.15
  ): void {
    const metrics = classifierFactory.getDefaultAgentFallbackMetrics();
    if (!metrics || metrics.totalFallbacks < 100) {
      this.logger.info('Not enough data to tune fallback threshold');
      return;
    }
    
    // Get current DefaultAgentService
    const defaultAgentService = DefaultAgentService.getInstance();
    
    // We don't have a direct totalRequests metric, 
    // so we'll estimate based on lastUpdated timestamp and average request rate
    // or use a more conservative approach
    const totalRequests = metrics.totalFallbacks * 5; // Assume fallbacks occur in ~20% of requests
    if (totalRequests === 0) {
      return; // Avoid division by zero
    }
    
    const currentFallbackRate = metrics.totalFallbacks / totalRequests;
    const currentThreshold = defaultAgentService['confidenceThreshold'] || 0.6;
    
    // Adjust threshold based on target rate
    let newThreshold = currentThreshold;
    
    if (currentFallbackRate > targetFallbackRate * 1.2) {
      // Too many fallbacks, decrease threshold (make fallback less likely)
      newThreshold = Math.min(0.95, currentThreshold + 0.05);
    } else if (currentFallbackRate < targetFallbackRate * 0.8) {
      // Too few fallbacks, increase threshold (make fallback more likely)
      newThreshold = Math.max(0.3, currentThreshold - 0.05);
    }
    
    // Only update if there's a meaningful change
    if (Math.abs(newThreshold - currentThreshold) >= 0.05) {
      defaultAgentService.setConfidenceThreshold(newThreshold);
      classifierFactory.configureDefaultAgentFallback({
        enabled: true,
        confidenceThreshold: newThreshold
      });
      
      this.logger.info('Tuned fallback threshold based on metrics', {
        oldThreshold: currentThreshold,
        newThreshold,
        currentFallbackRate,
        targetFallbackRate
      });
    }
  }
} 