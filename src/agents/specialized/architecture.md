# Specialized Agents Architecture

## Overview

This document outlines the architecture for the specialized intelligence agents, focusing on the Meeting Analysis Agent and Decision Tracking Agent. These agents build upon the base agent framework to provide domain-specific capabilities.

## Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────┐
│                                                                       │
│                          Client Applications                          │
│                                                                       │
└───────────────┬───────────────────────────────────────┬───────────────┘
                │                                       │
                ▼                                       ▼
┌───────────────────────────┐               ┌───────────────────────────┐
│                           │               │                           │
│   API / Endpoint Layer    │◄──────────────┤    User Interface Layer   │
│                           │               │                           │
└───────────────┬───────────┘               └───────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────────┐
│                                                                       │
│                      Specialized Agent Orchestrator                   │
│                                                                       │
└───────────┬───────────────────────────────────────────┬───────────────┘
            │                                           │
            ▼                                           ▼
┌───────────────────────────┐               ┌───────────────────────────┐
│                           │ Communication │                           │
│   Meeting Analysis Agent  │◄─────Channel──┤   Decision Tracking Agent │
│                           │               │                           │
└─┬─────────────────────────┘               └─────────────────────────┬─┘
  │                                                                   │
  ▼                                                                   ▼
┌─────────────────────────────┐                       ┌───────────────────────────┐
│                             │                       │                           │
│ Topic Extraction Capability │                       │ Decision ID Capability    │
│                             │                       │                           │
└─────────────────────────────┘                       └───────────────────────────┘
┌─────────────────────────────┐                       ┌───────────────────────────┐
│                             │                       │                           │
│ Summary Generation          │                       │ Decision Categorization   │
│                             │                       │                           │
└─────────────────────────────┘                       └───────────────────────────┘
┌─────────────────────────────┐                       ┌───────────────────────────┐
│                             │                       │                           │
│ Action Item Detection       │                       │ Impact Assessment         │
│                             │                       │                           │
└─────────────────────────────┘                       └───────────────────────────┘
┌─────────────────────────────┐                       ┌───────────────────────────┐
│                             │                       │                           │
│ Sentiment Analysis          │                       │ Reporting Interface       │
│                             │                       │                           │
└─────────────────────────────┘                       └───────────────────────────┘
                │                                           │
                ▼                                           ▼
┌───────────────────────────────────────────────────────────────────────┐
│                                                                       │
│                           Shared Services                             │
│                                                                       │
├───────────────────┬───────────────────────────────┬───────────────────┤
│ Model Router      │ Context Window Optimizer      │ RAG Prompt Manager│
└───────────────────┴───────────────────────────────┴───────────────────┘
                │                                           │
                ▼                                           ▼
┌───────────────────────────┐               ┌───────────────────────────┐
│                           │               │                           │
│      Storage Layer        │               │      External Services    │
│  (Transcript & Decisions) │               │                           │
└───────────────────────────┘               └───────────────────────────┘
```

## Key Components

### 1. Specialized Agent Orchestrator

The orchestrator manages communication between specialized agents and routes requests to the appropriate agent based on capabilities.

**Responsibilities:**
- Register specialized agents and their capabilities
- Route requests to the appropriate agent
- Manage communication channels between agents
- Handle request-response patterns and event broadcasts

### 2. Meeting Analysis Agent

Analyzes meeting transcripts to extract insights, topics, and decisions.

**Capabilities:**
- Topic extraction and clustering
- Summary generation
- Action item detection
- Sentiment analysis
- Decision candidate identification

### 3. Decision Tracking Agent

Identifies, categorizes, and tracks decisions across meetings.

**Capabilities:**
- Decision identification
- Decision categorization
- Impact assessment
- Decision status tracking
- Decision reporting

### 4. Communication Channel

Facilitates structured communication between agents.

**Features:**
- Message routing
- Request-response pattern
- Event broadcasting
- Error handling

### 5. Shared Services

Both agents leverage existing shared services:

- **Model Router Service**: Selects the optimal LLM based on the task
- **Context Window Optimizer**: Manages context efficiently for large transcripts
- **RAG Prompt Manager**: Creates optimized prompts with relevant context

## Data Flow

1. **Transcript Processing**:
   - Raw transcript is submitted to Meeting Analysis Agent
   - Agent processes transcript and extracts topics, summaries, and potential decisions

2. **Decision Tracking**:
   - Meeting Analysis Agent sends decision candidates to Decision Tracking Agent
   - Decision Tracking Agent identifies, categorizes, and assesses decisions
   - Decision metadata is stored for future reference and reporting

3. **Reporting**:
   - Users can request reports from Decision Tracking Agent
   - Reports can analyze decisions across meetings, topics, and time periods

## Integration Points

The specialized agents integrate with:

1. **Base Agent Framework**: Extending the BaseAgent class
2. **Model Router**: Using appropriate models for different analysis tasks
3. **Storage Systems**: Persisting meeting analyses and decisions
4. **User Interface**: Presenting analysis results and decisions

## Implementation Strategy

The implementation follows a capability-based approach where each specialized agent registers specific capabilities that it can handle. This allows for:

1. **Scalability**: New capabilities can be added without changing the architecture
2. **Flexibility**: Different LLMs can be used for different capabilities
3. **Maintainability**: Capabilities can be tested and improved independently

## Transcript Handling Standards

Transcripts follow a standardized format:

- Each transcript segment includes speaker identification, timestamp, and content
- Metadata includes meeting ID, date, participants, and duration
- Preprocessing normalizes text and handles special formatting
- Large transcripts are processed in chunks to manage context windows efficiently

## Decision Data Models

Decisions adhere to a standardized schema:

- Each decision has a unique ID, text description, and metadata
- Decisions are categorized (strategic, tactical, operational, etc.)
- Impact is assessed (high, medium, low)
- Status tracking enables following decisions through their lifecycle
- References to source meetings and segments maintain provenance 