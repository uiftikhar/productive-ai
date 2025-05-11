# OpenAI and Pinecone Integration Guide

This document explains how to set up and use the real OpenAI and Pinecone integrations in the Meeting Analysis Agent system.

## Overview

The Meeting Analysis Agent system now supports real LLM calls via OpenAI and real vector embeddings via Pinecone. This integration enables:

1. Actual LLM-powered analysis of meeting transcripts
2. Real vector embeddings for semantic search
3. Retrieval-augmented generation (RAG) for context-aware responses
4. Toggle between mock mode and real API mode

## Prerequisites

Before using the real integrations, ensure you have:

1. An OpenAI API key with access to GPT models and embedding models
2. A Pinecone account with an API key
3. Node.js 16+ and npm/yarn installed

## Configuration

### Environment Variables

Create a `.env` file in the server directory with the following variables:

```
# OpenAI Configuration
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_MODEL_NAME=gpt-4o
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_TEMPERATURE=0.2
OPENAI_MAX_TOKENS=4000
OPENAI_MAX_RETRIES=3

# Pinecone Configuration
PINECONE_API_KEY=your-pinecone-api-key
PINECONE_ENVIRONMENT=your-environment-id (e.g., gcp-starter)
PINECONE_INDEX_NAME=meeting-analysis
PINECONE_NAMESPACE=meetings
PINECONE_DIMENSIONS=1536

# Mode Configuration
USE_MOCK_IMPLEMENTATIONS=false  # Set to true to use mock implementations instead of real APIs
DEBUG_LOGGING=true             # Set to true for verbose logging
```

### Pinecone Index Setup

You need to create a Pinecone index with the following settings:

1. Index name: `meeting-analysis` (or whatever you set in your config)
2. Dimensions: 1536 (for OpenAI embeddings)
3. Metric: Cosine
4. Pod type: Starter (for testing) or Standard (for production)

## Usage

### Running in Production Mode

To run the system with real API integrations:

1. Set `USE_MOCK_IMPLEMENTATIONS=false` in your `.env` file
2. Ensure you have valid API keys for both OpenAI and Pinecone
3. Start the server: `npm run start`

### Running in Mock/Test Mode

To run with mock implementations (no API calls):

1. Set `USE_MOCK_IMPLEMENTATIONS=true` in your `.env` file
2. Start the server: `npm run start`

The system will simulate LLM calls and vector operations without making actual API requests.

## Testing the Integration

### Pinecone Integration Test

We provide a test script to verify your Pinecone integration:

```bash
node scripts/test-pinecone-integration.js
```

This script:
1. Indexes sample meeting transcripts into Pinecone
2. Performs semantic searches with test queries
3. Shows the relevance scores and matching content

Options:
- `--clean`: Clean up test vectors after running
- `--verbose`: Show more detailed output
- `--mock`: Use mock mode instead of real APIs

### Topic Analysis Agent Test

Test the integration of the OpenAI connector with a topic analysis agent:

```bash
node scripts/test-topic-analysis-agent.js
```

Options:
- `--no-mock`: Use real OpenAI API instead of mocks
- `--verbose`: Show more detailed output
- `--transcript=<path>`: Use a custom transcript file

## Integration Points

### OpenAI Connector

The `OpenAIConnector` class in `server/src/connectors/openai-connector.ts` now provides:

- Text completion via chat models
- Streaming responses
- Embedding generation
- Comprehensive error handling and retries

### Pinecone Connector

The `PineconeConnector` class in `server/src/connectors/pinecone-connector.ts` provides:

- Vector storage and retrieval
- Semantic similarity search
- Metadata filtering
- Namespace management

### RAG Prompt Manager

The `RagPromptManager` class in `server/src/shared/services/rag-prompt-manager.service.ts` implements:

- Context retrieval from vector store
- Prompt optimization based on retrieved context
- Multiple retrieval strategies (semantic, hybrid, recency)
- Template-based prompt generation

## Implementation Notes

### Agent Configuration

The system now uses a central configuration service that controls:

- Whether to use mock mode or real APIs
- API connection parameters
- Token usage limits
- Performance settings

This is implemented in `AgentConfigService` in `server/src/shared/config/agent-config.service.ts`.

### Mock Mode

When running in mock mode:
- LLM calls return predefined responses based on the agent type
- Embeddings are random vectors of the correct dimension
- Vector searches return mock data without querying Pinecone

This allows for development and testing without incurring API costs.

## Debugging

For issues with the integration:

1. Check the server logs for error messages
2. Verify your API keys are correct and have sufficient permissions
3. Ensure your Pinecone index is correctly configured
4. Try running the test scripts with the `--verbose` flag for more details

## Next Steps

After confirming the OpenAI and Pinecone integrations work, consider:

1. Optimizing token usage to reduce costs
2. Implementing caching for frequently used embeddings
3. Setting up proper error handling for production use
4. Adding monitoring for API usage and costs

## Production Considerations

When deploying to production:

1. Set up API key rotation for security
2. Implement rate limiting to prevent excessive API calls
3. Add monitoring for token usage and costs
4. Consider using a more powerful Pinecone tier for better performance
5. Set up proper error handling and fallbacks

## Support

For issues with the integration, please:

1. Check the error logs for detailed information
2. Verify your configuration settings
3. Try running in mock mode to isolate API-specific issues 