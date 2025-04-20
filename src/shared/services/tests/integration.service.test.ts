import { PineconeConnectionService } from '../../../pinecone/pinecone-connection.service';
import { Logger } from '../../logger/logger.interface';
import { IntegrationService } from '../user-context/integration.service';
import {
  ActionItemStatus,
  ContextType,
  UserContextNotFoundError,
  UserContextValidationError,
} from '../user-context/types/context.types';

// Mock Logger
class MockLogger implements Logger {
  debug = jest.fn();
  info = jest.fn();
  warn = jest.fn();
  error = jest.fn();
  setLogLevel = jest.fn();
}

// Mock Pinecone Connection Service
const mockUpsertVectors = jest.fn().mockResolvedValue({});
const mockQueryVectors = jest.fn();
const mockFetchVectors = jest.fn();
const mockDeleteVectors = jest.fn().mockResolvedValue({ deleted: 1 });

const mockPineconeService = {
  initialize: jest.fn().mockResolvedValue({}),
  getIndex: jest.fn().mockResolvedValue({}),
  queryVectors: mockQueryVectors,
  fetchVectors: mockFetchVectors,
  upsertVectors: mockUpsertVectors,
  deleteVectors: mockDeleteVectors,
} as unknown as PineconeConnectionService;

describe('IntegrationService', () => {
  let integrationService: IntegrationService;
  let mockLogger: MockLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLogger = new MockLogger();
    integrationService = new IntegrationService({
      pineconeService:
        mockPineconeService as unknown as PineconeConnectionService,
      logger: mockLogger,
    });
  });

  describe('integrateActionItemWithExternalSystem', () => {
    it('should integrate an action item with an external system', async () => {
      // Mock finding the action item
      mockQueryVectors.mockResolvedValueOnce({
        matches: [
          {
            id: 'a1',
            metadata: {
              actionItemId: 'a1',
              content: 'Test action item',
              userId: 'user1',
              contextType: ContextType.ACTION_ITEM,
            },
            values: [0.1, 0.2, 0.3],
          },
        ],
      });

      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});

      const result =
        await integrationService.integrateActionItemWithExternalSystem(
          'user1',
          'a1',
          'jira',
          'JIRA-123',
          { priority: 'high' },
        );

      expect(result).toBe('JIRA-123');
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        expect.arrayContaining([
          expect.objectContaining({
            metadata: expect.objectContaining({
              externalSystem: 'jira',
              externalSystemId: 'JIRA-123',
            }),
          }),
        ]),
        'user1',
      );
    });

    it('should generate a new external ID if none provided', async () => {
      // Mock finding the action item
      mockQueryVectors.mockResolvedValueOnce({
        matches: [
          {
            id: 'a1',
            metadata: {
              actionItemId: 'a1',
              content: 'Test action item',
              userId: 'user1',
              contextType: ContextType.ACTION_ITEM,
            },
            values: [0.1, 0.2, 0.3],
          },
        ],
      });

      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});

      const result =
        await integrationService.integrateActionItemWithExternalSystem(
          'user1',
          'a1',
          'jira',
        );

      expect(result).toContain('ext-jira-');
    });

    it('should validate inputs for external system integration', async () => {
      await expect(
        integrationService.integrateActionItemWithExternalSystem(
          'user1',
          '', // Empty action item ID
          'jira',
        ),
      ).rejects.toThrow(UserContextValidationError);

      await expect(
        integrationService.integrateActionItemWithExternalSystem(
          'user1',
          'a1',
          '', // Empty external system
        ),
      ).rejects.toThrow(UserContextValidationError);
    });

    it('should throw error if action item not found', async () => {
      mockQueryVectors.mockResolvedValueOnce({
        matches: [], // No matches
      });

      await expect(
        integrationService.integrateActionItemWithExternalSystem(
          'user1',
          'non-existent',
          'jira',
        ),
      ).rejects.toThrow(UserContextNotFoundError);
    });
  });

  describe('syncExternalSystemStatuses', () => {
    it('should synchronize statuses with external system', async () => {
      // Mock finding action items
      mockQueryVectors.mockResolvedValueOnce({
        matches: new Array(10).fill(0).map((_, i) => ({
          id: `action${i}`,
          metadata: {
            actionItemId: `a${i}`,
            externalSystemId: `ext-${i}`,
          },
        })),
      });

      const result = await integrationService.syncExternalSystemStatuses(
        'user1',
        'jira',
      );

      expect(result).toBe(5); // Should be limited to 5 as per implementation
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Synchronized'),
        expect.any(Object),
      );
    });

    it('should return 0 if no items to synchronize', async () => {
      mockQueryVectors.mockResolvedValueOnce({
        matches: [], // No matches
      });

      const result = await integrationService.syncExternalSystemStatuses(
        'user1',
        'jira',
      );

      expect(result).toBe(0);
    });

    it('should validate external system parameter', async () => {
      await expect(
        integrationService.syncExternalSystemStatuses(
          'user1',
          '', // Empty external system
        ),
      ).rejects.toThrow(UserContextValidationError);
    });
  });

  describe('getExternalSystemItems', () => {
    it('should return items integrated with an external system', async () => {
      // Mock finding action items
      mockQueryVectors.mockResolvedValueOnce({
        matches: [
          {
            id: 'action1',
            metadata: {
              actionItemId: 'a1',
              externalSystemId: 'ext-1',
              content: 'Test action item',
              assigneeId: 'user2',
              status: ActionItemStatus.PENDING,
              externalSystemData: JSON.stringify({ priority: 'high' }),
            },
          },
        ],
      });

      const result = await integrationService.getExternalSystemItems(
        'user1',
        'jira',
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(
        expect.objectContaining({
          actionItemId: 'a1',
          externalSystemId: 'ext-1',
          content: 'Test action item',
          externalData: { priority: 'high' },
        }),
      );
    });

    it('should return empty array if no items found', async () => {
      mockQueryVectors.mockResolvedValueOnce({
        matches: [], // No matches
      });

      const result = await integrationService.getExternalSystemItems(
        'user1',
        'jira',
      );

      expect(result).toEqual([]);
    });
  });

  describe('removeExternalIntegration', () => {
    it('should remove integration with external system', async () => {
      // Mock finding the action item
      mockQueryVectors.mockResolvedValueOnce({
        matches: [
          {
            id: 'action1',
            values: [0.1, 0.2, 0.3],
            metadata: {
              actionItemId: 'a1',
              externalSystem: 'jira',
              externalSystemId: 'JIRA-123',
              externalSystemData: JSON.stringify({ priority: 'high' }),
            },
          },
        ],
      });

      mockPineconeService.upsertVectors = jest.fn().mockResolvedValue({});

      const result = await integrationService.removeExternalIntegration(
        'user1',
        'a1',
        'jira',
      );

      expect(result).toBe(true);
      expect(mockPineconeService.upsertVectors).toHaveBeenCalledWith(
        'user-context',
        expect.arrayContaining([
          expect.objectContaining({
            id: 'action1',
            metadata: expect.not.objectContaining({
              externalSystem: 'jira',
              externalSystemId: 'JIRA-123',
              externalSystemData: expect.any(String),
            }),
          }),
        ]),
        'user1',
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Removed external integration for action item',
        expect.any(Object),
      );
    });

    it('should throw error if action item not found', async () => {
      mockQueryVectors.mockResolvedValueOnce({
        matches: [], // No matches
      });

      await expect(
        integrationService.removeExternalIntegration(
          'user1',
          'non-existent',
          'jira',
        ),
      ).rejects.toThrow(UserContextNotFoundError);
    });
  });
});
