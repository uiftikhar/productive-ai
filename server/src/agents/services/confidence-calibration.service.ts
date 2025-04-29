/**
 * Confidence Calibration Service
 *
 * Provides mechanisms to improve confidence scoring accuracy and prevent overconfidence
 * by tracking prediction accuracy and calibrating future predictions.
 */

import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { ConfidenceLevel } from '../interfaces/metacognition.interface';

/**
 * Confidence calibration data structure for tracking predictions
 */
interface ConfidencePrediction {
  id: string;
  timestamp: number;
  domain: string;
  capability: string;
  predictedConfidence: number;
  actualSuccess: boolean | null;
  metadata?: Record<string, any>;
}

/**
 * Calibration metrics for a specific domain or capability
 */
interface CalibrationMetrics {
  totalPredictions: number;
  successfulPredictions: number;
  averagePredictedConfidence: number;
  actualSuccessRate: number;
  calibrationScore: number; // 0-1 where 1 is perfectly calibrated
  overconfidenceRate: number;
  underconfidenceRate: number;
  lastUpdated: number;
}

/**
 * Confidence calibration service
 */
export class ConfidenceCalibrationService {
  private static instance: ConfidenceCalibrationService;
  private logger: Logger;

  // Store confidence predictions and outcomes
  private predictions: Map<string, ConfidencePrediction> = new Map();

  // Cache calculated metrics by domain and capability
  private metricsByDomain: Map<string, CalibrationMetrics> = new Map();
  private metricsByCapability: Map<string, CalibrationMetrics> = new Map();

  // Calibration adjustments based on historical data
  private calibrationFactors: Map<string, number> = new Map();

