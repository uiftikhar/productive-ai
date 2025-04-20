# Agent Integrations

This directory contains connectors that integrate the agent framework with external services and AI models.

## Architecture

The integrations follow a provider pattern:

1. `language-model-provider.interface.ts` - Interface for language model providers
2. `context-provider.interface.ts` - Interface for context providers
3. Implementations:
   - `openai-connector.ts` - Connector for OpenAI's API
   - Add additional connectors as needed

## Usage Guidelines

When implementing a new integration:

1. Create an interface file if it's a new type of integration
2. Implement the interface in a concrete connector class
3. Add the new connector to the index.ts exports

## Best Practices

1. Keep connectors focused on a single responsibility
2. Abstract away vendor-specific details
3. Use consistent error handling patterns
4. Include comprehensive logging
5. Add proper TypeScript typing

## Examples

See `openai-connector.ts` for a complete example of implementing a language model provider. 