import {
  ClassifierInterface,
  ClassifierOptions,
  ClassifierResult,
} from '../interfaces/classifier.interface';
import { BaseClassifier } from '../classifiers/base-classifier';
import {
  OpenAIClassifier,
  OpenAIClassifierOptions,
} from '../classifiers/openai-classifier';
import {
  BedrockClassifier,
  BedrockClassifierOptions,
} from '../classifiers/bedrock-classifier';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { ConversationMessage } from '../types/conversation.types';
import { DefaultAgentService } from '../services/default-agent.service';

/**
 * Type of classifier to create
 */
export type ClassifierType = 'openai' | 'bedrock' | 'default';

/**
 * Telemetry data captured during classification
 */
export interface ClassificationTelemetry {
  /**
   * Type of classifier used
   */
  classifierType: ClassifierType;

  /**
   * Time taken for classification in milliseconds
   */
  executionTimeMs: number;

  /**
   * Input message length
   */
  inputLength: number;

  /**
   * History message count
   */
  historyLength: number;

  /**
   * Selected agent ID (if any)
   */
  selectedAgentId: string | null;

  /**
   * Confidence score of the classification
   */
  confidence: number;

  /**
   * Whether the message was classified as a follow-up
   */
  isFollowUp: boolean;

  /**
   * Any errors encountered during classification
   */
  error?: string;

  /**
   * Additional metrics specific to the classifier
   */
  additionalMetrics?: Record<string, any>;
}

/**
 * Factory options for creating classifiers
 */
export interface ClassifierFactoryOptions {
  /**
   * Logger instance to use
   */
  logger?: Logger;

  /**
   * Default classifier type when none is specified
   */
  defaultType?: ClassifierType;

  /**
   * Maximum number of retries for classification
   */
  maxRetries?: number;

  /**
   * Log level for the factory and classifiers
   */
  logLevel?: 'debug' | 'info' | 'warn' | 'error' | 'none';

  /**
   * Function to handle telemetry data
   */
  telemetryHandler?: (telemetry: ClassificationTelemetry) => void;

  /**
   * Fallback options for when primary classifier fails
   */
  fallbackOptions?: {
    /**
     * Enable fallback to a different classifier
     */
    enabled: boolean;

    /**
     * Type of classifier to use as fallback
     */
    classifierType: ClassifierType;
  };

  /**
   * DefaultAgentService options for fallback handling
   */
  defaultAgentOptions?: {
    /**
     * Enable default agent fallback
     */
    enabled: boolean;

    /**
     * The ID of the default agent to use for fallback
     */
    defaultAgentId?: string;

    /**
     * Confidence threshold below which the default agent is used
     */
    confidenceThreshold?: number;
  };
}

/**
 * Factory for creating and managing classifier instances
 */
export class ClassifierFactory {
  private logger: Logger;
  private defaultType: ClassifierType;
  private maxRetries: number;
  private telemetryHandler?: (telemetry: ClassificationTelemetry) => void;
  private fallbackOptions: { enabled: boolean; classifierType: ClassifierType };
  private classifierInstances: Map<ClassifierType, ClassifierInterface> =
    new Map();
  private defaultAgentService: DefaultAgentService;
  private useDefaultAgentFallback: boolean = false;

