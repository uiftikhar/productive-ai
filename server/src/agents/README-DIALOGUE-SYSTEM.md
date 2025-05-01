# Agent Dialogue System

This module implements Phase 3, Milestone 2 of the project: a natural, autonomous dialogue system between agents with negotiation capabilities.

## Overview

The dialogue system enables structured, intent-driven conversations between agents, allowing them to:
- Track and manage conversational state through phases
- Generate and respond to diverse request types
- Conduct multi-turn negotiations with proposals and counter-proposals
- Detect and handle clarification needs

## Components

### 1. Dialogue Management Service

`DialogueManagementService` provides the foundation for structured agent conversations:
- Tracks dialogue states through defined phases (initiation, exploration, negotiation, etc.)
- Manages transitions between dialogue phases based on message intents
- Supports different dialogue types (information exchange, negotiation, problem-solving)
- Creates and tracks clarification requests
- Provides dialogue templates for common conversation patterns
- Analyzes conversation patterns (dominant participants, unanswered questions)

### 2. Request Formulation Service

`RequestFormulationService` helps agents create structured requests:
- Generates standardized request formats for different patterns (information, action, clarification)
- Extracts request patterns from natural language
- Converts free-form text to structured requests
- Maps request urgency to message priority

### 3. Response Generation Service

`ResponseGenerationService` handles replies to agent requests:
- Creates structured responses to various request types
- Tracks outstanding requests to ensure they're handled
- Provides different response strategies based on request context
- Detects implicit requests in natural language
- Maps request patterns to appropriate response intents

### 4. Negotiation Dialogue Service

`NegotiationDialogueService` enables complex negotiations between agents:
- Facilitates structured proposals and counter-proposals
- Tracks negotiation state, including proposal history
- Manages agreement and disagreement records
- Implements resolution strategies (consensus, majority)
- Handles acceptance and rejection protocols

## Interfaces

The system is built on several key interfaces:

### Dialogue System Interface
- `DialogueType`: Information exchange, negotiation, problem-solving, etc.
- `DialoguePhase`: Tracks conversation progression through stages
- `DialogueState`: Manages the current state of a dialogue
- `DialogueEnabledConversation`: Extends basic conversations with dialogue capabilities
- `RequestPattern`: Categorizes types of requests (information, action, clarification)
- `StructuredRequest`: Standard format for requests between agents
- `StructuredResponse`: Standard format for responses to requests
- `NegotiationState`: Tracks proposals, agreements, and resolution status

## Usage

The test script `test-dialogue-system.js` demonstrates the dialogue system in action with several scenarios:

1. **Information Exchange**: Agent requests research information and receives a structured response
2. **Clarification Request**: Agent asks for clarification on ambiguous terms
3. **Action Request**: Agent requests another agent to perform a task
4. **Negotiation**: Two agents negotiate resource allocation with proposals and counter-proposals

## Running the Tests

```bash
# Build the TypeScript files
npm run build

# Run the dialogue system test
npm run test:dialogue

# Run the agent messaging test
npm run test:messaging
```

## Design Principles

1. **Intent-Driven**: Dialogue flow is guided by the intent of messages
2. **Stateful**: System maintains conversation context across multiple turns
3. **Templated**: Common dialogue patterns are templated for consistency
4. **Analyzable**: Conversations can be analyzed for patterns and issues
5. **Scalable**: Can handle multiple concurrent dialogues between different agents

## Future Enhancements

- LLM integration for more sophisticated request/response parsing
- Sentiment analysis in conversation tracking
- Multi-party negotiation with coalition formation
- Learning from past negotiation outcomes to improve future proposals 