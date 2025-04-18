/**
 * Tracing utilities for LangGraph workflows
 */

/**
 * Configuration for tracing
 */
export interface TracingConfig {
  enabled: boolean;
  consoleLogging: boolean;
  langSmith?: {
    enabled: boolean;
    projectName?: string;
  };
}

// Default tracing configuration
export const defaultTracingConfig: TracingConfig = {
  enabled: true,
  consoleLogging: true,
  langSmith: {
    enabled: process.env.LANGSMITH_TRACING === 'true',
    projectName: process.env.LANGSMITH_PROJECT || 'productive-ai',
  },
};

// Global tracing configuration
let tracingConfig = { ...defaultTracingConfig };

/**
 * Configure tracing options
 */
export function configureTracing(config: Partial<TracingConfig>): void {
  tracingConfig = {
    ...tracingConfig,
    ...config,
    langSmith: {
      ...tracingConfig.langSmith,
      ...(config.langSmith || {}),
      // Make sure enabled is a boolean
      enabled: config.langSmith?.enabled !== undefined 
        ? Boolean(config.langSmith.enabled) 
        : tracingConfig.langSmith?.enabled || false,
    },
  };
}

/**
 * Log a state transition for debugging
 */
export function logStateTransition(
  nodeName: string,
  prevState: Record<string, any>,
  nextState: Record<string, any>,
  options: { includeFullState?: boolean } = {}
): void {
  if (!tracingConfig.enabled) return;
  
  const { includeFullState = false } = options;

  // Create a simplified diff for logging
  const stateDiff: Record<string, { before: any; after: any }> = {};
  
  // Only include changed fields in the diff
  const allKeys = new Set([
    ...Object.keys(prevState),
    ...Object.keys(nextState),
  ]);

  for (const key of allKeys) {
    // Skip if values are identical
    if (JSON.stringify(prevState[key]) === JSON.stringify(nextState[key])) {
      continue;
    }

    stateDiff[key] = {
      before: prevState[key],
      after: nextState[key],
    };
  }

  const logData = {
    timestamp: new Date().toISOString(),
    node: nodeName,
    stateTransition: stateDiff,
    ...(includeFullState && { fullState: nextState }),
  };

  // Log to console if enabled
  if (tracingConfig.consoleLogging) {
    console.log(`[${nodeName}] State transition:`, JSON.stringify(stateDiff, null, 2));
  }

  // Log to LangSmith if available and enabled
  if (tracingConfig.langSmith?.enabled && process.env.LANGSMITH_API_KEY) {
    try {
      // This would use the LangSmith SDK to log transitions
      // For now we'll just log it to console until we integrate LangSmith
      console.log('[LangSmith] Would log state transition here');
    } catch (error) {
      console.error('Error logging to LangSmith:', error);
    }
  }
}

/**
 * Start a trace for a workflow run
 */
export function startTrace(
  workflowName: string,
  initialState: Record<string, any>,
  metadata: Record<string, any> = {}
): string {
  const traceId = crypto.randomUUID();
  
  if (!tracingConfig.enabled) return traceId;
  
  // Log to console if enabled
  if (tracingConfig.consoleLogging) {
    console.log(`[${workflowName}] Starting workflow trace ${traceId}`);
  }
  
  // Log to LangSmith if available and enabled
  if (tracingConfig.langSmith?.enabled && process.env.LANGSMITH_API_KEY) {
    // This would use the LangSmith SDK to start a trace
    console.log(`[LangSmith] Would start trace for workflow ${workflowName}`);
  }
  
  return traceId;
}

/**
 * End a trace for a workflow run
 */
export function endTrace(
  traceId: string,
  workflowName: string,
  finalState: Record<string, any>,
  metadata: Record<string, any> = {}
): void {
  if (!tracingConfig.enabled) return;
  
  // Log to console if enabled
  if (tracingConfig.consoleLogging) {
    console.log(`[${workflowName}] Ending workflow trace ${traceId}`);
  }
  
  // Log to LangSmith if available and enabled
  if (tracingConfig.langSmith?.enabled && process.env.LANGSMITH_API_KEY) {
    // This would use the LangSmith SDK to end a trace
    console.log(`[LangSmith] Would end trace for workflow ${workflowName}`);
  }
} 