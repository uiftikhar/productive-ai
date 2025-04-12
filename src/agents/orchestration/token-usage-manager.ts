/**
 * Token Usage Manager
 * 
 * Centralizes token usage tracking across the system, providing:
 * - Token usage tracking by model, user, conversation, and session
 * - Token estimation for different model providers
 * - Usage reporting and analytics
 * - Budget enforcement
 */

import { Logger } from '../../shared/logger/logger.interface.ts';
import { ConsoleLogger } from '../../shared/logger/console-logger.ts';

/**
 * Token usage record structure
 */
export interface TokenUsageRecord {
  timestamp: number;
  userId?: string;
  conversationId?: string;
  sessionId?: string;
  modelName: string;
  modelProvider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

/**
 * Budget configuration
 */
export interface TokenBudget {
  userId?: string;
  modelName?: string;
  provider?: string;
  maxTokens?: number;
  maxCost?: number;
  timeframe?: 'daily' | 'weekly' | 'monthly' | 'total';
}

/**
 * Token usage summary
 */
export interface TokenUsageSummary {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalCost: number;
  recordCount: number;
  byModel: Record<string, {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    totalCost: number;
  }>;
}

/**
 * Centralized token usage tracking
 */
export class TokenUsageManager {
  private logger: Logger;
  private usageRecords: TokenUsageRecord[] = [];
  private budgets: TokenBudget[] = [];
  
  // Token cost per 1000 tokens by provider and model
  private tokenCosts: Record<string, Record<string, { prompt: number; completion: number }>> = {
    openai: {
      'gpt-4-turbo': { prompt: 0.01, completion: 0.03 },
      'gpt-4': { prompt: 0.03, completion: 0.06 },
      'gpt-3.5-turbo': { prompt: 0.0015, completion: 0.002 },
      'default': { prompt: 0.01, completion: 0.03 }
    },
    anthropic: {
      'claude-3-opus': { prompt: 0.015, completion: 0.075 },
      'claude-3-sonnet': { prompt: 0.003, completion: 0.015 },
      'claude-3-haiku': { prompt: 0.00025, completion: 0.00125 },
      'default': { prompt: 0.003, completion: 0.015 }
    },
    azure: {
      'default': { prompt: 0.01, completion: 0.03 }
    },
    default: {
      'default': { prompt: 0.01, completion: 0.03 }
    }
  };

  private static instance: TokenUsageManager;

  /**
   * Get singleton instance
   */
  public static getInstance(logger?: Logger): TokenUsageManager {
    if (!TokenUsageManager.instance) {
      TokenUsageManager.instance = new TokenUsageManager(logger);
    }
    return TokenUsageManager.instance;
  }

  /**
   * Private constructor for singleton pattern
   */
  private constructor(logger?: Logger) {
    this.logger = logger || new ConsoleLogger();
  }

  /**
   * Record token usage for a single API call
   */
  public recordUsage(usage: Omit<TokenUsageRecord, 'timestamp' | 'cost'>): TokenUsageRecord {
    // Calculate cost
    const cost = this.calculateCost(
      usage.modelProvider,
      usage.modelName,
      usage.promptTokens,
      usage.completionTokens
    );

    const record: TokenUsageRecord = {
      ...usage,
      timestamp: Date.now(),
      cost
    };

    this.usageRecords.push(record);
    
    // Log the usage
    this.logger.info('Token usage recorded', {
      model: usage.modelName,
      tokens: usage.totalTokens,
      cost: cost.toFixed(4)
    });

    // Check if usage exceeds any budgets
    this.checkBudgets(record);

    return record;
  }

  /**
   * Calculate the cost for a given usage
   */
  private calculateCost(
    provider: string,
    modelName: string,
    promptTokens: number,
    completionTokens: number
  ): number {
    // Get provider costs or default
    const providerCosts = this.tokenCosts[provider] || this.tokenCosts.default;
    
    // Get model costs or default for that provider
    const modelCosts = providerCosts[modelName] || providerCosts.default;
    
    // Calculate cost (converting to cost per token from cost per 1000 tokens)
    const promptCost = (promptTokens / 1000) * modelCosts.prompt;
    const completionCost = (completionTokens / 1000) * modelCosts.completion;
    
    return promptCost + completionCost;
  }

