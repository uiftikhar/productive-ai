import { ParticipantRole } from '../../../types/conversation.types';

/**
 * Interface for benchmark dataset items
 */
export interface BenchmarkItem {
  /**
   * Category of the query for testing different aspects
   */
  category: 'general' | 'technical' | 'customer_service' | 'followup' | 'ambiguous';
  
  /**
   * User input to classify
   */
  input: string;
  
  /**
   * Optional conversation history context
   */
  history?: Array<{
    role: ParticipantRole;
    content: string;
    agentId?: string;
  }>;
  
  /**
   * Expected classification result
   */
  expected: {
    /**
     * Expected agent ID to select
     */
    agentId: string | null;
    
    /**
     * Minimum confidence level expected
     */
    minConfidence: number;
    
    /**
     * Whether this should be classified as a follow-up
     */
    isFollowUp: boolean;
    
    /**
     * Expected entities to be identified (subset is acceptable)
     */
    expectedEntities?: string[];
    
    /**
     * Expected intent category
     */
    expectedIntent?: string;
  };
}

/**
 * Agent definitions for benchmark tests
 */
export const BENCHMARK_AGENTS = {
  GENERAL: {
    id: 'general-assistant',
    name: 'General Assistant',
    description: 'A general-purpose assistant that can help with a wide range of tasks and questions.'
  },
  TECHNICAL: {
    id: 'technical-assistant',
    name: 'Technical Assistant',
    description: 'A specialized assistant for technical questions about programming, development, and IT issues.'
  },
  CUSTOMER_SERVICE: {
    id: 'customer-service',
    name: 'Customer Service Assistant',
    description: 'An assistant specialized in handling customer inquiries, orders, and support issues.'
  }
};

/**
 * Benchmark dataset for testing classifier accuracy across different scenarios
 */
export const BENCHMARK_DATASET: BenchmarkItem[] = [
  // General queries
  {
    category: 'general',
    input: 'What can you help me with?',
    expected: {
      agentId: BENCHMARK_AGENTS.GENERAL.id,
      isFollowUp: false,
      minConfidence: 0.7
    }
  },
  {
    category: 'general',
    input: 'Tell me a joke',
    expected: {
      agentId: BENCHMARK_AGENTS.GENERAL.id,
      isFollowUp: false,
      minConfidence: 0.7
    }
  },
  {
    category: 'general',
    input: 'What\'s the weather like today?',
    expected: {
      agentId: BENCHMARK_AGENTS.GENERAL.id,
      isFollowUp: false,
      minConfidence: 0.7
    }
  },
  {
    category: 'general',
    input: 'Can you write a poem about nature?',
    expected: {
      agentId: BENCHMARK_AGENTS.GENERAL.id,
      isFollowUp: false,
      minConfidence: 0.7
    }
  },
  
  // Technical queries
  {
    category: 'technical',
    input: 'How do I fix a TypeError in JavaScript?',
    expected: {
      agentId: BENCHMARK_AGENTS.TECHNICAL.id,
      isFollowUp: false,
      minConfidence: 0.7
    }
  },
  {
    category: 'technical',
    input: 'What\'s the difference between REST and GraphQL?',
    expected: {
      agentId: BENCHMARK_AGENTS.TECHNICAL.id,
      isFollowUp: false,
      minConfidence: 0.7
    }
  },
  {
    category: 'technical',
    input: 'Can you help debug this React component that\'s not rendering correctly?',
    expected: {
      agentId: BENCHMARK_AGENTS.TECHNICAL.id,
      isFollowUp: false,
      minConfidence: 0.7
    }
  },
  {
    category: 'technical',
    input: 'How do I set up a Docker container for my Node.js application?',
    expected: {
      agentId: BENCHMARK_AGENTS.TECHNICAL.id,
      isFollowUp: false,
      minConfidence: 0.7
    }
  },
  
  // Customer service queries
  {
    category: 'customer_service',
    input: 'I want to return an item I purchased last week',
    expected: {
      agentId: BENCHMARK_AGENTS.CUSTOMER_SERVICE.id,
      isFollowUp: false,
      minConfidence: 0.7
    }
  },
  {
    category: 'customer_service',
    input: 'My order hasn\'t arrived yet, can you check the status?',
    expected: {
      agentId: BENCHMARK_AGENTS.CUSTOMER_SERVICE.id,
      isFollowUp: false,
      minConfidence: 0.7
    }
  },
  {
    category: 'customer_service',
    input: 'I was charged twice for my subscription',
    expected: {
      agentId: BENCHMARK_AGENTS.CUSTOMER_SERVICE.id,
      isFollowUp: false,
      minConfidence: 0.7
    }
  },
  {
    category: 'customer_service',
    input: 'How do I cancel my account?',
    expected: {
      agentId: BENCHMARK_AGENTS.CUSTOMER_SERVICE.id,
      isFollowUp: false,
      minConfidence: 0.7
    }
  },
  
  // Follow-up queries
  {
    category: 'followup',
    input: 'Can you explain that in more detail?',
    history: [
      {
        role: ParticipantRole.ASSISTANT,
        content: 'React uses a virtual DOM to optimize rendering performance.',
        agentId: BENCHMARK_AGENTS.TECHNICAL.id
      }
    ],
    expected: {
      agentId: BENCHMARK_AGENTS.TECHNICAL.id,
      isFollowUp: true,
      minConfidence: 0.7
    }
  },
  {
    category: 'followup',
    input: 'What about the refund policy?',
    history: [
      {
        role: ParticipantRole.ASSISTANT,
        content: 'You can return your item within 30 days of purchase with the original receipt.',
        agentId: BENCHMARK_AGENTS.CUSTOMER_SERVICE.id
      }
    ],
    expected: {
      agentId: BENCHMARK_AGENTS.CUSTOMER_SERVICE.id,
      isFollowUp: true,
      minConfidence: 0.7
    }
  },
  {
    category: 'followup',
    input: 'Thanks, can you also tell me about tomorrow?',
    history: [
      {
        role: ParticipantRole.USER,
        content: 'What\'s the weather like today?'
      },
      {
        role: ParticipantRole.ASSISTANT,
        content: 'I don\'t have access to real-time weather data, but I can help you find a weather service.',
        agentId: BENCHMARK_AGENTS.GENERAL.id
      }
    ],
    expected: {
      agentId: BENCHMARK_AGENTS.GENERAL.id,
      isFollowUp: true,
      minConfidence: 0.7
    }
  },
  
  // Ambiguous queries
  {
    category: 'ambiguous',
    input: 'How do I install it?',
    expected: {
      agentId: null,
      isFollowUp: false,
      minConfidence: 0.4
    }
  },
  {
    category: 'ambiguous',
    input: 'How does that work?',
    expected: {
      agentId: null,
      isFollowUp: false,
      minConfidence: 0.4
    }
  },
  {
    category: 'ambiguous',
    input: 'Can you give me more information?',
    expected: {
      agentId: null,
      isFollowUp: false,
      minConfidence: 0.4
    }
  }
]; 