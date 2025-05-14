# Services Directory Structure and Naming Conventions

This document outlines the standard structure and naming conventions for services in the Productive AI application.

## Directory Structure

- **`/shared/services/`**: Primary location for all application-wide services
  - Example: `rag-prompt-manager.service.ts`

- **`/shared/[domain]/`**: Domain-specific services are grouped in subdirectories
  - Example: `/shared/embedding/embedding.service.ts`
  - Example: `/shared/user-context/services/meeting-context.service.ts`

- **`/[module]/services/`**: Module-specific services used only within that module
  - Example: `/agents/services/agent-registry.service.ts`

## Naming Conventions

1. **File Names**: Use kebab-case for file names with the `.service.ts` suffix
   - Format: `[feature]-[subfeature].service.ts`
   - Example: `rag-prompt-manager.service.ts`

2. **Class Names**: Use PascalCase for class names with the `Service` suffix
   - Format: `[Feature][SubFeature]Service`
   - Example: `RagPromptManagerService`

3. **Interface Names**: Use PascalCase for interface names with descriptive purpose
   - Format: `I[Feature]Service` or `[Feature]ServiceOptions`
   - Example: `IEmbeddingService` or `EmbeddingServiceOptions`

## Service Organization

Services should adhere to the following principles:

1. **Single Responsibility**: Each service should have a clearly defined responsibility
2. **Dependency Injection**: Dependencies should be injected via constructors
3. **Proper Documentation**: Each service must include JSDoc documentation
4. **Interface Definition**: Public APIs should have well-defined interfaces
5. **Error Handling**: Services should handle errors appropriately and provide meaningful error messages

## Status Indicators

Services may be marked with specific status indicators:

- **`@status STABLE`**: Production-ready, well-tested services
- **`@status EXPERIMENTAL`**: Services under development or testing
- **`@status DEPRECATED`**: Services planned for removal

## Migrating Services

When moving or renaming services:

1. Update the service to point to its new location
2. Add a deprecation notice in the old location
3. Update all imports to use the new location

## Examples

### Production Service
```typescript
/**
 * RagPromptManagerService
 * Manages creation and optimization of RAG prompts.
 * 
 * @status STABLE
 */
export class RagPromptManagerService {
  // Implementation
}
```

### Experimental Service
```typescript
/**
 * MultiModalEmbeddingService
 * Generates embeddings for multi-modal content.
 * 
 * @status EXPERIMENTAL
 */
export class MultiModalEmbeddingService {
  // Implementation
}
```

# Services Overview

## InstructionTemplateService

The `InstructionTemplateService` is a centralized service for managing instruction templates and creating optimized prompts for various AI tasks. It provides integration with Retrieval-Augmented Generation (RAG) capabilities and standardizes prompt creation across the application.

### Features

- **Template Management**: Centralized management of instruction templates
- **RAG Integration**: Built-in support for retrieval-augmented generation
- **Specialized Prompts**: Pre-configured templates for specific analysis tasks
- **Response Format Control**: Consistent handling of JSON/text output formats
- **Error Handling**: Robust fallbacks for embedding and LLM errors

### Usage Examples

#### Basic Prompt Creation

```typescript
// Initialize the service
const instructionTemplateService = new InstructionTemplateService({
  openAiConnector,
  logger
});

// Create a basic prompt
const promptResult = await instructionTemplateService.createPrompt({
  systemRole: SystemRoleEnum.MEETING_ANALYST,
  templateName: InstructionTemplateNameEnum.TOPIC_DISCOVERY,
  content: "Analyze this meeting transcript and extract the main topics discussed.",
});

// Use the generated messages with your LLM
const response = await openAiConnector.generateResponse(
  promptResult.messages,
  {
    temperature: 0.3,
    responseFormat: promptResult.responseFormat === ResponseFormatType.JSON_OBJECT 
      ? { type: 'json_object' } 
      : undefined
  }
);
```

#### RAG-Enhanced Prompts

```typescript
// Create a RAG-enhanced prompt
const promptWithRag = await instructionTemplateService.createPrompt({
  systemRole: SystemRoleEnum.MEETING_ANALYST,
  templateName: InstructionTemplateNameEnum.ACTION_ITEM_EXTRACTION,
  content: meetingTranscript,
  enhanceWithRag: true,
  ragOptions: {
    userId: 'user-123',
    strategy: RagRetrievalStrategy.SEMANTIC,
    maxItems: 5,
    filters: { meetingType: 'planning' }
  }
});
```

#### Specialized Task Prompts

```typescript
// Create a specialized prompt for topic discovery
const topicPrompt = await instructionTemplateService.createSpecializedPrompt(
  'topic_discovery',
  meetingTranscript,
  {
    // Additional context
    meetingId: 'meeting-123',
    participantCount: 5,
    // RAG options
    ragOptions: {
      userId: 'user-123',
      strategy: RagRetrievalStrategy.SEMANTIC
    }
  }
);

// Create a specialized prompt for emotion analysis
const emotionPrompt = await instructionTemplateService.createSpecializedPrompt(
  'emotion_analysis',
  meetingTranscript,
  {
    // Additional context and configuration
  }
);
```

### Available Templates

The service provides access to all templates defined in `InstructionTemplates`:

| Template Name | Purpose | Output Format |
|---------------|---------|--------------|
| TOPIC_DISCOVERY | Extract main discussion topics | JSON Object |
| ACTION_ITEM_EXTRACTION | Identify action items and assignees | JSON Object |
| FINAL_MEETING_SUMMARY | Generate comprehensive meeting summary | JSON Object |
| MEETING_ANALYSIS_CHUNK | Extract structured data from meeting segments | JSON Object |
| EMOTION_ANALYSIS | Analyze emotional tone and engagement | JSON Object |
| PARTICIPANT_DYNAMICS_ANALYSIS | Analyze speaker patterns and team dynamics | JSON Object |

### Custom Templates

You can register custom templates for specialized use cases:

```typescript
// Add a custom template
instructionTemplateService.addTemplate('CUSTOM_ANALYSIS', {
  format: {
    requiredSections: ['insights', 'recommendations'],
    outputFormat: 'json_object',
    jsonSchema: {
      properties: {
        insights: {
          type: 'array',
          description: 'Key insights from analysis'
        },
        recommendations: {
          type: 'array',
          description: 'Actionable recommendations'
        }
      }
    }
  },
  rules: [
    'Focus on actionable insights',
    'Provide evidence-based recommendations'
  ],
  outputRequirements: [
    'Valid JSON format',
    'Concise, clear language'
  ]
});
```

## Integration with Agent System

The InstructionTemplateService is designed to be used by agents in the meeting analysis system to create consistent, high-quality prompts that leverage RAG capabilities. Agents should use this service rather than constructing prompts manually to ensure consistency, proper error handling, and optimal use of context.

Example agent integration:

```typescript
// In an agent class
constructor(config) {
  // Initialize other services
  this.instructionTemplateService = config.instructionTemplateService || 
    new InstructionTemplateService({
      openAiConnector: this.openAiConnector,
      logger: this.logger
    });
}

async analyzeTranscript(transcript) {
  // Create specialized prompt using the service
  const promptResult = await this.instructionTemplateService.createSpecializedPrompt(
    'topic_discovery',
    transcript,
    { /* Additional context */ }
  );
  
  // Process with LLM
  const response = await this.openAiConnector.generateResponse(
    promptResult.messages,
    { /* Model params */ }
  );
  
  // Parse and return results
  return JSON.parse(response.content);
}
``` 