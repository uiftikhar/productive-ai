import { ClassifierInterface, ClassifierOptions, ClassifierResult } from '../interfaces/classifier.interface';
import { BaseClassifier } from '../classifiers/base-classifier';
import { OpenAIClassifier, OpenAIClassifierOptions } from '../classifiers/openai-classifier';
import { BedrockClassifier, BedrockClassifierOptions } from '../classifiers/bedrock-classifier';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { ConversationMessage } from '../types/conversation.types';

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
  private classifierInstances: Map<ClassifierType, ClassifierInterface> = new Map();
  
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
      classifierType: 'openai' 
    };
    
    this.logger.debug('Classifier factory initialized', {
      defaultType: this.defaultType,
      maxRetries: this.maxRetries,
      fallbackEnabled: this.fallbackOptions.enabled
    });
  }
  
  /**
   * Create or retrieve a cached classifier of the specified type
   */
  createClassifier(
    type?: ClassifierType,
    options: ClassifierOptions = {}
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
      maxRetries: options.maxRetries || this.maxRetries
    };
    
    this.logger.debug('Creating classifier', { 
      type: classifierType
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
        this.logger.warn(`Unknown classifier type: ${classifierType}, using default`);
        classifier = new OpenAIClassifier(classifierOptions);
    }
    
    // Cache the classifier instance
    this.classifierInstances.set(classifierType, classifier);
    
    return classifier;
  }
  
  /**
   * Create an OpenAI classifier with specific options
   */
  createOpenAIClassifier(options: OpenAIClassifierOptions = {}): OpenAIClassifier {
    const classifier = new OpenAIClassifier({
      ...options,
      logger: options.logger || this.logger,
      maxRetries: options.maxRetries || this.maxRetries
    });
    
    // Cache the classifier
    this.classifierInstances.set('openai', classifier);
    
    return classifier;
  }

  /**
   * Create a Bedrock classifier with specific options
   */
  createBedrockClassifier(options: BedrockClassifierOptions = {}): BedrockClassifier {
    const classifier = new BedrockClassifier({
      ...options,
      logger: options.logger || this.logger,
      maxRetries: options.maxRetries || this.maxRetries
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
   * Classify input with telemetry and optional fallback
   */
  async classify(
    input: string,
    history: ConversationMessage[],
    options: {
      classifierType?: ClassifierType;
      enableFallback?: boolean;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<ClassifierResult> {
    const startTime = Date.now();
    const classifierType = options.classifierType || this.defaultType;
    const enableFallback = options.enableFallback ?? this.fallbackOptions.enabled;
    
    const telemetry: ClassificationTelemetry = {
      classifierType,
      executionTimeMs: 0,
      inputLength: input.length,
      historyLength: history.length,
      selectedAgentId: null,
      confidence: 0,
      isFollowUp: false
    };
    
    try {
      // Get the classifier
      const classifier = this.createClassifier(classifierType);
      
      // Perform classification
      this.logger.debug('Classifying input', {
        classifierType,
        inputLength: input.length,
        historyLength: history.length
      });
      
      const result = await classifier.classify(input, history, options.metadata);
      
      // Calculate execution time
      const executionTime = Date.now() - startTime;
      
      // Record telemetry data
      telemetry.executionTimeMs = executionTime;
      telemetry.selectedAgentId = result.selectedAgentId;
      telemetry.confidence = result.confidence;
      telemetry.isFollowUp = result.isFollowUp || false;
      
      // Send telemetry if handler is provided
      if (this.telemetryHandler) {
        this.telemetryHandler(telemetry);
      }
      
      // Log the result
      this.logger.info('Classification completed', {
        classifierType,
        executionTimeMs: executionTime,
        selectedAgentId: result.selectedAgentId,
        confidence: result.confidence,
        isFollowUp: result.isFollowUp
      });
      
      return result;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Record error in telemetry
      telemetry.error = errorMessage;
      telemetry.executionTimeMs = Date.now() - startTime;
      
      // Log the error
      this.logger.error('Classification failed', {
        classifierType,
        error: errorMessage
      });
      
      // Send telemetry if handler is provided
      if (this.telemetryHandler) {
        this.telemetryHandler(telemetry);
      }
      
      // Try fallback if enabled
      if (enableFallback && this.fallbackOptions.enabled && 
          classifierType !== this.fallbackOptions.classifierType) {
        this.logger.info('Attempting fallback classification', {
          primaryType: classifierType,
          fallbackType: this.fallbackOptions.classifierType
        });
        
        return this.classify(input, history, {
          ...options,
          classifierType: this.fallbackOptions.classifierType,
          enableFallback: false // Prevent cascading fallbacks
        });
      }
      
      // Return default "no match" result
      return {
        selectedAgentId: null,
        confidence: 0,
        reasoning: `Classification error: ${errorMessage}`,
        isFollowUp: false,
        entities: [],
        intent: ''
      };
    }
  }
  
  /**
   * Set a callback function to handle telemetry data
   */
  setTelemetryHandler(handler: (telemetry: ClassificationTelemetry) => void): void {
    this.telemetryHandler = handler;
    this.logger.debug('Telemetry handler set');
  }
  
  /**
   * Configure fallback options
   */
  configureFallback(options: { enabled: boolean; classifierType: ClassifierType }): void {
    this.fallbackOptions = options;
    this.logger.debug('Fallback configuration updated', options);
  }
} 