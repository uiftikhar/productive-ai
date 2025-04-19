# LangGraph Migration Notes

## Overview

This project has been migrated from a custom agent orchestration system to LangGraph, which provides a more structured, graph-based approach to agent workflows.

## Changes Made

1. **Removed Legacy Components**:
   - `src/agents/orchestration/` - Custom orchestration system replaced by LangGraph
   - `src/agents/messaging/` - Custom messaging system replaced by LangGraph state management
   - `src/agents/registry/` - Agent registry replaced by direct agent instantiation
   - `src/agents/specialized/orchestration/` - Specialized orchestration components
   - `src/agents/adapters/agent-context.adapter.ts` - Context adapter replaced by LangGraph state

2. **Simplified Architecture**:
   - Now uses `StandardizedMeetingAnalysisAdapter` for the primary meeting analysis workflow
   - Direct instantiation of the `MeetingAnalysisAgent` in the controller
   - Removed fallback mechanisms in favor of more robust error handling

3. **Updated Configuration**:
   - Added required configuration properties to `LangChainConfig`
   - Consolidated adapter imports

## Code Structure

The new architecture follows this pattern:

```
src/agents/               # Agent definitions and interfaces
src/langgraph/            # LangGraph integration
  |- core/                # Core LangGraph components
     |- adapters/         # LangGraph workflow adapters
     |- state/            # State definitions
     |- utils/            # Utility functions
src/summary-generator/    # Application endpoints
```

## Building the Project

The build process should complete successfully for the core LangGraph functionality. There may be errors in tests and experimental components that haven't been fully migrated.

## Next Steps

1. Update remaining tests to work with the new architecture
2. Consider migrating any remaining agent implementations to use LangGraph
3. Improve error handling in the LangGraph workflow
4. Add more comprehensive documentation for creating new LangGraph adapters

## Backup

The removed code has been backed up to a directory with a timestamp. Please review and delete this backup once you're confident in the migration. 