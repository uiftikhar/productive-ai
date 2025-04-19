# Legacy Adapter Cleanup Plan

This document outlines the plan for safely removing legacy adapter files from the codebase after migration to the new connector-based architecture.

## Current Status - COMPLETED on April 19, 2025

The following legacy files have been removed:

### Adapter Implementations ✅
- `src/agents/adapters/openai-adapter.ts` ✅
- `src/agents/adapters/pinecone-adapter.ts` ✅

### Adapter Interfaces ✅
- `src/agents/adapters/language-model-adapter.interface.ts` ✅
- `src/agents/adapters/context-adapter.interface.ts` ✅

### Export Files ✅
- `src/agents/adapters/index.ts` (updated with deprecation notice) ✅

## Dependencies Updated

The following files were updated to use the new connectors:

1. `src/shared/user-context/services/knowledge-gap.service.ts` ✅
   - Replaced `OpenAIAdapter` with `OpenAIConnector`

2. `src/summary-generator/summary-generator.controller.ts` ✅
   - Replaced `OpenAIAdapter` with `OpenAIConnector`

3. `src/scripts/test-langgraph.ts` ✅
   - Replaced `OpenAIAdapter` with `OpenAIConnector`

## Test Files Removed

The following test files that referenced the legacy adapters have been removed:

- `src/agents/adapters/tests/openai-adapter.test.ts` ✅
- `src/agents/adapters/tests/pinecone-adapter.test.ts` ✅

## Removal Process - COMPLETED

### Step 1: Update Dependencies ✅

- [x] Update `knowledge-gap.service.ts` to use `OpenAIConnector`
- [x] Update `summary-generator.controller.ts` to use `OpenAIConnector`
- [x] Update `test-langgraph.ts` to use `OpenAIConnector`

### Step 2: Create New Tests if Needed ⚠️

- [ ] Consider creating new tests for `OpenAIConnector` and `PineconeConnector` if not already done
- [ ] Make sure all functionality from the old adapters is covered in the new connectors

### Step 3: Remove Legacy Files ✅

1. First, remove the test files:
   - [x] `src/agents/adapters/tests/openai-adapter.test.ts`
   - [x] `src/agents/adapters/tests/pinecone-adapter.test.ts`

2. Then, remove the implementation files:
   - [x] `src/agents/adapters/openai-adapter.ts`
   - [x] `src/agents/adapters/pinecone-adapter.ts`

3. Update the export file:
   - [x] `src/agents/adapters/index.ts` - Replaced with deprecation notice

4. Finally, remove the interface files:
   - [x] `src/agents/adapters/language-model-adapter.interface.ts`
   - [x] `src/agents/adapters/context-adapter.interface.ts`

### Step 4: Verify Application Functionality ⚠️

- [ ] Run linter to ensure no lingering references
- [ ] Start the application and verify core functionality works
- [ ] Test features that previously used these adapters

## Next Steps

While we've completed the removal of legacy adapter files, consider the following next steps:

1. Create dedicated tests for the new connector implementations if they don't already exist
2. Update documentation to reflect the new architecture
3. Remove the `adapters` directory completely in a future update 