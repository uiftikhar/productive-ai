# Default Agent Fallback System

The Default Agent Fallback System provides a reliable mechanism to handle classification uncertainties and ensures that user requests always receive appropriate responses, even when primary agent selection fails.

## Features

- **Confidence-based Fallback**: Automatically routes to a default agent when classification confidence falls below a configurable threshold
- **Multiple Fallback Conditions**: Supports fallback for low confidence, missing agent selection, and classification errors
- **Comprehensive Metrics**: Tracks fallback occurrences, reasons, and patterns to enable continuous improvement
- **Automatic Agent Selection**: Can automatically identify the most suitable default agent based on capabilities
- **Configurable Thresholds**: Easily adjust confidence thresholds to balance specialization vs. fallback frequency

## Quick Start

```typescript
import { initializeDefaultAgentSystem } from './agents/services/initialize-default-agent';
import { DefaultAgentService } from './agents/services/default-agent.service';
import { ClassifierFactory } from './agents/factories/classifier-factory';

// During application startup, after agents are registered:
async function setupFallbackSystem() {
  // Initialize the default agent system
  const defaultAgentService = await initializeDefaultAgentSystem({
    // Optional: Specify a default agent ID
    defaultAgentId: 'general-assistant-agent-id',
    
    // Optional: Configure confidence threshold (0-1)
    confidenceThreshold: 0.7,
  });
  
  // Configure ClassifierFactory to use default agent fallback
  const classifierFactory = new ClassifierFactory({
    defaultAgentOptions: {
      enabled: true,
      defaultAgentId: 'general-assistant-agent-id',
      confidenceThreshold: 0.7
    }
  });
  
  return { defaultAgentService, classifierFactory };
}
```

## Integration with Classifier

To use the fallback system with a classifier:

```typescript
// In your agent selection logic:
async function selectAgent(userInput, conversationHistory) {
  const result = await classifierFactory.classify(
    userInput, 
    conversationHistory,
    {
      enableDefaultAgentFallback: true, // Enable default agent fallback
    }
  );
  
  // result.selectedAgentId will be the default agent ID if fallback was triggered
  return agentRegistry.getAgent(result.selectedAgentId);
}
```

## Monitoring Fallback Metrics

To monitor and analyze fallback occurrences:

```typescript
function getFallbackMetrics() {
  const metrics = DefaultAgentService.getInstance().getFallbackMetrics();
  
  console.log(`Total fallbacks: ${metrics.totalFallbacks}`);
  console.log(`Low confidence fallbacks: ${metrics.lowConfidenceFallbacks}`);
  console.log(`Missing agent fallbacks: ${metrics.missingAgentFallbacks}`);
  console.log(`Error fallbacks: ${metrics.errorFallbacks}`);
  console.log(`Average confidence at fallback: ${metrics.averageConfidenceAtFallback.toFixed(3)}`);
  
  // Distribution by intent
  console.log('Fallback distribution by intent:');
  Object.entries(metrics.fallbacksByIntent).forEach(([intent, count]) => {
    console.log(`  ${intent}: ${count}`);
  });
  
  return metrics;
}
```

## Adjusting Fallback Thresholds

To optimize the balance between specialized agent accuracy and fallback frequency, you can adjust the confidence threshold:

```typescript
// Increase threshold for more cautious agent selection (more fallbacks)
DefaultAgentService.getInstance().setConfidenceThreshold(0.8);

// Lower threshold for more aggressive agent selection (fewer fallbacks)
DefaultAgentService.getInstance().setConfidenceThreshold(0.5);
```

## Best Practices

1. **Choose a Default Agent Wisely**: Your default agent should have broad capabilities to handle a wide range of requests.

2. **Monitor Fallback Patterns**: Regularly analyze the fallback metrics to identify classification weaknesses or missing agent capabilities.

3. **Start Conservative**: Begin with a higher confidence threshold (e.g., 0.7-0.8) and adjust based on real-world performance.

4. **Test Fallback Scenarios**: Include tests for low-confidence and edge-case scenarios to ensure the fallback system works as expected.

5. **Improve Classification**: Use fallback metrics to improve your classification system, focusing on intents with high fallback rates.

## Customizing Fallback Behavior

For more advanced use cases, you can modify the `processFallbackLogic` method in a subclass of `DefaultAgentService`:

```typescript
class CustomFallbackService extends DefaultAgentService {
  processFallbackLogic(
    classifierResult: ClassifierResult,
    userQuery: string
  ): ClassifierResult {
    // Add custom logic before calling the parent method
    if (userQuery.includes('emergency')) {
      // Route emergencies to a specific agent
      const emergencyAgent = this.agentRegistry.getAgent('emergency-agent-id');
      if (emergencyAgent) {
        return {
          ...classifierResult,
          selectedAgentId: emergencyAgent.id,
          confidence: 1.0,
          reasoning: 'Emergency-related query routed to emergency agent.'
        };
      }
    }
    
    // Fall back to default behavior
    return super.processFallbackLogic(classifierResult, userQuery);
  }
}
``` 