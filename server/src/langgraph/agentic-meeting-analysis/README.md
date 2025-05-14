# Agentic Meeting Analysis System

## Overview

The Agentic Meeting Analysis System is a hierarchical multi-agent system designed to analyze meeting transcripts and extract valuable insights. It implements a supervisor-manager-worker architecture where specialized agents collaborate to process meeting data and produce comprehensive analysis results.

## Architecture

### Hierarchical Structure

The system follows a three-tier architecture:

1. **Supervisor Tier**: Orchestrates the overall analysis process
   - `EnhancedSupervisorAgent`: Top-level agent that oversees the entire analysis workflow
   
2. **Manager Tier**: Coordinates specialized worker agents
   - `AnalysisCoordinatorAgent`: Manages task delegation and result synthesis

3. **Worker Tier**: Specialized agents that perform specific analysis tasks
   - `TopicDiscoveryAgent`: Identifies and extracts main discussion topics
   - `ActionItemSpecialistAgent`: Extracts action items and assignees
   - `DecisionAnalysisAgent`: Identifies decisions made during the meeting
   - `SentimentAnalysisAgent`: Analyzes emotional tone and sentiment
   - `ParticipantDynamicsAgent`: Analyzes speaker participation patterns
   - `SummarySynthesisAgent`: Creates concise meeting summaries
   - `ContextIntegrationAgent`: Incorporates historical context

```
┌─────────────────────┐
│  SupervisorAgent    │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│    CoordinatorAgent  │
└─────────┬───────────┘
          │
          ▼
┌─────────┴───────────┐
│     Worker Agents    │
├─────────────────────┤
│  TopicDiscovery      │
│  ActionItem          │
│  Decision            │
│  Sentiment           │
│  Participant         │
│  Summary             │
│  Context             │
└─────────────────────┘
```

## Data Flow

1. **Input**: Meeting transcript is received by the supervisor agent
2. **Task Planning**: Supervisor decomposes the analysis into subtasks
3. **Delegation**: Tasks are assigned to appropriate worker agents
4. **Processing**: Workers perform specialized analysis
5. **Coordination**: Results are collected and synthesized
6. **Output**: Final analysis is generated with topics, action items, decisions, and summary

```
Transcript → Supervisor → Task Planning → Coordinator → Worker Agents → Results → Synthesis → Final Analysis
```

## Agent Roles and Responsibilities

### Supervisor Agent

- **Purpose**: Oversee the entire analysis process
- **Responsibilities**:
  - Decompose the analysis problem into subtasks
  - Assign tasks to the coordinator
  - Monitor overall progress
  - Handle escalations
  - Ensure quality of final output

### Coordinator Agent

- **Purpose**: Manage worker agents and coordinate their efforts
- **Responsibilities**:
  - Translate supervisor instructions into worker tasks
  - Assign tasks to appropriate workers
  - Track task progress and handle failures
  - Synthesize worker results
  - Report to supervisor

### Worker Agents

#### Topic Discovery Agent
- Identifies main discussion topics
- Maps relationships between topics
- Tracks topic transitions
- Measures time allocation per topic

#### Action Item Specialist Agent
- Extracts action items from transcript
- Identifies assignees
- Determines deadlines
- Classifies priority levels

#### Decision Analysis Agent
- Identifies decisions made during the meeting
- Captures decision context and rationale
- Tracks decision owners
- Links decisions to topics

#### Sentiment Analysis Agent
- Analyzes emotional tone throughout the meeting
- Identifies sentiment shifts
- Detects areas of agreement/disagreement
- Evaluates overall meeting sentiment

#### Participant Dynamics Agent
- Analyzes speaker participation patterns
- Identifies dominant speakers
- Detects interaction patterns
- Measures engagement levels

#### Summary Synthesis Agent
- Creates concise meeting summaries
- Highlights key points
- Synthesizes information from other agents
- Formats output for readability

#### Context Integration Agent
- Incorporates historical context from previous meetings
- Identifies recurring themes
- Tracks progress on ongoing items
- Provides continuity between meetings

## RAG Capabilities

The system incorporates Retrieval-Augmented Generation (RAG) to enhance analysis quality:

### RAG Implementation

1. **Embedding Generation**:
   - Meeting transcripts are embedded using OpenAI embedding models
   - Queries are similarly embedded for semantic searching

2. **Vector Storage**:
   - Embeddings are stored in Pinecone vector database
   - Indexed with metadata for efficient filtering

3. **Contextual Retrieval**:
   - Agents query the vector store to retrieve relevant context
   - Results are filtered by type, date, or other criteria
   - Retrieved context is incorporated into agent prompts

4. **Enhanced Generation**:
   - LLM outputs are improved with relevant contextual information
   - Historical meeting data informs current analysis
   - Cross-referencing between related meetings

### RAG Services

- **MeetingRAGService**: Core service for RAG operations
- **MeetingRAGIntegrator**: Connects agents to RAG capabilities
- **RagPromptManager**: Creates optimized prompts with retrieved context
- **InstructionTemplateService**: Centralizes template management and RAG-enhanced prompt creation

### Instruction Templates

The system uses a structured template approach for generating consistent, high-quality prompts:

1. **Standardized Templates**:
   - Pre-defined instruction templates for various analysis tasks
   - Consistent JSON schemas for structured output
   - Detailed rules and output requirements

2. **Template Categories**:
   - TOPIC_DISCOVERY: For extracting main discussion topics
   - ACTION_ITEM_EXTRACTION: For identifying action items and assignees
   - FINAL_MEETING_SUMMARY: For generating comprehensive summaries
   - MEETING_ANALYSIS_CHUNK: For analyzing transcript segments
   - EMOTION_ANALYSIS: For analyzing emotional tone and engagement
   - PARTICIPANT_DYNAMICS_ANALYSIS: For analyzing speaker patterns

3. **Enhanced Prompts**:
   - Templates are combined with RAG context
   - System prompts include detailed instructions and schemas
   - Response formats are standardized for consistent parsing

## Analysis Workflow

### Full Meeting Analysis

1. Transcript is received by supervisor
2. Supervisor plans analysis strategy
3. Coordinator assigns specialized tasks to workers:
   - Topic extraction
   - Action item identification
   - Decision tracking
   - Sentiment analysis
   - Participation analysis
4. Workers process tasks in parallel
5. Results are collected by the coordinator
6. Summary agent synthesizes a comprehensive report
7. Final analysis is delivered with structured insights

### Targeted Analysis

For targeted analysis (e.g., just action items), the workflow is streamlined:
1. Supervisor identifies the specific goal
2. Only relevant worker agents are activated
3. Analysis focuses on the requested information
4. Results are delivered in the appropriate format

## Agent Protocol Integration

The system supports the Agent Protocol standard, allowing:
- External invocation of analysis capabilities
- Structured tool-based interactions
- Standardized input/output formats
- Integration with other agent systems

## Technical Implementation

- **Base Agent**: All agents inherit from `BaseMeetingAnalysisAgent`
- **Communication**: Event-based messaging system between agents
- **Memory**: Shared memory system for state management
- **Error Handling**: Graceful degradation with fallbacks
- **Observability**: Comprehensive logging and tracking

## Usage

The system can be invoked through:
1. Direct API calls
2. Agent Protocol interface
3. Integration with meeting applications
4. Batch processing of meeting transcripts

For specific implementation details, refer to the corresponding service documentation. 