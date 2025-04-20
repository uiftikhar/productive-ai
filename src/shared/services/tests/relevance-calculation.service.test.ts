import { RelevanceCalculationService } from '../user-context/relevance-calculation.service';
import { ContextType } from '../user-context/context-types';
import {
  UserRole,
  BaseContextMetadata,
} from '../user-context/types/context.types';

// Mock dependencies
jest.mock('../user-context/base-context.service');

describe('RelevanceCalculationService', () => {
  let service: RelevanceCalculationService;

  beforeEach(() => {
    // Create service with mocked logger
    const mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };

    service = new RelevanceCalculationService({ logger: mockLogger });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateRelevanceScore', () => {
    test('should combine multiple relevance factors', () => {
      // Arrange
      const userRole = UserRole.DEVELOPER;
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        relevanceScore: 0.6,
        timestamp: Date.now() - 1000 * 60 * 60 * 24 * 5, // 5 days old
        roleRelevance: {
          [UserRole.DEVELOPER]: 0.8,
          [UserRole.PRODUCT_OWNER]: 0.5,
        },
        targetRoles: [UserRole.DEVELOPER],
        contextType: ContextType.DECISION,
        viewCount: 10,
        lastAccessedAt: Date.now() - 1000 * 60 * 60, // 1 hour ago
      };

      // Act
      const score = service.calculateRelevanceScore(userRole, metadata);

      // Assert
      expect(score).toBeGreaterThan(0.6); // Should increase from base relevance
      expect(score).toBeLessThanOrEqual(1.0); // Should be capped at 1.0
    });

    test('should use default relevance if not provided', () => {
      // Arrange
      const userRole = UserRole.DEVELOPER;
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        // No relevanceScore provided
        timestamp: Date.now(),
      };

      // Act
      const score = service.calculateRelevanceScore(userRole, metadata);

      // Assert
      expect(score).toBeGreaterThanOrEqual(0.5); // Should start from default 0.5
      expect(score).toBeLessThanOrEqual(1.0);
    });

    test('should apply explicit feedback with higher weight', () => {
      // Arrange
      const userRole = UserRole.DEVELOPER;
      const baseRelevance = 0.5;
      const explicitFeedback = 0.9;
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        relevanceScore: baseRelevance,
        explicitRelevanceFeedback: explicitFeedback,
        timestamp: Date.now(),
      };

      // Act
      const score = service.calculateRelevanceScore(userRole, metadata);

      // Assert - explicit feedback should pull score closer to its value (weighted 2:1)
      const expectedMinimumEffect =
        baseRelevance + (explicitFeedback - baseRelevance) * 0.5;
      expect(score).toBeGreaterThanOrEqual(expectedMinimumEffect);
    });

    test('should ensure relevance is within 0-1 bounds', () => {
      // Arrange - stack factors that would push beyond 1.0
      const userRole = UserRole.DEVELOPER;
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        relevanceScore: 0.9,
        roleRelevance: { [UserRole.DEVELOPER]: 1.0 },
        targetRoles: [UserRole.DEVELOPER],
        timestamp: Date.now(),
        contextType: ContextType.DECISION,
        viewCount: 100,
        explicitRelevanceFeedback: 1.0,
      };

      // Act
      const score = service.calculateRelevanceScore(userRole, metadata);

      // Assert
      expect(score).toBe(1.0); // Should be capped at 1.0
    });
  });

  describe('applyRoleRelevance', () => {
    test('should boost relevance for matching target role', () => {
      // Arrange
      const baseRelevance = 0.5;
      const userRole = UserRole.DEVELOPER;
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        targetRoles: [UserRole.DEVELOPER], // Matches user's role
        timestamp: Date.now(),
      };

      // Create instance with exposed private methods for testing
      const serviceWithExposedMethods = service as any;

      // Act
      const result = serviceWithExposedMethods.applyRoleRelevance(
        baseRelevance,
        userRole,
        metadata,
      );

      // Assert
      expect(result).toBeGreaterThan(baseRelevance); // Should be boosted
    });

    test('should use role-specific relevance score if available', () => {
      // Arrange
      const baseRelevance = 0.5;
      const userRole = UserRole.PRODUCT_OWNER;
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        roleRelevance: {
          [UserRole.PRODUCT_OWNER]: 0.8,
          [UserRole.DEVELOPER]: 0.4,
        },
        timestamp: Date.now(),
      };

      // Create instance with exposed private methods for testing
      const serviceWithExposedMethods = service as any;

      // Act
      const result = serviceWithExposedMethods.applyRoleRelevance(
        baseRelevance,
        userRole,
        metadata,
      );

      // Assert - should be weighted toward the role-specific score (0.8)
      expect(result).toBeGreaterThan(baseRelevance);
      expect(result).toBeLessThan(0.8);
    });

    test('should cap relevance at 1.0', () => {
      // Arrange
      const baseRelevance = 0.7;
      const userRole = UserRole.DEVELOPER;
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        targetRoles: [UserRole.DEVELOPER], // Matching role (multiplier effect)
        roleRelevance: {
          [UserRole.DEVELOPER]: 0.9, // High role-specific score
        },
        timestamp: Date.now(),
      };

      // Create instance with exposed private methods for testing
      const serviceWithExposedMethods = service as any;

      // Act
      const result = serviceWithExposedMethods.applyRoleRelevance(
        baseRelevance,
        userRole,
        metadata,
      );

      // Assert
      expect(result).toBeLessThanOrEqual(1.0); // Should be capped
    });
  });

  describe('applyRecencyFactor', () => {
    test('should boost very recent content', () => {
      // Arrange
      const baseRelevance = 0.5;
      const currentTime = Date.now();
      const recentTimestamp = currentTime - 1000 * 60 * 60 * 24; // 1 day old
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        timestamp: recentTimestamp,
      };

      // Create instance with exposed private methods for testing
      const serviceWithExposedMethods = service as any;

      // Act
      const result = serviceWithExposedMethods.applyRecencyFactor(
        baseRelevance,
        metadata,
        currentTime,
      );

      // Assert
      expect(result).toBeGreaterThan(baseRelevance); // Should be boosted
    });

    test('should reduce relevance for older content', () => {
      // Arrange
      const baseRelevance = 0.5;
      const currentTime = Date.now();
      const oldTimestamp = currentTime - 1000 * 60 * 60 * 24 * 60; // 60 days old
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        timestamp: oldTimestamp,
      };

      // Create instance with exposed private methods for testing
      const serviceWithExposedMethods = service as any;

      // Act
      const result = serviceWithExposedMethods.applyRecencyFactor(
        baseRelevance,
        metadata,
        currentTime,
      );

      // Assert
      expect(result).toBeLessThan(baseRelevance); // Should be reduced
    });

    test('should return base relevance if no timestamp', () => {
      // Arrange
      const baseRelevance = 0.5;
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        timestamp: 0, // Zero timestamp
      };

      // Create instance with exposed private methods for testing
      const serviceWithExposedMethods = service as any;

      // Act
      const result = serviceWithExposedMethods.applyRecencyFactor(
        baseRelevance,
        metadata,
      );

      // Assert
      expect(result).toBe(baseRelevance); // Should be unchanged
    });
  });

  describe('applyContentTypeImportance', () => {
    test('should boost decision content', () => {
      // Arrange
      const baseRelevance = 0.5;
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        contextType: ContextType.DECISION,
        timestamp: Date.now(),
      };

      // Create instance with exposed private methods for testing
      const serviceWithExposedMethods = service as any;

      // Act
      const result = serviceWithExposedMethods.applyContentTypeImportance(
        baseRelevance,
        metadata,
      );

      // Assert
      expect(result).toBeGreaterThan(baseRelevance); // Should be boosted
    });

    test('should return base relevance for unknown context type', () => {
      // Arrange
      const baseRelevance = 0.5;
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        contextType: 'UNKNOWN_TYPE' as ContextType,
        timestamp: Date.now(),
      };

      // Create instance with exposed private methods for testing
      const serviceWithExposedMethods = service as any;

      // Act
      const result = serviceWithExposedMethods.applyContentTypeImportance(
        baseRelevance,
        metadata,
      );

      // Assert
      expect(result).toBe(baseRelevance); // Should be unchanged
    });

    test('should return base relevance if no context type', () => {
      // Arrange
      const baseRelevance = 0.5;
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        timestamp: Date.now(),
        // No contextType
      };

      // Create instance with exposed private methods for testing
      const serviceWithExposedMethods = service as any;

      // Act
      const result = serviceWithExposedMethods.applyContentTypeImportance(
        baseRelevance,
        metadata,
      );

      // Assert
      expect(result).toBe(baseRelevance); // Should be unchanged
    });
  });

  describe('applyUsageStatistics', () => {
    test('should boost content with high view count', () => {
      // Arrange
      const baseRelevance = 0.5;
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        viewCount: 100, // High view count
        timestamp: Date.now(),
      };

      // Create instance with exposed private methods for testing
      const serviceWithExposedMethods = service as any;

      // Act
      const result = serviceWithExposedMethods.applyUsageStatistics(
        baseRelevance,
        metadata,
      );

      // Assert
      expect(result).toBeGreaterThan(baseRelevance); // Should be boosted
    });

    test('should boost recently accessed content', () => {
      // Arrange
      const baseRelevance = 0.5;
      const currentTime = Date.now();
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        timestamp: currentTime - 1000 * 60 * 60 * 24 * 10, // 10 days old
        lastAccessedAt: currentTime - 1000 * 60 * 60, // 1 hour ago (recently accessed)
      };

      // Create instance with exposed private methods for testing
      const serviceWithExposedMethods = service as any;

      // Act
      const result = serviceWithExposedMethods.applyUsageStatistics(
        baseRelevance,
        metadata,
      );

      // Assert
      expect(result).toBeGreaterThan(baseRelevance); // Should be boosted
    });

    test('should return base relevance if no usage statistics', () => {
      // Arrange
      const baseRelevance = 0.5;
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        timestamp: Date.now(),
        // No usage statistics
      };

      // Create instance with exposed private methods for testing
      const serviceWithExposedMethods = service as any;

      // Act
      const result = serviceWithExposedMethods.applyUsageStatistics(
        baseRelevance,
        metadata,
      );

      // Assert
      expect(result).toBe(baseRelevance); // Should be unchanged
    });
  });

  describe('calculateThematicRelevance', () => {
    test('should calculate high relevance for matching themes', () => {
      // Arrange
      const queryThemes = ['project-management', 'agile', 'scrum'];
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        themeIds: ['project-management', 'agile', 'kanban'], // 2 matches out of 3
        timestamp: Date.now(),
      };

      // Act
      const relevance = service.calculateThematicRelevance(
        queryThemes,
        metadata,
      );

      // Assert
      expect(relevance).toBeGreaterThan(0.5); // Should be higher than default
    });

    test('should use theme-specific relevance scores if available', () => {
      // Arrange
      const queryThemes = ['project-management', 'agile'];
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        themeIds: ['project-management', 'agile'],
        themeRelevance: {
          'project-management': 0.9, // High relevance
          agile: 0.7,
        },
        timestamp: Date.now(),
      };

      // Act
      const relevance = service.calculateThematicRelevance(
        queryThemes,
        metadata,
      );

      // Assert
      expect(relevance).toBeGreaterThan(0.7); // Should reflect the high relevance scores
    });

    test('should return moderate relevance for no theme data', () => {
      // Arrange
      const queryThemes: string[] = [];
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        timestamp: Date.now(),
        // No theme data
      };

      // Act
      const relevance = service.calculateThematicRelevance(
        queryThemes,
        metadata,
      );

      // Assert
      expect(relevance).toBe(0.5); // Default moderate relevance
    });

    test('should return low relevance for no theme matches', () => {
      // Arrange
      const queryThemes = ['project-management', 'agile'];
      const metadata: BaseContextMetadata = {
        userId: 'user-123',
        contextId: 'context-456',
        themeIds: ['devops', 'security'], // No matches
        timestamp: Date.now(),
      };

      // Act
      const relevance = service.calculateThematicRelevance(
        queryThemes,
        metadata,
      );

      // Assert
      expect(relevance).toBe(0.3); // Low relevance for no matches
    });
  });

  describe('extractRelevanceKeywords', () => {
    test('should extract relevant keywords from text', () => {
      // Arrange
      const text =
        'Project management is the practice of applying knowledge, skills, tools, and techniques to meet project requirements.';

      // Act
      const keywords = service.extractRelevanceKeywords(text);

      // Assert
      expect(keywords).toContain('project');
      expect(keywords).toContain('management');
      expect(keywords).toContain('practice');
      expect(keywords).toContain('applying');
      expect(keywords).toContain('knowledge');
      expect(keywords).toContain('skills');
      expect(keywords).toContain('tools');
      expect(keywords).toContain('techniques');
      expect(keywords).toContain('meet');
      expect(keywords).toContain('requirements');
    });

    test('should filter out common stop words', () => {
      // Arrange
      const text =
        'This is a test with many common words that should be removed';

      // Act
      const keywords = service.extractRelevanceKeywords(text);

      // Assert
      expect(keywords).not.toContain('this');
      expect(keywords).not.toContain('is');
      expect(keywords).not.toContain('a');
      expect(keywords).not.toContain('with');
      expect(keywords).not.toContain('that');
      expect(keywords).not.toContain('be');

      // Should keep meaningful words
      expect(keywords).toContain('test');
      expect(keywords).toContain('common');
      expect(keywords).toContain('words');
      expect(keywords).toContain('removed');
    });

    test('should return empty array for null or undefined text', () => {
      // Act & Assert
      expect(service.extractRelevanceKeywords('')).toEqual([]);
      expect(service.extractRelevanceKeywords(null as any)).toEqual([]);
      expect(service.extractRelevanceKeywords(undefined as any)).toEqual([]);
    });

    test('should remove duplicates', () => {
      // Arrange
      const text =
        'Project management requires project planning and project tracking';

      // Act
      const keywords = service.extractRelevanceKeywords(text);

      // Assert
      expect(keywords.filter((k) => k === 'project').length).toBe(1); // Only one occurrence
    });

    test('should handle punctuation and case sensitivity', () => {
      // Arrange
      const text =
        'Project-Management, PROJECT planning, and project. TRACKING!';

      // Act
      const keywords = service.extractRelevanceKeywords(text);

      // Assert
      expect(keywords).toContain('project');
      expect(keywords).toContain('management');
      expect(keywords).toContain('planning');
      expect(keywords).toContain('tracking');
    });
  });
});