  /**
   * Private constructor (singleton pattern)
   */
  private constructor(options: { logger?: Logger } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.logger.info('ConfidenceCalibrationService initialized');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(
    options: { logger?: Logger } = {},
  ): ConfidenceCalibrationService {
    if (!ConfidenceCalibrationService.instance) {
      ConfidenceCalibrationService.instance = new ConfidenceCalibrationService(
        options,
      );
    }
    return ConfidenceCalibrationService.instance;
  }

  /**
   * Register a confidence prediction for later calibration
   * @returns The prediction ID for updating with actual outcome
   */
  public registerPrediction(params: {
    domain: string;
    capability: string;
    predictedConfidence: number;
    metadata?: Record<string, any>;
  }): string {
    const id = `pred_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const prediction: ConfidencePrediction = {
      id,
      timestamp: Date.now(),
      domain: params.domain,
      capability: params.capability,
      predictedConfidence: params.predictedConfidence,
      actualSuccess: null, // Will be updated later
      metadata: params.metadata,
    };

    this.predictions.set(id, prediction);

    this.logger.debug(
      `Registered confidence prediction for ${params.capability}`,
      {
        id,
        confidence: params.predictedConfidence,
      },
    );

    return id;
  }

  /**
   * Update a prediction with the actual outcome
   */
  public updatePredictionOutcome(id: string, actualSuccess: boolean): boolean {
    const prediction = this.predictions.get(id);
    if (!prediction) {
      return false;
    }

    // Update the prediction
    prediction.actualSuccess = actualSuccess;
    this.predictions.set(id, prediction);

    // Clear cached metrics that would be affected
    this.metricsByDomain.delete(prediction.domain);
    this.metricsByCapability.delete(prediction.capability);

    // Update calibration factors
    this.updateCalibrationFactor(prediction.capability);
    this.updateCalibrationFactor(prediction.domain);

    this.logger.debug(`Updated prediction ${id} outcome`, {
      predicted: prediction.predictedConfidence,
      actual: actualSuccess,
    });

    return true;
  }

  /**
   * Calibrate a raw confidence score based on historical accuracy
   * This is the main method to be used by agents to improve confidence estimates
   */
  public calibrateConfidence(params: {
    domain: string;
    capability: string;
    rawConfidence: number;
  }): number {
    const { domain, capability, rawConfidence } = params;

    // Get calibration factors
    const domainFactor = this.calibrationFactors.get(domain) || 1.0;
    const capabilityFactor = this.calibrationFactors.get(capability) || 1.0;

    // Combine factors, with capability-specific having more weight
    const combinedFactor = domainFactor * 0.3 + capabilityFactor * 0.7;

    // Apply calibration
    let calibratedConfidence = rawConfidence * combinedFactor;

    // Apply a regression toward the mean for extreme values
    // This helps prevent extreme overconfidence or underconfidence
    if (calibratedConfidence > 0.9) {
      calibratedConfidence = 0.9 + (calibratedConfidence - 0.9) * 0.5;
    } else if (calibratedConfidence < 0.1) {
      calibratedConfidence = 0.1 - (0.1 - calibratedConfidence) * 0.5;
    }

    // Ensure the result is in range 0-1
    calibratedConfidence = Math.max(0, Math.min(1, calibratedConfidence));

    return calibratedConfidence;
  }

  /**
   * Convert a confidence score to a confidence level
   */
  public confidenceScoreToLevel(score: number): ConfidenceLevel {
    if (score >= 0.8) {
      return ConfidenceLevel.VERY_HIGH;
    } else if (score >= 0.6) {
      return ConfidenceLevel.HIGH;
    } else if (score >= 0.4) {
      return ConfidenceLevel.MODERATE;
    } else if (score >= 0.2) {
      return ConfidenceLevel.LOW;
    } else {
      return ConfidenceLevel.VERY_LOW;
    }
  }

  /**
   * Get calibration metrics for a specific domain
   */
  public getMetricsForDomain(domain: string): CalibrationMetrics | null {
    // If metrics are cached, return them
    if (this.metricsByDomain.has(domain)) {
      return this.metricsByDomain.get(domain) || null;
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(
      Array.from(this.predictions.values()).filter(
        (p) => p.domain === domain && p.actualSuccess !== null,
      ),
    );

    if (metrics) {
      this.metricsByDomain.set(domain, metrics);
    }

    return metrics;
  }

  /**
   * Get calibration metrics for a specific capability
   */
  public getMetricsForCapability(
    capability: string,
  ): CalibrationMetrics | null {
    // If metrics are cached, return them
    if (this.metricsByCapability.has(capability)) {
      return this.metricsByCapability.get(capability) || null;
    }

    // Calculate metrics
    const metrics = this.calculateMetrics(
      Array.from(this.predictions.values()).filter(
        (p) => p.capability === capability && p.actualSuccess !== null,
      ),
    );

    if (metrics) {
      this.metricsByCapability.set(capability, metrics);
    }

    return metrics;
  }

  /**
   * Update calibration factor for a domain or capability
   * @deprecated Will be replaced by agentic self-calibration
   */
  private updateCalibrationFactor(key: string): void {
    // Get predictions for this key (could be domain or capability)
    const relevantPredictions = Array.from(this.predictions.values()).filter(
      (p) =>
        (p.domain === key || p.capability === key) && p.actualSuccess !== null,
    );

    if (relevantPredictions.length < 5) {
      // Not enough data to calibrate yet
      return;
    }

    // Calculate the average difference between prediction and reality
    let totalPredicted = 0;
    let totalActual = 0;

    relevantPredictions.forEach((p) => {
      totalPredicted += p.predictedConfidence;
      totalActual += p.actualSuccess ? 1 : 0;
    });

    const avgPredicted = totalPredicted / relevantPredictions.length;
    const avgActual = totalActual / relevantPredictions.length;

    if (avgPredicted === 0) {
      return; // Avoid division by zero
    }

    // The calibration factor adjusts predictions toward reality
    const calibrationFactor = avgActual / avgPredicted;

    // Update the factor with some smoothing to prevent wild oscillations
    const oldFactor = this.calibrationFactors.get(key) || 1.0;
    const newFactor = oldFactor * 0.7 + calibrationFactor * 0.3;

    this.calibrationFactors.set(key, newFactor);

    this.logger.debug(`Updated calibration factor for ${key}`, {
      oldFactor,
      newFactor,
      avgPredicted,
      avgActual,
      sampleSize: relevantPredictions.length,
    });
  }

  /**
   * Calculate calibration metrics from a set of predictions
   */
  private calculateMetrics(
    predictions: ConfidencePrediction[],
  ): CalibrationMetrics | null {
    if (!predictions || predictions.length === 0) {
      return null;
    }

    const totalPredictions = predictions.length;
    const successfulPredictions = predictions.filter(
      (p) => p.actualSuccess,
    ).length;

    // Calculate average predicted confidence
    const totalPredictedConfidence = predictions.reduce(
      (sum, p) => sum + p.predictedConfidence,
      0,
    );
    const averagePredictedConfidence =
      totalPredictedConfidence / totalPredictions;

    // Calculate actual success rate
    const actualSuccessRate = successfulPredictions / totalPredictions;

    // Calculate overconfidence/underconfidence rates
    let overconfidenceCount = 0;
    let underconfidenceCount = 0;

    predictions.forEach((p) => {
      if (p.predictedConfidence > 0.5 && !p.actualSuccess) {
        overconfidenceCount++; // Predicted success but failed
      } else if (p.predictedConfidence < 0.5 && p.actualSuccess) {
        underconfidenceCount++; // Predicted failure but succeeded
      }
    });

    const overconfidenceRate = overconfidenceCount / totalPredictions;
    const underconfidenceRate = underconfidenceCount / totalPredictions;

    // Calculate calibration score (1 - absolute difference between average confidence and success rate)
    const calibrationScore =
      1 - Math.abs(averagePredictedConfidence - actualSuccessRate);

    return {
      totalPredictions,
      successfulPredictions,
      averagePredictedConfidence,
      actualSuccessRate,
      calibrationScore,
      overconfidenceRate,
      underconfidenceRate,
      lastUpdated: Date.now(),
    };
  }

  /**
   * Get overall system calibration metrics
   */
  public getSystemCalibrationMetrics(): {
    totalPredictions: number;
    calibrationScore: number;
    overconfidenceRate: number;
    underconfidenceRate: number;
  } {
    const predictions = Array.from(this.predictions.values()).filter(
      (p) => p.actualSuccess !== null,
    );

    if (predictions.length === 0) {
      return {
        totalPredictions: 0,
        calibrationScore: 1, // Default to perfect calibration with no data
        overconfidenceRate: 0,
        underconfidenceRate: 0,
      };
    }

    const metrics = this.calculateMetrics(predictions);

    return {
      totalPredictions: metrics?.totalPredictions || 0,
      calibrationScore: metrics?.calibrationScore || 1,
      overconfidenceRate: metrics?.overconfidenceRate || 0,
      underconfidenceRate: metrics?.underconfidenceRate || 0,
    };
  }

  /**
   * Clear all prediction data (for testing)
   */
  public clearData(): void {
    this.predictions.clear();
    this.metricsByDomain.clear();
    this.metricsByCapability.clear();
    this.calibrationFactors.clear();
    this.logger.info('Cleared all confidence calibration data');
  }
}
