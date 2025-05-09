import { Request, Response } from 'express';
import { ActionItemProcessor, ExtractedActionItem, ActionItemPriority, ActionItemStatus } from './action-item-processor';
import { AssigneeResolutionService, OrgUser, ResolvedAssignee } from './assignee-resolution.service';
import { 
  ActionItemIntegrationService, 
  IntegrationPlatform, 
  SyncDirection,
  ActionItemData
} from './integration/action-item-integration.service';
import { JiraAdapter, JiraCredentials } from './integration/jira-adapter';
import { MeetingContextService } from '../shared/services/user-context/meeting-context.service';
import { Logger } from '../shared/logger/logger.interface';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { OpenAIConnector } from '../connectors/openai-connector';

/**
 * Main controller for action item processing
 */
export class ActionItemController {
  private logger: Logger;
  private actionItemProcessor: ActionItemProcessor;
  private assigneeResolver: AssigneeResolutionService;
  private integrationService: ActionItemIntegrationService;
  private meetingService: MeetingContextService;
  private llmConnector: OpenAIConnector;
  
  constructor(options: {
    logger?: Logger;
    actionItemProcessor?: ActionItemProcessor;
    assigneeResolver?: AssigneeResolutionService;
    integrationService?: ActionItemIntegrationService;
    meetingService?: MeetingContextService;
    llmConnector?: OpenAIConnector;
  } = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.meetingService = options.meetingService || new MeetingContextService();
    this.llmConnector = options.llmConnector || new OpenAIConnector();
    
    this.actionItemProcessor = options.actionItemProcessor || 
                               new ActionItemProcessor({
                                 meetingService: this.meetingService,
                                 logger: this.logger,
                                 llmConnector: this.llmConnector
                               });
    
    this.assigneeResolver = options.assigneeResolver || 
                            new AssigneeResolutionService({
                              logger: this.logger
                            });
    
    this.integrationService = options.integrationService || 
                              new ActionItemIntegrationService({
                                logger: this.logger
                              });
    
    this.logger.info('ActionItemController initialized');
  }

