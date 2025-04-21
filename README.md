# Productive AI

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-v18%2B-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-v4.9%2B-blue)](https://www.typescriptlang.org/)

</div>

A powerful platform for AI-driven productivity, focusing on meeting intelligence, knowledge management, workflow automation, and intelligent agent coordination. Productive AI uses advanced LLM orchestration to transform organizational communication and decision-making.

## 🚀 Key Features

- **AI-Powered Meeting Analysis**: Automatic generation of meeting summaries, topics, action items, and sentiment analysis
- **Knowledge Continuity System**: Track topics and decisions across multiple meetings
- **Document Summarization**: Generate concise summaries of long documents with key points extraction
- **Jira Ticket Generation**: Automatically create structured tickets from meeting content
- **Expertise Fingerprinting**: Map organizational knowledge to the people who possess it
- **Vector Search & RAG**: Semantic search capabilities with Retrieval-Augmented Generation
- **LangGraph Workflows**: Sophisticated agent orchestration using LangGraph
- **Intent Classification System**: Smart routing of requests to specialized agents based on intent
- **SupervisorAgent**: Multi-agent coordination and task orchestration
- **Task Planning System**: Decomposition of complex tasks into manageable subtasks
- **Agent Communication Framework**: Inter-agent communication for collaborative problem-solving

## 🏗️ Architecture

The application is built with a modular architecture:

```
src/
├── agents/            # Agent implementations (core AI components)
│   ├── base/          # Base agent implementations
│   ├── classifiers/   # Intent classification systems
│   ├── communication/ # Agent communication framework
│   ├── factories/     # Agent factory patterns
│   ├── interfaces/    # Agent interfaces and contracts
│   ├── services/      # Agent services (registry, discovery, task execution)
│   ├── specialized/   # Specialized agent implementations (including Supervisor)
│   └── types/         # Type definitions
├── auth/              # Authentication and authorization
├── database/          # Database configurations and models
├── jira-ticket-generator/ # Jira integration services
├── langgraph/         # LangGraph workflow implementations
│   ├── core/          # Core LangGraph components
│   │   ├── adapters/  # Workflow adapters
│   │   ├── state/     # State management
│   │   └── workflows/ # Workflow implementations
│   └── examples/      # Example implementations
├── langchain/         # LangChain utilities and extensions
├── pinecone/          # Vector database integrations
├── shared/            # Shared utilities and services
├── summary-generator/ # Document summarization services
├── app.ts             # Express application setup
└── index.ts           # Application entry point
```

### Core Components

- **Agent System**: Extensible AI agent framework with standardized interfaces
- **Intent Classification**: Intelligent request routing to specialized agents
- **LangGraph Integration**: Advanced workflow orchestration for complex AI tasks
- **SupervisorAgent**: Multi-agent coordination and task management
- **Vector Database**: Persistent storage of embeddings for semantic search
- **Embedding Service**: Text embedding generation for semantic understanding
- **Context Management**: Sophisticated context handling for conversations and documents

## 🔧 Getting Started

### Prerequisites

- Node.js v18+ and npm
- MongoDB
- OpenAI API key
- Pinecone API key (for vector storage)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/productive-ai.git
   cd productive-ai
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file with required environment variables:
   ```
   # Server
   PORT=3000
   NODE_ENV=development
   
   # MongoDB
   MONGODB_URI=mongodb://localhost:27017/productive-ai
   
   # OpenAI
   OPENAI_API_KEY=your_openai_api_key
   
   # Pinecone
   PINECONE_API_KEY=your_pinecone_api_key
   PINECONE_ENVIRONMENT=us-west1-gcp
   
   # Auth
   SESSION_SECRET=your_session_secret
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

## 🧠 Using the AI Features

### Meeting Analysis

```typescript
import { AgentFactory } from './src/agents/factories/agent-factory';

// Create a meeting analysis agent
const meetingAnalysisAgent = AgentFactory.createMeetingAnalysisAgent({
  logger: myLogger,
});

// Analyze a meeting transcript
const result = await meetingAnalysisAgent.execute({
  input: transcriptText,
  capability: 'analyze-transcript',
  parameters: {
    meetingTitle: 'Weekly Team Standup',
    participantIds: ['user-1', 'user-2', 'user-3'],
  },
});

console.log(result.output);
```

### Intent Classification

```typescript
import { ClassifierFactory } from './src/agents/factories/classifier-factory';
import { AgentRegistryService } from './src/agents/services/agent-registry.service';

// Get the registry with registered agents
const registry = AgentRegistryService.getInstance();

// Create a classifier
const classifier = ClassifierFactory.getInstance().createClassifier('openai');
classifier.setAgents(registry.getAllAgents());

// Classify a user query
const result = await classifier.classify(
  "I need a summary of yesterday's marketing meeting",
  previousConversationHistory
);

console.log(`Selected agent: ${result.selectedAgentId}`);
console.log(`Confidence: ${result.confidence}`);
console.log(`Intent: ${result.intent}`);
```

### Multi-Agent Task Orchestration

```typescript
import { SupervisorAgent } from './src/agents/specialized/supervisor-agent';
import { SupervisorAdapter } from './src/langgraph/core/adapters/supervisor-adapter';
import { ResearchAgent } from './src/agents/specialized/research-agent';
import { ContentAgent } from './src/agents/specialized/content-agent';

// Create specialized agents
const researchAgent = new ResearchAgent();
const contentAgent = new ContentAgent();

// Create a supervisor agent with team members
const supervisor = new SupervisorAgent({
  defaultTeamMembers: [
    { agent: researchAgent, role: 'Researcher', priority: 8, active: true },
    { agent: contentAgent, role: 'Content Creator', priority: 6, active: true }
  ]
});

// Create a LangGraph workflow adapter
const adapter = new SupervisorAdapter(supervisor, {
  tracingEnabled: true
});

// Execute a coordinated task with multiple subtasks
const result = await adapter.executeCoordinatedTask(
  'Create a comprehensive report on renewable energy',
  [
    {
      description: 'Research current renewable energy technologies and adoption rates',
      requiredCapabilities: ['research'],
      priority: 9
    },
    {
      description: 'Create a detailed report based on research findings',
      requiredCapabilities: ['content-creation'],
      priority: 7
    }
  ],
  'sequential' // Execution strategy: sequential, parallel, or prioritized
);

console.log(result.output);
```

### Document Summarization

```typescript
import { generateSummary } from './src/summary-generator/summary-generator';

const summary = await generateSummary({
  content: longDocumentText,
  contentType: 'text',
  title: 'Project Proposal',
  includeKeypoints: true,
  includeTags: true,
});

console.log(summary);
```

### Semantic Search

```typescript
import { EmbeddingServiceFactory } from './src/shared/services/embedding.factory';

// Get the embedding service
const embeddingService = EmbeddingServiceFactory.getService();

// Search within a long document
const results = await embeddingService.searchInLongText(
  'Key metrics for Q2 performance',
  quarterlyReportText,
  { minScore: 0.7, maxResults: 5 }
);

console.log(results);
```

## 🔄 LangGraph Workflows

The project uses LangGraph for advanced workflow orchestration:

### Meeting Analysis Workflow

```typescript
import { StandardizedMeetingAnalysisAdapter } from './src/langgraph/core/adapters/standardized-meeting-analysis.adapter';
import { MeetingAnalysisAgent } from './src/agents/specialized/meeting-analysis-agent';

// Create a meeting analysis agent
const meetingAnalysisAgent = new MeetingAnalysisAgent();

// Create a LangGraph adapter for sophisticated workflow
const adapter = new StandardizedMeetingAnalysisAdapter(meetingAnalysisAgent, {
  tracingEnabled: true,
  maxChunkSize: 2000,
  chunkOverlap: 200,
});

// Process a meeting transcript with the workflow
const result = await adapter.processMeetingTranscript({
  meetingId: 'meeting-123',
  transcript: meetingTranscript,
  title: 'Project Kickoff',
  participantIds: ['user-1', 'user-2', 'user-3'],
  userId: 'organizer-id',
  includeTopics: true,
  includeActionItems: true,
  includeSentiment: true,
});

console.log(result.output);
```

### Supervisor Workflow

```typescript
import { SupervisorWorkflow } from './src/langgraph/core/workflows/supervisor-workflow';
import { SupervisorAgent } from './src/agents/specialized/supervisor-agent';

// Create a supervisor agent
const supervisor = new SupervisorAgent();

// Create a workflow for multi-agent orchestration
const workflow = new SupervisorWorkflow(supervisor, {
  tracingEnabled: true
});

// Execute a complex workflow with multiple agents
const result = await workflow.execute({
  input: 'Analyze market trends and create a report',
  parameters: {
    tasks: [
      {
        name: 'Market Research',
        description: 'Research current market trends in tech sector',
        priority: 9,
        requiredCapabilities: ['research']
      },
      {
        name: 'Data Analysis',
        description: 'Analyze collected market data',
        priority: 8,
        requiredCapabilities: ['data-analysis']
      },
      {
        name: 'Report Creation',
        description: 'Create a comprehensive market report',
        priority: 7,
        requiredCapabilities: ['content-creation'],
        dependencies: ['Market Research', 'Data Analysis']
      }
    ],
    executionStrategy: 'sequential'
  }
});

console.log(result);
```

## 🧩 Creating Custom Agents

1. Extend the BaseAgent class:

```typescript
import { BaseAgent } from './src/agents/base/base-agent';

export class MyCustomAgent extends BaseAgent {
  constructor(options = {}) {
    super(
      'My Custom Agent',
      'A custom agent for specialized tasks',
      {
        id: 'my-custom-agent-id',
        ...options
      }
    );
    
    this.registerCapability({
      name: 'my-capability',
      description: 'What this capability does',
    });
  }
  
  protected async executeInternal(request) {
    // Implement your agent logic here
    return {
      output: 'Response from my custom agent',
    };
  }
}
```

2. Register with the AgentRegistryService:

```typescript
import { AgentRegistryService } from './src/agents/services/agent-registry.service';

// Get the registry instance
const registry = AgentRegistryService.getInstance();

// Register your agent
registry.registerAgent(myCustomAgent);

// Later, discover agents by capability
const agentsWithCapability = registry.findAgentsByCapability('my-capability');
```

## 📊 Visualization

The project includes visualization capabilities for debugging and analysis:

```bash
# Generate a workflow visualization
npm run visualize:workflow -- --workflow=meeting-analysis

# View the visualization in your browser
open visualizations/meeting-analysis-workflow.html
```

## 🧪 Running Tests

```bash
# Run all tests
npm test

# Run specific test suite
npm test -- --testPathPattern=supervisor-agent

# Run tests with coverage
npm test -- --coverage
```

## 🚀 Running Examples

The project includes several examples to demonstrate functionality:

```bash
# Run the supervisor multi-agent scenario
npx ts-node src/langgraph/examples/supervisor-multi-agent-scenario.ts

# Run the task planning example
npx ts-node src/agents/examples/task-planning-example.ts

# Run the meeting analysis example
npx ts-node src/langgraph/examples/meeting-analysis-example.ts
```

## 📝 Contributing

Contributions are welcome! Please see our [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [LangChain](https://js.langchain.com/) for LLM application framework
- [LangGraph](https://github.com/langchain-ai/langgraph-js) for workflow orchestration
- [OpenAI](https://openai.com/) for LLM capabilities
- [Pinecone](https://www.pinecone.io/) for vector database services

