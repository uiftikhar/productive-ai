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