  /**
   * Process action items from a meeting transcript
   */
  async processTranscript(req: Request, res: Response): Promise<void> {
    try {
      const { userId, meetingId, transcript, meetingDate, organizationalData } = req.body;
      
      if (!userId || !meetingId || !transcript) {
        res.status(400).json({ error: 'Missing required parameters' });
        return;
      }
      
      // Parse the meeting date string if provided
      const parsedMeetingDate = meetingDate ? new Date(meetingDate) : new Date();
      
      // 1. Extract action items from transcript
      const actionItems = await this.actionItemProcessor.extractActionItems(
        userId,
        meetingId,
        transcript,
        parsedMeetingDate
      );
      
      // 2. If organizational data is provided, update the assignee resolver
      if (organizationalData && Array.isArray(organizationalData)) {
        this.assigneeResolver.updateOrganizationalData(organizationalData);
      }
      
      // 3. Extract meeting participants if available
      if (organizationalData && req.body.participantIds) {
        this.assigneeResolver.setMeetingParticipants(meetingId, req.body.participantIds);
      }
      
      // 4. Resolve assignees
      const resolvedItems = await this.resolveActionItemAssignees(actionItems, meetingId);
      
      // 5. Validate action items
      const validatedItems = await this.actionItemProcessor.validateActionItems(
        userId,
        meetingId,
        resolvedItems,
        organizationalData
      );
      
      res.status(200).json({
        success: true,
        actionItems: validatedItems,
        meetingId,
        extractedCount: validatedItems.length
      });
    } catch (error) {
      this.logger.error(`Error processing transcript: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({ 
        error: 'Error processing transcript',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Resolve assignees for action items
   */
  private async resolveActionItemAssignees(
    actionItems: ExtractedActionItem[],
    meetingId: string
  ): Promise<ExtractedActionItem[]> {
    return Promise.all(actionItems.map(async (item) => {
      if (!item.assignee) {
        return item;
      }
      
      // Resolve the assignee using the assignee resolver
      const resolved = this.assigneeResolver.resolveAssignee(
        item.assignee,
        meetingId,
        item.context
      );
      
      if (resolved.userId) {
        return {
          ...item,
          assignee: resolved.userId,
          verificationStatus: resolved.needsVerification ? 'unverified' : 'verified'
        };
      }
      
      // If multiple possible matches, keep original assignee text
      if (resolved.possibleMatches && resolved.possibleMatches.length > 0) {
        return {
          ...item,
          // Add a tag indicating ambiguous assignee
          tags: [...(item.tags || []), 'ambiguous-assignee'],
          verificationStatus: 'unverified'
        };
      }
      
      return item;
    }));
  }
  
  /**
   * Get action items for a meeting
   */
  async getMeetingActionItems(req: Request, res: Response): Promise<void> {
    try {
      const { userId, meetingId } = req.params;
      
      if (!userId || !meetingId) {
        res.status(400).json({ error: 'Missing required parameters' });
        return;
      }
      
      const actionItems = await this.meetingService.getMeetingActionItems(userId, meetingId);
      
      res.status(200).json({
        success: true,
        actionItems,
        meetingId,
        count: actionItems.length
      });
    } catch (error) {
      this.logger.error(`Error getting action items: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({ 
        error: 'Error getting action items',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Update action item status
   */
  async updateActionItemStatus(req: Request, res: Response): Promise<void> {
    try {
      const { userId, actionItemId } = req.params;
      const { status, assigneeId, dueDate, priority } = req.body;
      
      if (!userId || !actionItemId) {
        res.status(400).json({ error: 'Missing required parameters' });
        return;
      }
      
      // Get meeting ID for the action item
      // In a real implementation, you'd look this up from a database
      const meetingId = req.body.meetingId;
      if (!meetingId) {
        res.status(400).json({ error: 'Missing meeting ID' });
        return;
      }
      
      // Update status
      if (status) {
        const isCompleted = status === ActionItemStatus.COMPLETED;
        await this.meetingService.updateActionItemStatus(
          userId,
          meetingId,
          actionItemId,
          isCompleted
        );
      }
      
      // Note: For a complete implementation, we'd need additional methods to update
      // assignee, due date, and priority in the MeetingContextService
      
      res.status(200).json({
        success: true,
        actionItemId,
        status: status || 'unchanged'
      });
    } catch (error) {
      this.logger.error(`Error updating action item: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({ 
        error: 'Error updating action item',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Resolve ambiguous assignee
   */
  async resolveAmbiguousAssignee(req: Request, res: Response): Promise<void> {
    try {
      const { assigneeText, selectedUserId, meetingId } = req.body;
      
      if (!assigneeText || !selectedUserId) {
        res.status(400).json({ error: 'Missing required parameters' });
        return;
      }
      
      // Get the original resolution
      const original = this.assigneeResolver.resolveAssignee(assigneeText, meetingId);
      
      // Confirm with the selected user
      const confirmed = this.assigneeResolver.confirmAssigneeResolution(original, selectedUserId);
      
      res.status(200).json({
        success: true,
        originalText: assigneeText,
        resolvedUserId: confirmed.userId,
        confidence: confirmed.confidence
      });
    } catch (error) {
      this.logger.error(`Error resolving assignee: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({ 
        error: 'Error resolving assignee',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Set up integration with external system
   */
  async setupIntegration(req: Request, res: Response): Promise<void> {
    try {
      const { userId, platform, credentials } = req.body;
      
      if (!userId || !platform || !credentials) {
        res.status(400).json({ error: 'Missing required parameters' });
        return;
      }
      
      let adapter;
      
      // Create the appropriate adapter based on platform
      switch (platform) {
        case IntegrationPlatform.JIRA:
          adapter = new JiraAdapter(credentials as JiraCredentials, this.logger);
          break;
        // Add cases for other platforms as they're implemented
        default:
          res.status(400).json({ error: `Unsupported platform: ${platform}` });
          return;
      }
      
      // Test the connection
      const isConnected = await adapter.initialize() && await adapter.testConnection();
      
      if (!isConnected) {
        res.status(400).json({ error: 'Could not connect to the external system with provided credentials' });
        return;
      }
      
      // Register the adapter
      this.integrationService.registerAdapter(userId, adapter);
      
      res.status(200).json({
        success: true,
        platform,
        userId,
        message: `Successfully connected to ${platform}`
      });
    } catch (error) {
      this.logger.error(`Error setting up integration: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({ 
        error: 'Error setting up integration',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Synchronize action items with external system
   */
  async syncActionItems(req: Request, res: Response): Promise<void> {
    try {
      const { userId, platform, meetingId, direction = SyncDirection.EXPORT_ONLY } = req.body;
      
      if (!userId || !platform) {
        res.status(400).json({ error: 'Missing required parameters' });
        return;
      }
      
      // Get action items
      let actionItems: ActionItemData[] = [];
      
      if (meetingId) {
        // Get items for a specific meeting
        const items = await this.meetingService.getMeetingActionItems(userId, meetingId);
        actionItems = items.map(item => ({
          id: item.id,
          title: item.description,
          status: item.status as ActionItemStatus,
          assigneeId: item.assignee,
          dueDate: item.deadline ? new Date(item.deadline) : null,
          meetingId,
          // Other fields would be populated from database in a real implementation
        }));
      } else {
        // Get all user's action items
        // This would need to be implemented in the MeetingContextService
        // For now, return an empty array
      }
      
      // Sync with external system
      const syncResult = await this.integrationService.synchronize(
        userId,
        platform as IntegrationPlatform,
        actionItems,
        {
          direction: direction as SyncDirection,
          createMissing: true,
          updateExisting: true,
          syncAssignees: true,
          syncDueDates: true,
          filterByMeeting: meetingId
        }
      );
      
      res.status(200).json({
        success: true,
        syncResult
      });
    } catch (error) {
      this.logger.error(`Error syncing action items: ${error instanceof Error ? error.message : 'Unknown error'}`);
      res.status(500).json({ 
        error: 'Error syncing action items',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
  
  /**
   * Register routes
   */
  registerRoutes(app: any): void {
    app.post('/api/v1/action-items/process', this.processTranscript.bind(this));
    app.get('/api/v1/action-items/:userId/:meetingId', this.getMeetingActionItems.bind(this));
    app.put('/api/v1/action-items/:userId/:actionItemId/status', this.updateActionItemStatus.bind(this));
    app.post('/api/v1/action-items/resolve-assignee', this.resolveAmbiguousAssignee.bind(this));
    app.post('/api/v1/action-items/integration/setup', this.setupIntegration.bind(this));
    app.post('/api/v1/action-items/integration/sync', this.syncActionItems.bind(this));
    
    this.logger.info('ActionItemController routes registered');
  }
} 