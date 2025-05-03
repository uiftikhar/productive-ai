# Agentic Meeting Analysis System

## Overview

The Agentic Meeting Analysis System is a goal-oriented, collaborative agent system for analyzing meeting transcripts. It represents a complete reimplementation of the previous meeting analysis capabilities, leveraging the advances made in agent autonomy, team formation, and natural inter-agent communication.

This system transforms meeting analysis from a sequential, step-by-step process into a dynamic, goal-oriented approach where specialized agents collaborate to extract insights from meeting transcripts.

## Key Features

- **Goal-Oriented Analysis**: Analysis is driven by objectives rather than predefined steps, allowing for flexible and adaptive strategies.
- **Dynamic Team Formation**: Specialized agents are assembled based on meeting characteristics and analysis goals.
- **Collaborative Analysis**: Agents share context, communicate, and collaborate to produce comprehensive insights.
- **Self-Directed Analysis**: Agents autonomously determine the most effective approach to analyze meeting content.
- **Confidence Scoring**: Agents provide confidence levels for their analyses, allowing for better quality assessment.
- **Rich Visualization**: The system provides visualizations of both analysis results and the analysis process itself.

## Architecture

The system is built around five core components:

1. **Agents**: Specialized AI agents that focus on specific aspects of meeting analysis, such as topic extraction, action item identification, and sentiment analysis.

2. **Shared Memory**: A distributed memory system that allows agents to store, access, and subscribe to shared information.

3. **Communication Framework**: A publish-subscribe messaging system that enables natural communication between agents.

4. **State Management**: A centralized repository for tracking the state of meeting analyses, teams, and results.

5. **API Compatibility Layer**: Ensures backward compatibility with existing meeting analysis endpoints.

### Workflow

1. **Analysis Request**: The system receives a request to analyze a meeting transcript.
2. **Team Formation**: The Analysis Coordinator assembles a team of specialist agents based on the meeting's characteristics and analysis goals.
3. **Goal Definition**: Clear analysis goals are defined and distributed to the team.
4. **Collaborative Analysis**: Agents work together, sharing insights and addressing specific aspects of the meeting.
5. **Result Synthesis**: The Analysis Coordinator synthesizes the contributions from all agents into a comprehensive analysis.
6. **Visualization**: Results are presented through various visualizations that highlight key insights.

## Agent Roles

- **Analysis Coordinator Agent**: Orchestrates the overall analysis process and team formation.
- **Topic Discovery Agent**: Identifies and analyzes discussion topics.
- **Action Item Specialist Agent**: Extracts actionable tasks and commitments.
- **Decision Analysis Agent**: Identifies and analyzes decision-making processes.
- **Participant Dynamics Agent**: Analyzes speaker interactions and engagement.
- **Sentiment Analysis Agent**: Analyzes emotional tone and dynamics.
- **Context Integration Agent**: Connects current meeting to historical information.
- **Summary Synthesis Agent**: Creates the final meeting summary.

## Getting Started

### Installation

The Agentic Meeting Analysis System is integrated into the LangGraph framework. No additional installation is required beyond the standard project setup.

### Usage

```typescript
import { initializeAgenticMeetingAnalysisSystem } from './langgraph/agentic-meeting-analysis';

// Initialize the system
const { memory, state, communication, compatibility } = await initializeAgenticMeetingAnalysisSystem({
  persistenceEnabled: true,
  defaultFeatureFlag: true
});

// Process a meeting transcript using the compatibility layer
const response = await compatibility.processLegacyRequest({
  meetingId: 'meeting-123',
  transcript: 'Meeting transcript content...',
  includeTopics: true,
  includeActionItems: true,
  includeSentiment: true
});

// Access results
console.log(response.output.summary);
```

### API

The system provides both a modern goal-oriented API and a compatibility layer for legacy endpoints:

#### Modern API

```typescript
// Process a meeting transcript with the new agentic approach
const response = await agenticMeetingAnalysis.processRequest({
  meetingId: 'meeting-123',
  transcript: 'Meeting transcript content...',
  goals: ['extract_topics', 'extract_action_items', 'analyze_sentiment'],
  options: {
    teamComposition: {
      maxTeamSize: 5
    },
    visualization: true,
    detailedReasoning: true
  }
});
```

#### Legacy API (Compatibility Layer)

```typescript
// Process a meeting transcript using the legacy format
const response = await meetingAnalysis.processMeetingTranscript({
  meetingId: 'meeting-123',
  transcript: 'Meeting transcript content...',
  includeTopics: true,
  includeActionItems: true,
  includeSentiment: true
});
```

## Configuration

The system can be configured through the initialization options:

```typescript
const system = await initializeAgenticMeetingAnalysisSystem({
  // Logger instance for system logging
  logger: customLogger,
  
  // Enable persistence of memory and state
  persistenceEnabled: true,
  
  // Enable the agentic system by default (vs. legacy)
  defaultFeatureFlag: true
});
```

## Visualization

The system generates several visualizations:

1. **Workflow Visualization**: Shows how the analysis process unfolded, including agent interactions.
2. **Team Visualization**: Displays the team composition and expertise distribution.
3. **Topic Analysis**: Visual representation of topics and their relationships.
4. **Timeline View**: Shows the chronological flow of the meeting with key points highlighted.

## Extension

The system is designed to be extensible:

1. **New Agent Types**: Create specialized agents by extending the `BaseMeetingAnalysisAgent` class.
2. **Custom Analysis Goals**: Define new analysis goals in the `AnalysisGoalType` enum.
3. **Visualization Plugins**: Add custom visualizations by implementing the visualization interface.

## Relationship to Other Systems

This system builds upon and integrates with several other components of the Productive-AI platform:

- **Dynamic Graph System**: Utilizes dynamic graph capabilities for workflow visualization.
- **Adaptive Execution Engine**: Leverages adaptive execution for resource management.
- **Agent Memory System**: Uses the shared memory system for agent collaboration.
- **Natural Agent Dialogue**: Employs inter-agent communication for team coordination.

## Metrics and Evaluation

The system tracks several metrics to evaluate performance:

- **Execution Time**: Overall time to complete the analysis.
- **Confidence Scores**: Agent confidence in their analyses.
- **Agent Interactions**: Number and quality of inter-agent communications.
- **Goal Completion**: Success rate for each analysis goal.

These metrics are available both for individual analyses and as aggregate statistics. 