/**
 * A prompt component with versioning
 */
export interface PromptComponent {
  id: string;
  content: string;
  version: string;
  description?: string;
  tags?: string[];
  author?: string;
  createdAt: number;
  updatedAt: number;
}

/**
 * Options for composing prompts
 */
export interface PromptCompositionOptions {
  separator?: string;
  includeDescriptions?: boolean;
  order?: string[]; // Specify custom ordering of components
  replacements?: Record<string, string>; // Variable replacements
}

/**
 * PromptLibrary
 * A centralized repository for managing and versioning reusable prompt components
 */
export class PromptLibrary {
  private static promptComponents: Map<string, PromptComponent> = new Map();
  private static tags: Map<string, Set<string>> = new Map();

  /**
   * Register a prompt component
   */
  static registerComponent(
    id: string,
    content: string,
    version: string,
    options: {
      description?: string;
      tags?: string[];
      author?: string;
    } = {},
  ): void {
    const timestamp = Date.now();
    const existingComponent = this.promptComponents.get(id);

    const component: PromptComponent = {
      id,
      content,
      version,
      description: options.description,
      tags: options.tags,
      author: options.author,
      createdAt: existingComponent?.createdAt || timestamp,
      updatedAt: timestamp,
    };

    this.promptComponents.set(id, component);

    // Index by tags for faster lookup
    if (options.tags && options.tags.length > 0) {
      options.tags.forEach((tag) => {
        if (!this.tags.has(tag)) {
          this.tags.set(tag, new Set());
        }
        this.tags.get(tag)?.add(id);
      });
    }
  }

  /**
   * Get a prompt component by ID
   */
  static getComponent(id: string): PromptComponent | undefined {
    return this.promptComponents.get(id);
  }

  /**
   * Get all components by tag
   */
  static getComponentsByTag(tag: string): PromptComponent[] {
    const componentIds = this.tags.get(tag);
    if (!componentIds) return [];

    return Array.from(componentIds)
      .map((id) => this.promptComponents.get(id))
      .filter((component) => component !== undefined) as PromptComponent[];
  }

  /**
   * List all available component IDs
   */
  static listComponents(): string[] {
    return Array.from(this.promptComponents.keys());
  }

  /**
   * List all available tags
   */
  static listTags(): string[] {
    return Array.from(this.tags.keys());
  }

  /**
   * Create a composite prompt from multiple components
   */
  static createCompositePrompt(
    componentIds: string[],
    options: PromptCompositionOptions = {},
  ): string {
    const {
      separator = '\n\n',
      includeDescriptions = false,
      order,
      replacements = {},
    } = options;

    // Use custom ordering if provided
    const orderedIds = order
      ? order.filter((id) => componentIds.includes(id))
      : componentIds;

    const contents = orderedIds
      .map((id) => {
        const component = this.getComponent(id);
        if (!component) return '';

        let result = '';
        if (includeDescriptions && component.description) {
          result += `### ${component.description} ###\n`;
        }
        result += component.content;

        // Apply variable replacements
        if (replacements && Object.keys(replacements).length > 0) {
          Object.entries(replacements).forEach(([key, value]) => {
            result = result.replace(
              new RegExp(`\\{\\{${key}\\}\\}`, 'g'),
              value,
            );
          });
        }

        return result;
      })
      .filter((content) => content.trim() !== '');

    return contents.join(separator);
  }

  /**
   * Create a versioned composite prompt with information about each component
   */
  static createVersionedCompositePrompt(
    componentIds: string[],
    options: PromptCompositionOptions = {},
  ): {
    prompt: string;
    components: { id: string; version: string }[];
    createdAt: number;
  } {
    const prompt = this.createCompositePrompt(componentIds, options);
    const components = componentIds
      .map((id) => {
        const component = this.getComponent(id);
        return component
          ? { id: component.id, version: component.version }
          : undefined;
      })
      .filter((c) => c !== undefined) as { id: string; version: string }[];

    return {
      prompt,
      components,
      createdAt: Date.now(),
    };
  }

  /**
   * Delete a component from the library
   */
  static deleteComponent(id: string): boolean {
    const component = this.promptComponents.get(id);
    if (!component) return false;

    // Remove from tags index
    if (component.tags) {
      component.tags.forEach((tag) => {
        const tagSet = this.tags.get(tag);
        if (tagSet) {
          tagSet.delete(id);
          // Remove the tag entirely if this was the last component with this tag
          if (tagSet.size === 0) {
            this.tags.delete(tag);
          }
        }
      });
    }

    // Remove the component
    return this.promptComponents.delete(id);
  }

  /**
   * Initialize the library with default components
   */
  static initialize(): void {
    this.registerDefaultComponents();
  }

  /**
   * Register default prompt components
   */
  private static registerDefaultComponents(): void {
    // General purpose components
    this.registerComponent(
      'system_instruction_base',
      'You are a helpful, professional AI assistant. Your responses should be accurate, helpful, and concise.',
      '1.0.0',
      {
        description: 'Base system instruction for general purpose interactions',
        tags: ['system', 'general'],
      },
    );

    // RAG specific components
    this.registerComponent(
      'rag_prefix',
      "I'll provide you with some relevant information to help answer the user's question. Use this context to formulate your response.",
      '1.0.0',
      {
        description: 'Prefix for RAG-based responses',
        tags: ['rag', 'context', 'prefix'],
      },
    );

    this.registerComponent(
      'rag_citation_instruction',
      'Cite sources from the provided context using square brackets (e.g., [1], [2]) when referencing specific information. Include a "Sources" section at the end of your response listing the references used.',
      '1.0.0',
      {
        description: 'Instructions for citing sources in RAG responses',
        tags: ['rag', 'citation', 'instruction'],
      },
    );

    // Instruction template
    // Task-specific components
    this.registerComponent(
      'summarization_instruction',
      'Summarize the following content in a clear, concise manner. Identify key points, main ideas, and essential details. The summary should be comprehensive yet brief.',
      '1.0.0',
      {
        description: 'Instructions for content summarization',
        tags: ['task', 'summarization'],
      },
    );

    this.registerComponent(
      'code_explanation_instruction',
      'Explain the following code in clear, simple terms. Describe what it does, how it works, and identify any important patterns or techniques used.',
      '1.0.0',
      {
        description: 'Instructions for code explanation',
        tags: ['task', 'code', 'explanation'],
      },
    );
  }
}
