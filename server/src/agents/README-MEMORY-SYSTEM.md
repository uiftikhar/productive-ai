# Agent Memory System

This document outlines the Agent Memory System implementation created for Milestone 3 of the Agent Architecture project.

## Overview

The Agent Memory System provides persistent memory capabilities for both individual agents and teams, enabling:

1. **Collaborative Workspaces** - Shared spaces for agent teams to collaborate and exchange artifacts
2. **Individual Agent Memory** - Episodic and semantic memory for individual agents
3. **Knowledge Sharing** - Protocols for sharing memories between agents with verification mechanisms

## System Architecture

The memory system consists of several interconnected components:

```
┌─────────────────────┐     ┌───────────────────────┐
│  Team Workspace     │     │  Agent Memory         │
│  ----------------   │     │  -----------------    │
│  - Artifacts        │<────│  - Episodic Memory    │
│  - Annotations      │     │  - Semantic Memory    │
│  - Sharing Controls │     │  - Memory References  │
└─────────────────────┘     └───────────────────────┘
          ▲                            ▲
          │                            │
          └────────────┬───────────────┘
                       │
                       ▼
            ┌─────────────────────┐
            │  Knowledge Sharing  │
            │  ----------------   │
            │  - Request/Response │
            │  - Verification     │
            │  - Team Sharing     │
            └─────────────────────┘
```

## Components

### Team Workspace

The team workspace enables collaborative problem-solving by providing:

- **Artifact Management**: Create, update, and share structured artifacts
- **Access Control**: Granular permissions for workspace resources
- **Collaboration Features**: Annotations, versioning, and activity tracking
- **Conflict Management**: Detect and resolve concurrent modifications

Key interfaces and services:
- `team-workspace.interface.ts`: Interface definitions for workspace structures
- `workspace-management.service.ts`: Service for managing workspaces and artifacts

### Agent Memory System

The agent memory system provides individual memory capabilities:

- **Episodic Memory**: Experience-based memory for events and interactions
- **Semantic Memory**: Knowledge-based memory for facts and concepts 
- **Memory References**: Link related memories for efficient retrieval
- **Memory Management**: Reinforcement, decay, and organization

Key interfaces and services:
- `agent-memory.interface.ts`: Interfaces for memory structures
- `episodic-memory.service.ts`: Service for managing episodic memories
- `semantic-memory.service.ts`: Service for managing semantic memories

### Knowledge Sharing System

The knowledge sharing system facilitates information exchange:

- **Request/Response Framework**: Structured protocol for knowledge requests
- **Knowledge Verification**: Validate shared knowledge for accuracy
- **Team Knowledge Sharing**: Share relevant knowledge with team members
- **Relevance Filtering**: Filter shared knowledge by importance and relevance

Key interfaces and services:
- `knowledge-sharing.service.ts`: Service for managing knowledge exchange

## Usage Examples

### Team Workspace

```typescript
// Create a workspace
const workspace = workspaceService.createWorkspace(
  'Research Workspace',
  'team-1',
  'task-123',
  'agent-1',
  'Collaborative research workspace'
);

// Create an artifact
const document = workspaceService.createArtifact(
  workspace.id,
  'Research Findings',
  ArtifactType.DOCUMENT,
  'The research indicates...',
  'text',
  'agent-1'
);

// Add an annotation
workspaceService.addAnnotation(
  document.id,
  'comment',
  'We should expand this section with more details',
  'agent-2'
);

// Search for artifacts
const results = workspaceService.searchArtifacts({
  workspaceId: workspace.id,
  searchText: 'research',
  artifactTypes: [ArtifactType.DOCUMENT],
  tags: ['important']
});
```

### Agent Memory

```typescript
// Create episodic memory
const meeting = episodicMemoryService.createMemory(
  'agent-1',
  'Team Meeting',
  'Planning session for new project',
  'The team discussed project goals and timeline...',
  [
    { timestamp: Date.now(), description: 'Goal setting', significance: 0.8 }
  ],
  ['Agreed on timeline', 'Assigned tasks'],
  { importance: 0.9, confidence: 0.95 }
);

// Create semantic memory
const concept = semanticMemoryService.createMemory(
  'agent-1',
  'Neural Networks',
  'Neural networks are computational models inspired by the human brain...',
  'machine-learning',
  [
    { concept: 'Deep Learning', relationshipType: 'is_a', relationshipStrength: 0.9 }
  ],
  { importance: 0.8, confidence: 0.9 }
);

// Link concepts
semanticMemoryService.linkConcepts(
  'agent-1',
  'Neural Networks',
  'Machine Learning',
  'is_part_of',
  0.9,
  true
);

// Search memories
const results = episodicMemoryService.searchMemories({
  agentId: 'agent-1',
  query: 'meeting',
  importance: 0.7,
  recency: { after: Date.now() - 86400000 }
});
```

### Knowledge Sharing

```typescript
// Create knowledge request
const request = await knowledgeSharingService.createRequest(
  'agent-1',
  'agent-2',
  KnowledgeSharingRequestType.CONCEPT_EXPLANATION,
  'What are neural networks?'
);

// Respond to knowledge request
const response = await knowledgeSharingService.createResponse(
  request.id,
  'agent-2',
  'Neural networks are computational models...',
  { confidence: 0.95, format: 'text' }
);

// Share knowledge with team
const result = await knowledgeSharingService.shareKnowledgeWithTeam(
  'agent-1',
  ['agent-2', 'agent-3'],
  AgentMemoryType.SEMANTIC,
  { domain: 'machine-learning', confidenceThreshold: 0.8 }
);

// Verify knowledge
const verification = await knowledgeSharingService.verifyKnowledge(
  memoryId,
  ['agent-2', 'agent-3'],
  0.7
);
```

## Integration with Existing Components

The Agent Memory System integrates with:

1. **Agent Messaging Service**: For knowledge sharing requests and responses
2. **Agent Registry Service**: For agent identity and capability information
3. **Dialogue Management Service**: For interpreting dialogue in memory context

## Future Extensions

Potential extensions for the memory system include:

1. **Procedural Memory**: For storing skills and methods
2. **Memory Consolidation**: Automated memory organization and compression
3. **Working Memory**: Short-term active memory management
4. **Forgetting Mechanisms**: More sophisticated memory decay algorithms
5. **Memory Embedding**: Vector embeddings for advanced semantic memory

## Testing

Use the `test-agent-memory.js` script to test the memory system functionality. This script demonstrates:

1. Creating and managing team workspaces
2. Adding and sharing artifacts
3. Creating episodic and semantic memories
4. Searching and querying memories
5. Knowledge sharing and verification

Run with:
```
node test-agent-memory.js
``` 