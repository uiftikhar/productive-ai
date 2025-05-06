# Integration Testing Utilities

This folder contains utilities for integration testing the agentic meeting analysis system, following best practices:

1. **Use actual service implementations** where possible
2. **Mock only external dependencies** (LLMs, databases, APIs)
3. **Provide clear patterns** for test setup

## External Dependencies Mocking

We use industry-standard mocking libraries for external dependencies:

### MongoDB In-Memory Server

For database testing, we use [MongoDB In-Memory Server](https://github.com/typegoose/mongodb-memory-server) which:
- Runs a real MongoDB instance in memory during tests
- Provides all MongoDB functionality without external dependencies
- Offers improved performance and reliability compared to custom mocks

```typescript
// Access MongoDB in tests
const collection = testEnv.mocks.database.getCollection('meetings');
await collection.insertOne({ meetingId: 'test-123', title: 'Test Meeting' });

// Check operation logs
const operations = testEnv.mocks.database.getOperationLog();
```

### Mock Service Worker (MSW)

For API mocking, we use [Mock Service Worker](https://mswjs.io/) which:
- Intercepts actual network requests at the network level
- Provides realistic API simulation
- Works with any HTTP client (fetch, axios, etc.)

```typescript
// Configure API endpoint mocks
testEnv.mocks.api.get('/api/meetings/:id', ({ params }) => {
  return { id: params.id, title: 'Test Meeting' };
});

// Verify API calls were made
const requests = testEnv.mocks.api.getRequestHistory();
```

### Language Model Mocking

For language model APIs, we use a custom mock that:
- Simulates OpenAI/LLM API responses
- Provides deterministic responses for testing
- Records all prompts and responses for verification

```typescript
// Configure language model responses
testEnv.mocks.languageModel.addPromptResponse(
  'Analyze transcript for topics',
  JSON.stringify({ topics: ['Product Roadmap', 'Budget'] })
);
```

## Key Principles

### 1. Test the Real System

Integration tests should test the actual system components working together:
- Use real service implementations
- Only mock external dependencies like LLMs and databases
- Configure real services for test scenarios

### 2. Mock External Dependencies Consistently

External dependencies should be mocked consistently:
- Language Models (LLMs)
- Databases (MongoDB)
- External APIs (via MSW)

### 3. Use Test Data Factories

Test data factories provide consistent test data generation:
- Meeting transcripts
- Analysis goals
- Team configurations
- Analysis results

## Getting Started

### Basic Integration Test

```typescript
import { setupTestEnvironment } from '../utils';
import { v4 as uuidv4 } from 'uuid';

describe('StateRepository Integration', () => {
  let testEnv;
  
  beforeEach(async () => {
    // Create a test environment with real services and mocked external dependencies
    testEnv = await setupTestEnvironment();
  });
  
  afterEach(async () => {
    // Clean up resources
    await testEnv.cleanup();
  });
  
  it('should store and retrieve meeting state', async () => {
    // Arrange
    const meetingId = `test-${uuidv4()}`;
    
    // Act
    await testEnv.stateRepository.initialize(meetingId);
    const retrievedState = await testEnv.stateRepository.getState(meetingId);
    
    // Assert
    expect(retrievedState).toBeDefined();
    expect(retrievedState.meetingId).toEqual(meetingId);
  });
});
```

### Customizing External Dependency Behavior

#### MongoDB Configuration

```typescript
// Configure MongoDB with initial data
const testEnv = await setupTestEnvironment({
  mongoDbVersion: '5.0.0',
  initialDbData: {
    meetings: [
      { _id: 'meeting-1', title: 'Existing Meeting' }
    ]
  }
});
```

#### MSW API Mocking

```typescript
// Configure API mocks
testEnv.mocks.api.get('/api/external-service/data', {
  data: {
    items: [
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' }
    ],
    count: 2
  }
});

// Use dynamic responses based on request
testEnv.mocks.api.post('/api/analyze', (req) => {
  return {
    result: req.body.text.length > 100 ? 'long' : 'short',
    id: Date.now()
  };
});
```

#### Language Model Mocking

```typescript
// Configure language model mock for specific responses
testEnv.mocks.languageModel.addPromptResponse(
  'Analyze this transcript for unexpected topics',
  JSON.stringify({
    unexpectedTopics: ['Budget Constraints', 'New Management Structure'],
    confidence: 0.85
  })
);
```

## Migration Guide

We are migrating away from the old `test-utils.ts` approach to this more structured and maintainable approach. For details, see:
`server/src/langgraph/tests/MIGRATION-GUIDE.md`

## Folder Structure

- `mocks/` - Mock implementations for external dependencies
  - `mongodb.mock.ts` - MongoDB In-Memory Server implementation
  - `msw.mock.ts` - Mock Service Worker implementation
  - `language-model.mock.ts` - Language model API mock
- `test-data-factories.ts` - Functions to generate test data
- `setup-test-environment.ts` - Function to set up a test environment
- `index.ts` - Main entry point for the utilities 