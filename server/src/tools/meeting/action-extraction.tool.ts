/**
 * Action Extraction Tool for identifying action items from meeting transcripts
 * Part of Milestone 2.1: Tool Integration Enhancement
 */
import { z } from 'zod';
import { BaseTool, ToolCategory, ToolAccessLevel, ToolExecutionStatus } from '../base/tool.interface';
import { Logger } from '../../shared/logger/logger.interface';
import { 
  transcriptSchema, 
  actionItemsSchema
} from '../schemas/common-schemas';

/**
 * Action extraction options
 */
export const actionExtractionOptionsSchema = z.object({
  minConfidence: z.number().min(0).max(1).default(0.7),
  assignParticipants: z.boolean().default(true),
  extractDueDates: z.boolean().default(true),
  prioritize: z.boolean().default(true),
  includeContext: z.boolean().default(true),
  maxActionItems: z.number().int().positive().default(20)
});

/**
 * Input schema for action extraction tool
 */
export const actionExtractionInputSchema = z.object({
  transcript: transcriptSchema,
  options: actionExtractionOptionsSchema.optional().default({})
});

/**
 * Output schema for action extraction tool
 */
export const actionExtractionOutputSchema = z.object({
  actionItems: actionItemsSchema,
  metadata: z.object({
    totalExtracted: z.number().int().nonnegative(),
    averageConfidence: z.number().min(0).max(1).optional(),
    processingTimeMs: z.number().int().nonnegative()
  })
});

/**
 * Tool for extracting action items from meeting transcripts
 */
export class ActionExtractionTool extends BaseTool<
  typeof actionExtractionInputSchema,
  typeof actionExtractionOutputSchema
