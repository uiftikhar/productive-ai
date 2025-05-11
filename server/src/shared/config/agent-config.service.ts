import { Logger } from '../logger/logger.interface';
import { ConsoleLogger } from '../logger/console-logger';

/**
 * Agentic system configuration
 */
export interface AgentSystemConfig {
  // Mode settings
  mode: 'production' | 'development' | 'test';
  useMockMode: boolean;
  debugLogging: boolean;
  
  // LLM settings
  openai: {
    apiKey: string;
    modelName: string;
    embeddingModelName: string;
    temperature: number;
    maxTokens: number;
    maxRetries: number;
    timeoutMs: number;
  };
  
  // Vector DB settings
  pinecone: {
    apiKey: string;
    environment: string;
    indexName: string;
    namespace: string;
    dimensions: number;
  };
  
  // Performance and cost controls
  maxConcurrentRequests: number;
  maxTokensPerAnalysis: number;
  maxCostPerAnalysis: number;
  rateLimitPerMinute: number;
}

/**
 * Agent configuration service 
 * Provides centralized access to configuration settings
 */
export class AgentConfigService {
  private static instance: AgentConfigService;
  private config: AgentSystemConfig = {} as AgentSystemConfig;
  private logger: Logger;
  
  private constructor() {
    this.logger = new ConsoleLogger();
    this.initializeConfig();
  }
  
  /**
   * Get the singleton instance
   */
  public static getInstance(): AgentConfigService {
    if (!AgentConfigService.instance) {
      AgentConfigService.instance = new AgentConfigService();
    }
    return AgentConfigService.instance;
  }
  
  /**
   * Initialize configuration from environment variables
   */
  private initializeConfig(): void {
    const env = process.env.NODE_ENV || 'development';
    
    this.config = {
      mode: (env as 'production' | 'development' | 'test'),
      useMockMode: process.env.USE_MOCK_IMPLEMENTATIONS === 'true' || env === 'test',
      debugLogging: process.env.DEBUG_LOGGING === 'true' || env === 'development',
      
      openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
        modelName: process.env.OPENAI_MODEL_NAME || 'gpt-4o',
        embeddingModelName: process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.2'),
        maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '4000'),
        maxRetries: parseInt(process.env.OPENAI_MAX_RETRIES || '3'),
        timeoutMs: parseInt(process.env.OPENAI_TIMEOUT_MS || '60000'),
      },
      
      pinecone: {
        apiKey: process.env.PINECONE_API_KEY || '',
        environment: process.env.PINECONE_ENVIRONMENT || '',
        indexName: process.env.PINECONE_INDEX_NAME || 'meeting-analysis',
        namespace: process.env.PINECONE_NAMESPACE || 'meetings',
        dimensions: parseInt(process.env.PINECONE_DIMENSIONS || '1536'),
      },
      
      maxConcurrentRequests: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '5'),
      maxTokensPerAnalysis: parseInt(process.env.MAX_TOKENS_PER_ANALYSIS || '100000'),
      maxCostPerAnalysis: parseFloat(process.env.MAX_COST_PER_ANALYSIS || '2.0'),
      rateLimitPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '60'),
    };
    
    // Validate critical config params
    this.validateConfig();
    
    // Log config (except sensitive data)
    this.logConfig();
  }
  
  /**
   * Validate the configuration
   */
  private validateConfig(): void {
    // In production, ensure we have the API keys
    if (this.config.mode === 'production' && !this.config.useMockMode) {
      if (!this.config.openai.apiKey) {
        this.logger.warn('OpenAI API key is not set. LLM operations will fail in production mode.');
      }
      
      if (!this.config.pinecone.apiKey || !this.config.pinecone.environment) {
        this.logger.warn('Pinecone API key or environment is not set. Vector operations will fail in production mode.');
      }
    }
  }
  
  /**
   * Log current configuration (omitting sensitive data)
   */
  private logConfig(): void {
    const safeConfig = {
      ...this.config,
      openai: {
        ...this.config.openai,
        apiKey: this.config.openai.apiKey ? '****' : 'not set'
      },
      pinecone: {
        ...this.config.pinecone,
        apiKey: this.config.pinecone.apiKey ? '****' : 'not set'
      }
    };
    
    this.logger.info('Agent system configuration initialized', { config: safeConfig });
  }
  
  /**
   * Get the full configuration
   */
  getConfig(): AgentSystemConfig {
    return { ...this.config };
  }
  
  /**
   * Get OpenAI configuration
   */
  getOpenAIConfig(): AgentSystemConfig['openai'] {
    return { ...this.config.openai };
  }
  
  /**
   * Get Pinecone configuration
   */
  getPineconeConfig(): AgentSystemConfig['pinecone'] {
    return { ...this.config.pinecone };
  }
  
  /**
   * Check if mock mode is enabled
   */
  isMockModeEnabled(): boolean {
    return this.config.useMockMode;
  }
  
  /**
   * Set mock mode
   */
  setMockMode(enabled: boolean): void {
    this.config.useMockMode = enabled;
    this.logger.info(`Mock mode ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Override configuration
   * Useful for testing or dynamic configuration
   */
  updateConfig(partialConfig: Partial<AgentSystemConfig>): void {
    this.config = {
      ...this.config,
      ...partialConfig,
      openai: {
        ...this.config.openai,
        ...partialConfig.openai
      },
      pinecone: {
        ...this.config.pinecone,
        ...partialConfig.pinecone
      }
    };
    
    this.validateConfig();
    this.logConfig();
  }
} 