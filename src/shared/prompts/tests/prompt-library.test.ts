import { PromptLibrary, PromptComponent } from '../prompt-library.ts';

describe('PromptLibrary', () => {
  // Enable fake timers for this test suite
  jest.useFakeTimers();

  // Clean up after each test
  afterEach(() => {
    jest.useRealTimers();
  });

  // Reset PromptLibrary before each test to avoid cross-test contamination
  beforeEach(() => {
    // Clear all components by using a hack to access the private property
    (PromptLibrary as any).promptComponents = new Map();
    (PromptLibrary as any).tags = new Map();
  });

  describe('registerComponent', () => {
    it('should register a component correctly', () => {
      PromptLibrary.registerComponent(
        'test_component',
        'This is a test component',
        '1.0.0',
        {
          description: 'Test description',
          tags: ['test', 'example'],
        },
      );

      const component = PromptLibrary.getComponent('test_component');
      expect(component).toBeDefined();
      expect(component?.content).toBe('This is a test component');
      expect(component?.version).toBe('1.0.0');
      expect(component?.description).toBe('Test description');
      expect(component?.tags).toContain('test');
      expect(component?.tags).toContain('example');
    });

    it('should update an existing component', () => {
      // Register initial version
      PromptLibrary.registerComponent(
        'test_component',
        'Initial content',
        '1.0.0',
      );

      // Store the createdAt timestamp
      const component = PromptLibrary.getComponent('test_component');
      expect(component).toBeDefined(); // Make sure the component exists
      const initialCreatedAt = component!.createdAt; // We know it's defined now

      // Mock Date.now() for the second call to return a later timestamp
      const originalDateNow = Date.now;
      const mockDateNow = jest.fn().mockReturnValue(initialCreatedAt + 1000);
      Date.now = mockDateNow;

      // Update the component
      PromptLibrary.registerComponent(
        'test_component',
        'Updated content',
        '1.1.0',
      );

      const updatedComponent = PromptLibrary.getComponent('test_component');
      expect(updatedComponent?.content).toBe('Updated content');
      expect(updatedComponent?.version).toBe('1.1.0');
      expect(updatedComponent?.createdAt).toBe(initialCreatedAt); // Should be the same
      expect(updatedComponent?.updatedAt).toBeGreaterThan(
        updatedComponent?.createdAt as number,
      ); // Should be updated

      // Mock Date.now() for the third call to return an even later timestamp
      mockDateNow.mockReturnValue(initialCreatedAt + 2000);

      // Update again
      PromptLibrary.registerComponent(
        'test_component',
        'Final content',
        '1.2.0',
      );

      const finalComponent = PromptLibrary.getComponent('test_component');
      expect(finalComponent?.content).toBe('Final content');
      expect(finalComponent?.version).toBe('1.2.0');
      expect(finalComponent?.createdAt).toBe(initialCreatedAt); // Should still be the same
      expect(finalComponent?.updatedAt).toBeGreaterThan(
        updatedComponent?.updatedAt as number,
      ); // Should be updated again

      // Restore original Date.now
      Date.now = originalDateNow;
    });
  });

  describe('getComponentsByTag', () => {
    it('should retrieve components by tag', () => {
      // Register components with different tags
      PromptLibrary.registerComponent('component1', 'Content 1', '1.0.0', {
        tags: ['test', 'system'],
      });

      PromptLibrary.registerComponent('component2', 'Content 2', '1.0.0', {
        tags: ['test', 'user'],
      });

      PromptLibrary.registerComponent('component3', 'Content 3', '1.0.0', {
        tags: ['user'],
      });

      // Get components by tag
      const testComponents = PromptLibrary.getComponentsByTag('test');
      expect(testComponents.length).toBe(2);
      expect(testComponents.map((c) => c.id)).toContain('component1');
      expect(testComponents.map((c) => c.id)).toContain('component2');

      const userComponents = PromptLibrary.getComponentsByTag('user');
      expect(userComponents.length).toBe(2);
      expect(userComponents.map((c) => c.id)).toContain('component2');
      expect(userComponents.map((c) => c.id)).toContain('component3');

      const systemComponents = PromptLibrary.getComponentsByTag('system');
      expect(systemComponents.length).toBe(1);
      expect(systemComponents[0].id).toBe('component1');
    });

    it('should return empty array for non-existent tag', () => {
      const components = PromptLibrary.getComponentsByTag('nonexistent');
      expect(components).toEqual([]);
    });
  });

  describe('createCompositePrompt', () => {
    beforeEach(() => {
      // Register test components
      PromptLibrary.registerComponent('header', 'This is the header', '1.0.0', {
        description: 'Header component',
      });

      PromptLibrary.registerComponent(
        'body',
        'This is the body with {{variable}}',
        '1.0.0',
        { description: 'Body component' },
      );

      PromptLibrary.registerComponent('footer', 'This is the footer', '1.0.0', {
        description: 'Footer component',
      });
    });

    it('should create a composite prompt from multiple components', () => {
      const prompt = PromptLibrary.createCompositePrompt([
        'header',
        'body',
        'footer',
      ]);

      expect(prompt).toContain('This is the header');
      expect(prompt).toContain('This is the body with {{variable}}');
      expect(prompt).toContain('This is the footer');
    });

    it('should include descriptions when specified', () => {
      const prompt = PromptLibrary.createCompositePrompt(
        ['header', 'body', 'footer'],
        { includeDescriptions: true },
      );

      expect(prompt).toContain('### Header component ###');
      expect(prompt).toContain('### Body component ###');
      expect(prompt).toContain('### Footer component ###');
    });

    it('should apply variable replacements', () => {
      const prompt = PromptLibrary.createCompositePrompt(
        ['header', 'body', 'footer'],
        {
          replacements: {
            variable: 'custom value',
          },
        },
      );

      expect(prompt).toContain('This is the body with custom value');
    });

    it('should respect custom ordering', () => {
      const prompt = PromptLibrary.createCompositePrompt(
        ['header', 'body', 'footer'],
        { order: ['footer', 'header', 'body'] },
      );

      const footerIndex = prompt.indexOf('This is the footer');
      const headerIndex = prompt.indexOf('This is the header');
      const bodyIndex = prompt.indexOf('This is the body');

      expect(footerIndex).toBeLessThan(headerIndex);
      expect(headerIndex).toBeLessThan(bodyIndex);
    });

    it('should use custom separator if provided', () => {
      const prompt = PromptLibrary.createCompositePrompt(['header', 'body'], {
        separator: '---SEPARATOR---',
      });

      expect(prompt).toContain(
        'This is the header---SEPARATOR---This is the body',
      );
    });
  });

  describe('createVersionedCompositePrompt', () => {
    beforeEach(() => {
      PromptLibrary.registerComponent('component1', 'Content 1', '1.0.0');

      PromptLibrary.registerComponent('component2', 'Content 2', '2.0.0');
    });

    it('should create a versioned composite prompt', () => {
      const result = PromptLibrary.createVersionedCompositePrompt([
        'component1',
        'component2',
      ]);

      expect(result.prompt).toContain('Content 1');
      expect(result.prompt).toContain('Content 2');
      expect(result.components).toHaveLength(2);
      expect(result.components[0]).toEqual({
        id: 'component1',
        version: '1.0.0',
      });
      expect(result.components[1]).toEqual({
        id: 'component2',
        version: '2.0.0',
      });
      expect(result.createdAt).toBeDefined();
    });
  });

  describe('deleteComponent', () => {
    it('should delete a component and clean up tags', () => {
      // Register component with tags
      PromptLibrary.registerComponent(
        'component_to_delete',
        'Delete me',
        '1.0.0',
        { tags: ['test_tag', 'another_tag'] },
      );

      // Verify component exists
      expect(PromptLibrary.getComponent('component_to_delete')).toBeDefined();
      expect(PromptLibrary.getComponentsByTag('test_tag')).toHaveLength(1);

      // Delete the component
      const result = PromptLibrary.deleteComponent('component_to_delete');
      expect(result).toBe(true);

      // Verify component is deleted
      expect(PromptLibrary.getComponent('component_to_delete')).toBeUndefined();
      expect(PromptLibrary.getComponentsByTag('test_tag')).toHaveLength(0);
    });

    it('should return false when deleting non-existent component', () => {
      const result = PromptLibrary.deleteComponent('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should register default components', () => {
      PromptLibrary.initialize();

      // Check for some default components
      expect(
        PromptLibrary.getComponent('system_instruction_base'),
      ).toBeDefined();
      expect(PromptLibrary.getComponent('rag_prefix')).toBeDefined();
      expect(
        PromptLibrary.getComponent('rag_citation_instruction'),
      ).toBeDefined();

      // Check tag indexing
      expect(PromptLibrary.getComponentsByTag('rag')).toHaveLength(2);
      expect(PromptLibrary.getComponentsByTag('system')).toHaveLength(1);
    });
  });
});
