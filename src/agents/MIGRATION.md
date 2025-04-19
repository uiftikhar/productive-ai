# BaseAgent to UnifiedAgent Migration Status

This document tracks the progress of migrating from `BaseAgent` to `UnifiedAgent` across the codebase.

## Migration Status

- [x] Added deprecation notices to BaseAgent
- [x] Created migration guide in README.md
- [x] Created migration script (src/scripts/migrate-to-unified-agent.ts)
- [x] Added npm scripts for migration:
  - `npm run migrate-agents` - Generate migration report
  - `npm run migrate-agents:apply` - Apply automatic migrations

## Completed Migrations

The following components have been successfully migrated:

- [x] KnowledgeRetrievalAgent
- [x] RetrievalAgent
- [x] DocumentRetrievalAgent
- [x] ConversationAdapter (now uses UnifiedAgent instead of BaseAgent)
- [x] BaseAgentAdapter (already using UnifiedAgent)
- [x] Visualization utilities (visualize-adapters.ts)

## Pending Migrations

The following components still need to be migrated:

- [ ] Test files
- [ ] DecisionTrackingAgent
- [ ] Integration test agents

## Future Work

After all migrations are complete:

1. Run the test suite to ensure all functionality works as expected
2. Remove the BaseAgent file
3. Update all documentation and examples

## Migration Progress

Overall progress: ~ 70% complete 

# Migration Guide: Adapters to Integrations

This document outlines the migration plan from the legacy adapter-based architecture to the new integration-based architecture.

## 1. Overview of Changes

| Old Structure | New Structure |
|---------------|--------------|
| `adapters/` | `integrations/` |
| `OpenAIAdapter` | `OpenAIConnector` |
| `ContextAdapter` | `ContextProvider` |
| `LanguageModelAdapter` | `LanguageModelProvider` |
| `BaseAgentAdapter` | LangGraph workflows |

## 2. Direct Migration Approach

Instead of creating compatibility layers, we'll directly update all code to use the new structures:

### Step 1: Update All Import Paths

```diff
- import { OpenAIAdapter } from '../adapters/openai-adapter';
+ import { OpenAIConnector } from '../integrations/openai-connector';

- import { LanguageModelAdapter } from '../adapters/language-model-adapter.interface';
+ import { LanguageModelProvider } from '../integrations/language-model-provider.interface';
```

### Step 2: Replace Adapter Instances With Connector Instances

```diff
- const openAIAdapter = new OpenAIAdapter();
+ const openAIConnector = new OpenAIConnector();

- const embeddingService = new EmbeddingService(openAIAdapter);
+ const embeddingService = new EmbeddingService(openAIConnector);
```

### Step 3: Update Service Implementations

For services that depend on adapters, update them to work with the new interfaces:

```diff
- constructor(private adapter: OpenAIAdapter) {
+ constructor(private connector: OpenAIConnector) {

- const result = await this.adapter.generateChatCompletion(messages);
+ const result = await this.connector.generateChatCompletion(messages);
```

### Step 4: Use LangGraph Workflows Instead of Adapters

```diff
- import { BaseAgentAdapter } from '../../langgraph/core/adapters/base-agent.adapter';
+ import { AgentWorkflow } from '../../langgraph/core/workflows/agent-workflow';

- const adapter = new BaseAgentAdapter(agent);
+ const workflow = new AgentWorkflow(agent);

- const result = await adapter.execute(request);
+ const result = await workflow.execute(request);
```

## 3. Migration Plan

1. **Phase 1**: Migrate core services to use the new connectors
   - Update EmbeddingService
   - Update all specialized agents

2. **Phase 2**: Migrate workflow implementations
   - Replace adapter usage with workflow usage
   - Update all references to adapters

3. **Phase 3**: Remove old code
   - Delete the `adapters` directory
   - Remove all unused adapter imports and references

4. **Phase 4**: Final verification
   - Run all tests to ensure everything works correctly
   - Update documentation to reflect new architecture

## 4. Testing Guidelines

For each migrated component:

1. Write tests to verify that the new implementation maintains the same behavior
2. Test error handling to ensure robust operation
3. Verify performance is maintained or improved

## 5. Benefits