> {
  /**
   * Create a new action extraction tool
   */
  constructor(logger: Logger) {
    super(
      {
        name: 'action-extraction',
        description: 'Extracts action items from meeting transcripts',
        category: ToolCategory.MEETING_ANALYSIS,
        accessLevel: ToolAccessLevel.PUBLIC,
        version: '1.0.0',
        enabled: true,
        timeout: 30000, // 30 seconds
        cacheable: true,
        cacheExpiration: 24 * 60 * 60 * 1000, // 24 hours
        maxRetries: 2,
        fallbackToolName: 'basic-action-extraction'
      },
      actionExtractionInputSchema,
      actionExtractionOutputSchema,
      logger
    );
  }

  /**
   * Execute the action extraction
   */
  async execute(
    input: z.infer<typeof actionExtractionInputSchema>,
    context: any
  ) {
    const startTime = Date.now();
    const { transcript, options } = input;
    
    try {
      this.logger.info('Extracting action items from transcript', {
        meetingId: transcript.meetingId,
        utteranceCount: transcript.utterances.length,
        options
      });
      
      // Process the transcript to identify action items
      const actionItems = await this.extractActionItems(transcript, options);
      
      // Calculate metadata
      const totalExtracted = actionItems.length;
      const confidenceValues = actionItems
        .map(item => item.confidence)
        .filter(confidence => confidence !== undefined) as number[];
      
      const averageConfidence = confidenceValues.length > 0
        ? confidenceValues.reduce((sum, val) => sum + val, 0) / confidenceValues.length
        : undefined;
      
      const processingTimeMs = Date.now() - startTime;
      
      // Return the result
      return this.createSuccessResult(
        {
          actionItems,
          metadata: {
            totalExtracted,
            averageConfidence,
            processingTimeMs
          }
        },
        context
      );
    } catch (error) {
      this.logger.error('Error extracting action items', {
        meetingId: transcript.meetingId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      return this.createErrorResult(
        error instanceof Error ? error : new Error(String(error)),
        context
      );
    }
  }

  /**
   * Extract action items from transcript
   * This is the core logic of the tool
   */
  private async extractActionItems(
    transcript: z.infer<typeof transcriptSchema>,
    options: z.infer<typeof actionExtractionOptionsSchema>
  ) {
    // Get options with defaults
    const {
      minConfidence,
      assignParticipants,
      extractDueDates,
      prioritize,
      includeContext,
      maxActionItems
    } = options;
    
    // This is a placeholder implementation
    // In a real implementation, this would use LLM or other NLP techniques to extract action items
    const actionItems: z.infer<typeof actionItemsSchema> = [];
    
    // Simulate processing by iterating through utterances and looking for action-like statements
    const actionKeywords = ['will do', 'need to', 'should', 'must', 'going to', 'plan to', 'task', 'action item'];
    
    // Group utterances by speaker to maintain context
    const speakerUtterances = new Map<string, z.infer<typeof transcriptSchema>['utterances']>();
    
    for (const utterance of transcript.utterances) {
      if (!speakerUtterances.has(utterance.speakerId)) {
        speakerUtterances.set(utterance.speakerId, []);
      }
      speakerUtterances.get(utterance.speakerId)!.push(utterance);
    }
    
    // Process utterances to find action items
    for (const utterance of transcript.utterances) {
      // Skip short utterances
      if (utterance.text.length < 15) {
        continue;
      }
      
      // Check for action keywords
      const hasActionKeyword = actionKeywords.some(keyword => 
        utterance.text.toLowerCase().includes(keyword)
      );
      
      if (hasActionKeyword) {
        // Calculate a mock confidence score
        const confidence = Math.min(
          0.6 + (Math.random() * 0.3),
          1.0
        );
        
        // Only include if confidence is above threshold
        if (confidence >= minConfidence) {
          // Get participants mentioned in the utterance
          const assignedTo = assignParticipants
            ? this.findMentionedParticipants(utterance.text, transcript.participants)
            : undefined;
          
          // Extract mock due date if enabled
          const dueDate = extractDueDates
            ? this.extractDueDate(utterance.text)
            : undefined;
          
          // Assign mock priority if enabled
          const priority = prioritize
            ? this.assignPriority(utterance.text, confidence)
            : undefined;
          
          // Get context if enabled
          const context = includeContext
            ? this.getUtteranceContext(utterance, transcript.utterances)
            : undefined;
          
          // Create the action item
          actionItems.push({
            id: crypto.randomUUID(),
            text: this.extractActionText(utterance.text),
            assignedTo,
            dueDate,
            priority,
            status: 'pending',
            context,
            confidence,
            utteranceIds: [utterance.speakerId],
            startTime: utterance.startTime,
            endTime: utterance.endTime
          });
          
          // Stop if we've reached max items
          if (actionItems.length >= maxActionItems) {
            break;
          }
        }
      }
    }
    
    return actionItems;
  }

  /**
   * Extract clean action text from utterance
   */
  private extractActionText(text: string): string {
    // In a real implementation, this would use NLP to extract the core action
    // This is a simplified placeholder
    const actionKeywords = ['will do', 'need to', 'should', 'must', 'going to', 'plan to', 'task', 'action item'];
    
    let actionText = text;
    
    // Clean up the text to focus on the action
    for (const keyword of actionKeywords) {
      const index = actionText.toLowerCase().indexOf(keyword);
      if (index !== -1) {
        actionText = actionText.substring(index + keyword.length).trim();
        break;
      }
    }
    
    // Trim long action text
    if (actionText.length > 200) {
      actionText = actionText.substring(0, 197) + '...';
    }
    
    return actionText || text;
  }

  /**
   * Find mentioned participants in text
   */
  private findMentionedParticipants(
    text: string,
    participants: z.infer<typeof transcriptSchema>['participants']
  ): string[] {
    const mentionedIds: string[] = [];
    
    for (const participant of participants) {
      if (text.includes(participant.name)) {
        mentionedIds.push(participant.id);
      }
    }
    
    return mentionedIds;
  }

  /**
   * Extract due date from text
   */
  private extractDueDate(text: string): Date | undefined {
    // This is a placeholder implementation
    // In a real implementation, this would use NLP to identify date references
    const dateKeywords = ['tomorrow', 'next week', 'next month', 'by friday', 'end of'];
    
    const hasDateReference = dateKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );
    
    if (hasDateReference) {
      // Mock a due date between tomorrow and next month
      const now = new Date();
      const daysToAdd = Math.floor(Math.random() * 30) + 1;
      const dueDate = new Date(now);
      dueDate.setDate(now.getDate() + daysToAdd);
      return dueDate;
    }
    
    return undefined;
  }

  /**
   * Assign priority based on text and confidence
   */
  private assignPriority(
    text: string, 
    confidence: number
  ): z.infer<typeof actionItemsSchema>[0]['priority'] {
    // This is a placeholder implementation
    // In a real implementation, this would analyze text for urgency indicators
    
    const highPriorityKeywords = ['urgent', 'important', 'critical', 'ASAP'];
    const lowPriorityKeywords = ['eventually', 'when possible', 'nice to have'];
    
    const hasHighPriority = highPriorityKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );
    
    const hasLowPriority = lowPriorityKeywords.some(keyword => 
      text.toLowerCase().includes(keyword)
    );
    
    if (hasHighPriority || confidence > 0.9) {
      return 'high';
    } else if (hasLowPriority || confidence < 0.75) {
      return 'low';
    }
    
    return 'medium';
  }

  /**
   * Get surrounding context for an utterance
   */
  private getUtteranceContext(
    utterance: z.infer<typeof transcriptSchema>['utterances'][0],
    allUtterances: z.infer<typeof transcriptSchema>['utterances']
  ): string {
    // Find utterance index
    const index = allUtterances.findIndex(u => 
      u.speakerId === utterance.speakerId && 
      u.startTime.getTime() === utterance.startTime.getTime()
    );
    
    if (index === -1) {
      return utterance.text;
    }
    
    // Get one utterance before and after for context
    const start = Math.max(0, index - 1);
    const end = Math.min(allUtterances.length - 1, index + 1);
    
    // Combine the utterances
    const contextUtterances = allUtterances.slice(start, end + 1);
    const context = contextUtterances
      .map(u => `[${u.speakerId}]: ${u.text}`)
      .join(' ');
    
    return context;
  }
} 