  /**
   * Create a new classifier factory
   */
  constructor(options: ClassifierFactoryOptions = {}) {
    this.logger = options.logger || new ConsoleLogger();

    if (options.logLevel) {
      this.logger.setLogLevel(options.logLevel);
    }

    this.defaultType = options.defaultType || 'openai';
    this.maxRetries = options.maxRetries || 3;
    this.telemetryHandler = options.telemetryHandler;
    this.fallbackOptions = options.fallbackOptions || {
      enabled: false,
      classifierType: 'openai',
    };

    // Initialize the default agent service
    this.defaultAgentService = DefaultAgentService.getInstance({
      logger: this.logger,
    });

    // Configure default agent fallback if provided
    if (options.defaultAgentOptions?.enabled) {
      this.useDefaultAgentFallback = true;

      if (options.defaultAgentOptions.confidenceThreshold) {
        this.defaultAgentService.setConfidenceThreshold(
          options.defaultAgentOptions.confidenceThreshold,
        );
      }

      // Set the default agent if specified
      if (options.defaultAgentOptions.defaultAgentId) {
        try {
          this.defaultAgentService.setDefaultAgent(
            options.defaultAgentOptions.defaultAgentId,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to set default agent ID: ${options.defaultAgentOptions.defaultAgentId}`,
            { error },
          );
          this.useDefaultAgentFallback = false;
        }
      } else {
        this.logger.warn(
          'Default agent fallback enabled but no default agent ID provided',
        );
        this.useDefaultAgentFallback = false;
      }
    }

    this.logger.debug('Classifier factory initialized', {
      defaultType: this.defaultType,
      maxRetries: this.maxRetries,
      fallbackEnabled: this.fallbackOptions.enabled,
      defaultAgentFallbackEnabled: this.useDefaultAgentFallback,
    });
  }

  /**
   * Create or retrieve a cached classifier of the specified type
   */
  createClassifier(
    type?: ClassifierType,
    options: ClassifierOptions = {},
  ): ClassifierInterface {
    const classifierType = type || this.defaultType;

    // Check cache for existing instance
    if (this.classifierInstances.has(classifierType)) {
      return this.classifierInstances.get(classifierType)!;
    }

    // Ensure the logger is passed to the classifier
    const classifierOptions = {
      ...options,
      logger: options.logger || this.logger,
      maxRetries: options.maxRetries || this.maxRetries,
    };

    this.logger.debug('Creating classifier', {
      type: classifierType,
    });

    // Create the appropriate classifier type
    let classifier: ClassifierInterface;

    switch (classifierType) {
      case 'openai':
        classifier = new OpenAIClassifier(classifierOptions);
        break;

      case 'bedrock':
        classifier = new BedrockClassifier(classifierOptions);
        break;

      case 'default':
        classifier = new OpenAIClassifier(classifierOptions);
        break;

      default:
        this.logger.warn(
          `Unknown classifier type: ${classifierType}, using default`,
        );
        classifier = new OpenAIClassifier(classifierOptions);
    }

    // Cache the classifier instance
    this.classifierInstances.set(classifierType, classifier);

    return classifier;
  }

  /**
   * Create an OpenAI classifier with specific options
   */
  createOpenAIClassifier(
    options: OpenAIClassifierOptions = {},
  ): OpenAIClassifier {
    const classifier = new OpenAIClassifier({
      ...options,
      logger: options.logger || this.logger,
      maxRetries: options.maxRetries || this.maxRetries,
    });

    // Cache the classifier
    this.classifierInstances.set('openai', classifier);

    return classifier;
  }

  /**
   * Create a Bedrock classifier with specific options
   */
  createBedrockClassifier(
    options: BedrockClassifierOptions = {},
  ): BedrockClassifier {
    const classifier = new BedrockClassifier({
      ...options,
      logger: options.logger || this.logger,
      maxRetries: options.maxRetries || this.maxRetries,
    });

    // Cache the classifier
    this.classifierInstances.set('bedrock', classifier);

    return classifier;
  }

  /**
   * Reset classifier cache to force creation of new instances
   */
  resetCache(): void {
    this.classifierInstances.clear();
    this.logger.debug('Classifier cache cleared');
  }

  /**
   * Configure the default agent fallback system
   */
  configureDefaultAgentFallback(options: {
    enabled: boolean;
    defaultAgentId?: string;
    confidenceThreshold?: number;
  }): void {
    this.useDefaultAgentFallback = options.enabled;

    if (options.confidenceThreshold !== undefined) {
      this.defaultAgentService.setConfidenceThreshold(
        options.confidenceThreshold,
      );
    }

    if (options.defaultAgentId) {
      try {
        this.defaultAgentService.setDefaultAgent(options.defaultAgentId);
      } catch (error) {
        this.logger.warn(
          `Failed to set default agent ID: ${options.defaultAgentId}`,
          {
            error,
          },
        );
        this.useDefaultAgentFallback = false;
      }
    } else if (options.enabled) {
      // If enabling but no agent ID, check if one is already set
      const currentDefaultAgent = this.defaultAgentService.getDefaultAgent();
      if (!currentDefaultAgent) {
        this.logger.warn(
          'Default agent fallback enabled but no default agent ID provided',
        );
        this.useDefaultAgentFallback = false;
      }
    }

    this.logger.info('Default agent fallback configured', {
      enabled: this.useDefaultAgentFallback,
      threshold: options.confidenceThreshold,
      agentId: options.defaultAgentId,
    });
  }

  /**
   * Get metrics from the default agent fallback system
   */
  getDefaultAgentFallbackMetrics() {
    return this.defaultAgentService.getFallbackMetrics();
  }

  /**
   * Classify user input with the specified classifier, applying fallback logic as needed
   */
  async classify(
    input: string,
    history: ConversationMessage[],
    options: {
      classifierType?: ClassifierType;
      enableFallback?: boolean;
      enableDefaultAgentFallback?: boolean;
      metadata?: Record<string, any>;
    } = {},
  ): Promise<ClassifierResult> {
    const startTime = Date.now();
    let result: ClassifierResult | null = null;
    let error: Error | null = null;
    let classifierType = options.classifierType || this.defaultType;
    let telemetry: ClassificationTelemetry | null = null;

    try {
      // Get the primary classifier
      const classifier = this.createClassifier(classifierType);

      // Attempt classification with the primary classifier
      result = await classifier.classify(input, history, options.metadata);

      // Generate telemetry data for the primary classification
      telemetry = {
        classifierType,
        executionTimeMs: Date.now() - startTime,
        inputLength: input.length,
        historyLength: history.length,
        selectedAgentId: result.selectedAgentId,
        confidence: result.confidence,
        isFollowUp: result.isFollowUp,
      };

      // Apply default agent fallback logic if enabled
      const useDefaultFallback =
        options.enableDefaultAgentFallback !== undefined
          ? options.enableDefaultAgentFallback
          : this.useDefaultAgentFallback;

      if (useDefaultFallback) {
        const originalAgentId = result.selectedAgentId;
        result = this.defaultAgentService.processFallbackLogic(result, input);

        // Update telemetry if fallback was triggered
        if (result.selectedAgentId !== originalAgentId) {
          telemetry.additionalMetrics = {
            ...(telemetry.additionalMetrics || {}),
            fallbackTriggered: true,
            originalAgentId,
            fallbackAgentId: result.selectedAgentId,
            fallbackReason: result.reasoning,
          };
        }
      }

      // Apply classifier type fallback logic if enabled and needed
      const useFallbackClassifier =
        (options.enableFallback || this.fallbackOptions.enabled) &&
        !result.selectedAgentId &&
        this.fallbackOptions.classifierType !== classifierType;

      if (useFallbackClassifier) {
        this.logger.info(
          'Primary classifier returned no agent, trying fallback',
          {
            primaryType: classifierType,
            fallbackType: this.fallbackOptions.classifierType,
          },
        );

        // Get the fallback classifier
        const fallbackClassifier = this.createClassifier(
          this.fallbackOptions.classifierType,
        );

        // Try with the fallback classifier
        const fallbackResult = await fallbackClassifier.classify(
          input,
          history,
          options.metadata,
        );

        if (fallbackResult.selectedAgentId) {
          result = fallbackResult;
          telemetry = {
            ...telemetry,
            classifierType: this.fallbackOptions.classifierType,
            selectedAgentId: result.selectedAgentId,
            confidence: result.confidence,
            isFollowUp: result.isFollowUp,
            additionalMetrics: {
              ...(telemetry.additionalMetrics || {}),
              usedFallbackClassifier: true,
              primaryClassifierType: classifierType,
            },
          };
        }
      }
    } catch (err) {
      error = err instanceof Error ? err : new Error(String(err));
      this.logger.error('Error during classification', { error });

      // Create error telemetry
      telemetry = {
        classifierType,
        executionTimeMs: Date.now() - startTime,
        inputLength: input.length,
        historyLength: history.length,
        selectedAgentId: null,
        confidence: 0,
        isFollowUp: false,
        error: error.message,
      };

      // Fallback result for error case
      result = {
        selectedAgentId: null,
        confidence: 0,
        reasoning: `Classification error: ${error.message}`,
        isFollowUp: false,
        entities: [],
        intent: '',
      };

      // Try to use classifier fallback when primary classifier fails with error
      const useFallbackClassifier =
        (options.enableFallback || this.fallbackOptions.enabled) &&
        this.fallbackOptions.classifierType !== classifierType;

      if (useFallbackClassifier) {
        this.logger.info(
          'Primary classifier failed with error, trying fallback',
          {
            primaryType: classifierType,
            fallbackType: this.fallbackOptions.classifierType,
            error: error.message,
          },
        );

        try {
          // Get the fallback classifier
          const fallbackClassifier = this.createClassifier(
            this.fallbackOptions.classifierType,
          );

          // Try with the fallback classifier
          const fallbackResult = await fallbackClassifier.classify(
            input,
            history,
            options.metadata,
          );

          if (fallbackResult.selectedAgentId) {
            result = fallbackResult;
            telemetry = {
              ...telemetry,
              classifierType: this.fallbackOptions.classifierType,
              selectedAgentId: result.selectedAgentId,
              confidence: result.confidence,
              isFollowUp: result.isFollowUp,
              additionalMetrics: {
                ...(telemetry.additionalMetrics || {}),
                usedFallbackClassifier: true,
                primaryClassifierType: classifierType,
                primaryClassifierError: error.message,
              },
            };
            // Skip default agent fallback since we have a valid result
            return result;
          }
        } catch (fallbackError) {
          this.logger.error('Fallback classifier also failed', {
            fallbackError,
          });
          // Continue with default agent fallback as last resort
        }
      }

      // Try to use default agent fallback even in error case if enabled
      const useDefaultFallback =
        options.enableDefaultAgentFallback !== undefined
          ? options.enableDefaultAgentFallback
          : this.useDefaultAgentFallback;

      if (useDefaultFallback) {
        result = this.defaultAgentService.processFallbackLogic(result, input);

        if (result.selectedAgentId) {
          telemetry.additionalMetrics = {
            ...(telemetry.additionalMetrics || {}),
            fallbackTriggered: true,
            fallbackAgentId: result.selectedAgentId,
            fallbackReason: 'Error in classification: ' + error.message,
          };
        }
      }
    }

    // Send telemetry data if a handler is configured
    if (telemetry && this.telemetryHandler) {
      try {
        this.telemetryHandler(telemetry);
      } catch (telemetryError) {
        this.logger.warn('Error in telemetry handler', { telemetryError });
      }
    }

    return result!;
  }

  /**
   * Set a callback function to handle telemetry data
   */
  setTelemetryHandler(
    handler: (telemetry: ClassificationTelemetry) => void,
  ): void {
    this.telemetryHandler = handler;
    this.logger.debug('Telemetry handler set');
  }

  /**
   * Configure fallback options
   */
  configureFallback(options: {
    enabled: boolean;
    classifierType: ClassifierType;
  }): void {
    this.fallbackOptions = options;
    this.logger.debug('Fallback configuration updated', options);
  }
}