  /**
   * Check if usage exceeds any budgets
   */
  private checkBudgets(usage: TokenUsageRecord): void {
    const now = Date.now();

    for (const budget of this.budgets) {
      // Skip if budget doesn't apply to this usage
      if (budget.userId && budget.userId !== usage.userId) continue;
      if (budget.modelName && budget.modelName !== usage.modelName) continue;
      if (budget.provider && budget.provider !== usage.modelProvider) continue;

      // Filter records for this budget
      const relevantRecords = this.usageRecords.filter(record => {
        // Check user, model, provider filters
        const userMatch = !budget.userId || record.userId === budget.userId;
        const modelMatch = !budget.modelName || record.modelName === budget.modelName;
        const providerMatch = !budget.provider || record.modelProvider === budget.provider;
        
        // Check timeframe
        let timeMatch = true;
        if (budget.timeframe) {
          const msInDay = 24 * 60 * 60 * 1000;
          
          switch (budget.timeframe) {
            case 'daily':
              timeMatch = (now - record.timestamp) <= msInDay;
              break;
            case 'weekly':
              timeMatch = (now - record.timestamp) <= 7 * msInDay;
              break;
            case 'monthly':
              timeMatch = (now - record.timestamp) <= 30 * msInDay;
              break;
            case 'total':
              timeMatch = true;
              break;
          }
        }
        
        return userMatch && modelMatch && providerMatch && timeMatch;
      });

      // Calculate totals
      const totalTokens = relevantRecords.reduce((sum, record) => sum + record.totalTokens, 0);
      const totalCost = relevantRecords.reduce((sum, record) => sum + record.cost, 0);

      // Check if budget is exceeded
      if (budget.maxTokens && totalTokens > budget.maxTokens) {
        this.logger.warn('Token budget exceeded', {
          budget: budget.maxTokens,
          used: totalTokens,
          modelName: budget.modelName || 'all',
          userId: budget.userId || 'all',
          timeframe: budget.timeframe || 'total'
        });
      }

      if (budget.maxCost && totalCost > budget.maxCost) {
        this.logger.warn('Cost budget exceeded', {
          budget: budget.maxCost,
          used: totalCost.toFixed(4),
          modelName: budget.modelName || 'all',
          userId: budget.userId || 'all',
          timeframe: budget.timeframe || 'total'
        });
      }
    }
  }

  /**
   * Set a budget for token usage
   */
  public setBudget(budget: TokenBudget): void {
    this.budgets.push(budget);
    this.logger.info('Token budget set', {
      maxTokens: budget.maxTokens,
      maxCost: budget.maxCost,
      modelName: budget.modelName || 'all',
      userId: budget.userId || 'all',
      timeframe: budget.timeframe || 'total'
    });
  }

  /**
   * Estimate token count for input text
   * This is a simple approximation - use a proper tokenizer in production
   */
  public estimateTokenCount(text: string): number {
    // Rough approximation: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }

  /**
   * Get token usage summary for a specific filter
   */
  public getUsageSummary(filter?: {
    userId?: string;
    modelName?: string;
    provider?: string;
    startTime?: number;
    endTime?: number;
    conversationId?: string;
  }): TokenUsageSummary {
    // Filter records based on criteria
    const filteredRecords = this.usageRecords.filter(record => {
      if (filter?.userId && record.userId !== filter.userId) return false;
      if (filter?.modelName && record.modelName !== filter.modelName) return false;
      if (filter?.provider && record.modelProvider !== filter.provider) return false;
      if (filter?.conversationId && record.conversationId !== filter.conversationId) return false;
      if (filter?.startTime && record.timestamp < filter.startTime) return false;
      if (filter?.endTime && record.timestamp > filter.endTime) return false;
      return true;
    });

    // Initialize summary
    const summary: TokenUsageSummary = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      totalCost: 0,
      recordCount: filteredRecords.length,
      byModel: {}
    };

    // Calculate totals
    for (const record of filteredRecords) {
      summary.promptTokens += record.promptTokens;
      summary.completionTokens += record.completionTokens;
      summary.totalTokens += record.totalTokens;
      summary.totalCost += record.cost;

      // Group by model
      if (!summary.byModel[record.modelName]) {
        summary.byModel[record.modelName] = {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          totalCost: 0
        };
      }

      const modelSummary = summary.byModel[record.modelName];
      modelSummary.promptTokens += record.promptTokens;
      modelSummary.completionTokens += record.completionTokens;
      modelSummary.totalTokens += record.totalTokens;
      modelSummary.totalCost += record.cost;
    }

    return summary;
  }

  /**
   * Clear usage records (for testing or maintenance)
   */
  public clearRecords(): void {
    this.usageRecords = [];
  }

  /**
   * Set token costs for different models
   */
  public setTokenCosts(
    provider: string,
    modelName: string,
    costs: { prompt: number; completion: number }
  ): void {
    if (!this.tokenCosts[provider]) {
      this.tokenCosts[provider] = { default: this.tokenCosts.default.default };
    }
    
    this.tokenCosts[provider][modelName] = costs;
  }
} 