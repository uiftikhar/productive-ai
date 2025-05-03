# Agentic Meeting Analysis System

This directory contains the implementation of the Collaborative Framework (Phase 3) and Advanced Functionality (Phase 5) for the Agentic Meeting Analysis System. The framework enhances the system with structured collaboration, quality control, conflict resolution mechanisms, team formation, and adaptation capabilities.

## Overview

The Collaborative Framework transforms the system from independent agents into a cohesive, self-regulating analytical system that can handle complex, ambiguous, and potentially contradictory information while maintaining high output quality.

The Advanced Functionality layer builds on this foundation by adding dynamic team formation capabilities and sophisticated adaptation mechanisms that respond to content characteristics and performance metrics.

## Key Components

### Phase 3: Collaborative Framework

The framework consists of three primary services:

1. **CollaborativeProtocolService**: Implements structured workflows and communication patterns for agent collaboration
2. **QualityControlService**: Ensures reliability and accuracy through validation and refinement processes
3. **ConflictResolutionService**: Manages conflicts between agents through structured dialogue and resolution protocols

### Phase 5: Advanced Functionality

This layer adds advanced capabilities:

1. **SemanticChunkingService**: Implements intelligent segmentation of meeting transcripts to extract content characteristics
2. **TeamFormationService**: Builds optimized teams based on meeting complexity and content characteristics
3. **AdaptationTriggerService**: Monitors content and performance to detect when adaptations are needed
4. **AdaptationManagerService**: Executes adaptations such as specialist recruitment and methodology switching

## Running the Tests

You can run the test demonstrations using the following commands:

```bash
# Run the Collaborative Framework test
make test-collaborative

# Run the Collaborative Framework test with verbose logging
make test-collaborative-verbose

# Run the Advanced Functionality test
make test-phase5
```

## Implementation Details

### Collaborative Framework

The Collaborative Framework handles the flow of information and coordination between agents:

- **Defined Analysis Phases**: Organizes the analysis process into distinct phases (initial analysis, cross-validation, consensus building, and synthesis)
- **Quality Control Mechanisms**: Provides confidence scoring, cross-validation, and feedback integration
- **Conflict Resolution**: Includes detection, classification, and resolution of contradictory findings

### Advanced Functionality

The Advanced Functionality layer enhances adaptability and efficiency:

- **Meeting Characteristics Assessment**: Analyzes meeting content to determine technical complexity, interactive dynamics, and topic diversity
- **Content-Based Team Formation**: Selects agents based on required expertise for the specific meeting
- **Adaptation Mechanisms**: Adjusts the system's focus, composition, and methodology based on content and performance triggers

## Next Steps

Future enhancements could include:

1. Integration with external knowledge sources
2. Personalization based on organizational context
3. Advanced conflict resolution with argumentation frameworks
4. Multi-meeting analysis with trend detection
5. Real-time adaptation during live meetings 