* Cleaner architecture with consistent naming
* Direct integration with LangGraph for workflows
* Improved type safety and code maintainability
* Reduced complexity by eliminating legacy code
* Better separation of concerns 

# Migration Execution Plan

## Phase 1: Core Integration Services (Started)

1. ✅ Create new interface structures in `integrations/`
   - `language-model-provider.interface.ts` 
   - `context-provider.interface.ts`

2. ✅ Create initial implementations
   - `openai-connector.ts`
   - (Future) `context-provider.ts`

3. ✅ Update `EmbeddingService` to work with new connectors
   - Removed adapter support and only depend on connectors
   - Simplified the implementation

## Phase 2: Service Updates (In Progress)

1. Update agent implementations to use new connectors
   - ✅ `KnowledgeRetrievalAgent`
   - ⏳ `RetrievalAgent` (Partially updated)
   - ⏳ `MeetingAnalysisAgent` (Partially updated)
   - `DecisionTrackingAgent`

2. Update dependent services
   - `RagPromptManager`
   - `BaseContextService`
   - Any other services with adapter dependencies

## Phase 3: LangGraph Workflows (Not Started)

1. Implement LangGraph-based workflows
   - ✅ Created `workflows/base-workflow.ts`
   - ✅ Created `workflows/agent-workflow.ts`
   - Create specialized workflows

2. Update agent orchestration
   - Replace `BaseAgentAdapter` with `AgentWorkflow`
   - Create migration tests for workflow functionality

## Phase 4: Cleanup and Final Migration (Not Started)

1. Test replacements for core functionality
   - Unit tests for connectors
   - Integration tests for workflows

2. Remove obsolete adapters
   - `openai-adapter.ts`
   - `context-adapter.interface.ts`
   - `language-model-adapter.interface.ts`
   - `pinecone-adapter.ts`
   - `adapters/index.ts`
   - Test files for adapters

3. Documentation updates
   - Update READMEs across the codebase
   - Create usage examples for new integrations and workflows

## Expected Timeline

- **Phase 1**: 1 week ✅
- **Phase 2**: 2 weeks (in progress)
- **Phase 3**: 2 weeks
- **Phase 4**: 1 week

Total migration time: 6 weeks

## Migration Checklist

For each file with adapter dependencies:

1. [ ] Identify all adapter imports
2. [ ] Replace with equivalent connector imports
3. [ ] Update constructor parameters
4. [ ] Update method calls (e.g., `generateEmbeddings` → `generateEmbedding`)
5. [ ] Test functionality
6. [ ] Update related documentation

## Affected Files

```
src/agents/adapters/openai-adapter.ts
src/agents/adapters/context-adapter.interface.ts
src/agents/adapters/pinecone-adapter.ts
src/agents/adapters/language-model-adapter.interface.ts
src/agents/adapters/index.ts

src/agents/specialized/knowledge-retrieval-agent.ts
src/agents/specialized/retrieval-agent.ts
src/agents/specialized/meeting-analysis-agent.ts
src/agents/specialized/decision-tracking-agent.ts
```

# Migration Progress Update

## Completed Steps

1. ✅ Fixed naming consistency issues
   - Renamed `AgentInterface` to `BaseAgentInterface` for clarity
   - Added backward compatibility type alias
   - Updated `BaseAgent` to implement `BaseAgentInterface`

2. ✅ Created new connectors
   - Created `PineconeConnector` in the integrations directory
   - Updated `EmbeddingService` to work with new connectors only
   - Created connector exports in `integrations/index.ts`

3. ✅ Updated service interfaces
   - Updated `AgentRegistryService` to use `BaseAgentInterface`
   - Updated `AgentDiscoveryService` to use `BaseAgentInterface`
   - Removed adapter bridge and compatibility layer

## Next Steps

1. ⏳ Complete migration for all agents
   - Update `KnowledgeRetrievalAgent` implementation
   - Fix remaining linter errors in `meeting-analysis-agent.ts`
   - Update other specialized agents

2. Run comprehensive tests
   - Test agent creation and registration
   - Test embedding generation and retrieval
   - Test specialized agent capabilities

3. Delete old adapter files
   - Remove all files in `adapters/` directory
   - Update imports across the codebase 