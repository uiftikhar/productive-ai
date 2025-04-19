import { UnifiedAgent } from '../base/unified-agent';
import { AgentFactory, AgentRegistry, CapabilityRouter, AgentSelectionStrategy } from '../registry';
import { AgentCapability, AgentRequest, AgentResponse } from '../interfaces/unified-agent.interface';

/**
 * Simple example agent that specializes in answering questions
 */
class QuestionAnsweringAgent extends UnifiedAgent {
  
  constructor(name: string, description: string, options: any = {}) {
    super(name, description, options);
    
    // Register capabilities
    this.registerCapability({
      name: 'answer-question',
      description: 'Answer factual questions',
    });
    
    this.registerCapability({
      name: 'explain-concept',
      description: 'Explain complex concepts in simple terms',
    });
  }
  
  /**
   * Execute the agent to answer a question
   */
  protected async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const input = typeof request.input === 'string' 
      ? request.input
      : 'No question provided';
    
    const capability = request.capability || 'answer-question';
    
    let response: string;
    
    if (capability === 'answer-question') {
      response = `Here's my answer to: "${input}"\n\nThis is a simulated answer from ${this.name}.`;
    } else if (capability === 'explain-concept') {
      response = `Let me explain "${input}" in simple terms...\n\nThis is a simulated explanation from ${this.name}.`;
    } else {
      response = `I don't know how to handle the capability: ${capability}`;
    }
    
    return {
      output: response,
      metrics: {
        executionTimeMs: 100,
        tokensUsed: 50,
      }
    };
  }
}

/**
 * Simple example agent that specializes in writing tasks
 */
class WritingAgent extends UnifiedAgent {
  
  constructor(name: string, description: string, options: any = {}) {
    super(name, description, options);
    
    // Register capabilities
    this.registerCapability({
      name: 'write-summary',
      description: 'Write a summary of content',
    });
    
    this.registerCapability({
      name: 'explain-concept',
      description: 'Explain a concept in creative writing style',
      parameters: {
        style: 'creative',
      }
    });
  }
  
  /**
   * Execute the agent to handle a writing task
   */
  protected async executeInternal(request: AgentRequest): Promise<AgentResponse> {
    const input = typeof request.input === 'string' 
      ? request.input
      : 'No content provided';
    
    const capability = request.capability || 'write-summary';
    
    let response: string;
    
    if (capability === 'write-summary') {
      response = `Summary of "${input.substring(0, 30)}...":\n\nThis is a simulated summary from ${this.name}.`;
    } else if (capability === 'explain-concept') {
      response = `Creative explanation of "${input}":\n\nThis is a simulated creative explanation from ${this.name}.`;
    } else {
      response = `I don't know how to handle the capability: ${capability}`;
    }
    
    return {
      output: response,
      metrics: {
        executionTimeMs: 150,
        tokensUsed: 75,
      }
    };
  }
}

/**
 * Run the example
 */
async function runExample() {
  console.log('=== Agent Registry System Example ===');
  
  // 1. Set up agent factory
  const factory = AgentFactory.getInstance();
  
  // 2. Register agent types
  factory.registerAgentType({
    type: 'question-answering',
    constructorFn: QuestionAnsweringAgent,
    defaultConfig: {
      llm: {
        temperature: 0.2,
      }
    },
    capabilities: ['answer-question', 'explain-concept'],
  });
  
  factory.registerAgentType({
    type: 'writing',
    constructorFn: WritingAgent,
    defaultConfig: {
      llm: {
        temperature: 0.7,
      }
    },
    capabilities: ['write-summary', 'explain-concept'],
  });
  
  console.log(`\nRegistered agent types: ${factory.getRegisteredAgentTypes().join(', ')}`);
  
  // 3. Create agent instances
  const qaAgent1 = factory.createAgent(
    'question-answering',
    'Factual Expert',
    'Specializes in answering factual questions accurately',
    {
      metadata: {
        domain: 'general',
        priority: 5,
      }
    }
  );
  
  const qaAgent2 = factory.createAgent(
    'question-answering',
    'Science Expert',
    'Specializes in scientific questions',
    {
      metadata: {
        domain: 'science',
        priority: 8,
      }
    }
  );
  
  const writingAgent = factory.createAgent(
    'writing',
    'Creative Writer',
    'Specializes in creative writing and summaries',
    {
      metadata: {
        domain: 'creative',
        priority: 7,
      }
    }
  );
  
  // 4. Get the registry
  const registry = factory.getRegistry();
  console.log(`\nNumber of registered agents: ${registry.size}`);
  
  // 5. Create a capability router
  const router = new CapabilityRouter(registry);
  
  // 6. Check available capabilities
  const capabilities = router.getSupportedCapabilities();
  console.log(`\nSupported capabilities: ${capabilities.join(', ')}`);
  
  // 7. Route requests to appropriate agents
  console.log('\n=== Routing Requests ===');
  
  const requests: AgentRequest[] = [
    {
      input: 'How does photosynthesis work?',
      capability: 'answer-question',
    },
    {
      input: 'Machine learning',
      capability: 'explain-concept',
    },
    {
      input: 'The meeting discussed quarterly results, product roadmap, and team expansion plans.',
      capability: 'write-summary',
    }
  ];
  
  // Process each request with different strategies
  for (const request of requests) {
    console.log(`\nRouting request for capability: ${request.capability}`);
    
    // Use different routing strategies for explain-concept (which multiple agents can handle)
    const options = request.capability === 'explain-concept'
      ? { 
          strategy: AgentSelectionStrategy.HIGHEST_PRIORITY,
          priorityMetadataKey: 'priority',
        }
      : {};
      
    try {
      const response = await router.routeRequest(request, options);
      console.log(`Response: ${response.output}`);
      console.log(`Metrics: ${JSON.stringify(response.metrics)}`);
    } catch (error: any) {
      console.error(`Error routing request: ${error.message}`);
    }
  }
  
  // 8. Find agents by criteria
  console.log('\n=== Finding Agents ===');
  
  const scienceAgents = registry.findAgents({ 
    metadataMatch: { domain: 'science' }
  });
  
  console.log(`Found ${scienceAgents.length} science domain agents`);
  
  const explainAgents = registry.findAgentsByCapability('explain-concept');
  console.log(`Found ${explainAgents.length} agents that can explain concepts`);
}

// Run the example if this file is executed directly
if (require.main === module) {
  runExample().catch(error => {
    console.error('Error running example:', error);
  });
}

export {
  QuestionAnsweringAgent,
  WritingAgent,
  runExample
}; 