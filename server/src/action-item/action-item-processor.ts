import { MeetingContextService } from '../shared/services/user-context/meeting-context.service';
import { OpenAIConnector } from '../connectors/openai-connector';
import { ConsoleLogger } from '../shared/logger/console-logger';
import { Logger } from '../shared/logger/logger.interface';
import { v4 as uuidv4 } from 'uuid';

/**
 * Priority levels for action items
 */
export enum ActionItemPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Status options for action items
 */
export enum ActionItemStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  BLOCKED = 'blocked',
  DEFERRED = 'deferred',
  CANCELLED = 'cancelled'
}

/**
 * Interface for extracted action items
 */
export interface ExtractedActionItem {
  id: string;
  content: string;
  assignee?: string;
  deadline?: Date | null;
  priority?: ActionItemPriority;
  status: ActionItemStatus;
  confidence: number; // 0-1 score indicating extraction confidence
  context?: string; // The surrounding context from the transcript
  tags?: string[];
  meetingId: string;
  extractionMethod: 'rule-based' | 'llm' | 'hybrid';
  verificationStatus: 'unverified' | 'verified' | 'rejected';
}

/**
 * NLP pattern for deadline extraction
 */
interface DeadlinePattern {
  regex: RegExp;
  handler: (matches: RegExpMatchArray, baseDate: Date) => Date | null;
}

/**
 * Action Item Processor class
 * Uses NLP and LLM to extract and process action items from meeting transcripts
 */
export class ActionItemProcessor {
  private meetingService: MeetingContextService;
  private logger: Logger;
  private llmConnector: OpenAIConnector;
  private deadlinePatterns: DeadlinePattern[];

  constructor(options: {
    meetingService?: MeetingContextService;
    logger?: Logger;
    llmConnector?: OpenAIConnector;
  } = {}) {
    this.meetingService = options.meetingService || new MeetingContextService();
    this.logger = options.logger || new ConsoleLogger();
    this.llmConnector = options.llmConnector || new OpenAIConnector();
    
    // Initialize deadline extraction patterns
    this.deadlinePatterns = this.initializeDeadlinePatterns();
    
    this.logger.info('ActionItemProcessor initialized');
  }

  /**
   * Initialize NLP patterns for deadline extraction
   */
  private initializeDeadlinePatterns(): DeadlinePattern[] {
    return [
      // Specific date pattern (e.g., "by January 15th", "due on 3/15/2023")
      {
        regex: /(?:by|due|on|before)\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s*,?\s*(\d{4}))?/i,
        handler: (matches, baseDate) => {
          const month = this.parseMonth(matches[1]);
          const day = parseInt(matches[2], 10);
          const year = matches[3] ? parseInt(matches[3], 10) : baseDate.getFullYear();
          
          // If the resulting date is in the past, assume next year
          const date = new Date(year, month, day);
          if (date.getTime() < baseDate.getTime()) {
            date.setFullYear(date.getFullYear() + 1);
          }
          
          return date;
        }
      },
      
      // Relative day pattern (e.g., "by tomorrow", "by next Friday")
      {
        regex: /(?:by|due|on|before)\s+(?:this|next|coming)?\s*(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i,
        handler: (matches, baseDate) => {
          const daySpecifier = matches[1].toLowerCase();
          const targetDate = new Date(baseDate);
          
          if (daySpecifier === 'today') {
            return targetDate;
          }
          
          if (daySpecifier === 'tomorrow') {
            targetDate.setDate(targetDate.getDate() + 1);
            return targetDate;
          }
          
          // Handle days of the week
          const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const targetDay = daysOfWeek.indexOf(daySpecifier);
          const currentDay = baseDate.getDay();
          let daysToAdd = targetDay - currentDay;
          
          // If the target day is earlier in the week or the same day, go to next week
          if (matches[0].toLowerCase().includes('next') || daysToAdd <= 0) {
            daysToAdd += 7;
          }
          
          targetDate.setDate(targetDate.getDate() + daysToAdd);
          return targetDate;
        }
      },
      
      // Timeframe pattern (e.g., "within 2 weeks", "in 3 days")
      {
        regex: /(?:within|in)\s+(\d+)\s+(day|days|week|weeks|month|months)/i,
        handler: (matches, baseDate) => {
          const amount = parseInt(matches[1], 10);
          const unit = matches[2].toLowerCase();
          const targetDate = new Date(baseDate);
          
          if (unit.startsWith('day')) {
            targetDate.setDate(targetDate.getDate() + amount);
          } else if (unit.startsWith('week')) {
            targetDate.setDate(targetDate.getDate() + (amount * 7));
          } else if (unit.startsWith('month')) {
            targetDate.setMonth(targetDate.getMonth() + amount);
          }
          
          return targetDate;
        }
      },
      
      // End of timeframe pattern (e.g., "by end of week", "end of month")
      {
        regex: /(?:by|before|due|at)\s+(?:the\s+)?end\s+of\s+(this|the|next)?\s*(day|week|month|quarter|year)/i,
        handler: (matches, baseDate) => {
          const modifier = matches[1]?.toLowerCase() || 'this';
          const unit = matches[2].toLowerCase();
          const targetDate = new Date(baseDate);
          
          // Calculate offset based on modifier
          const offset = modifier === 'next' ? 1 : 0;
          
          if (unit === 'day') {
            targetDate.setHours(23, 59, 59, 999);
            if (offset > 0) {
              targetDate.setDate(targetDate.getDate() + offset);
            }
          } else if (unit === 'week') {
            // Go to end of the week (Saturday)
            const dayOfWeek = targetDate.getDay();
            const daysToEndOfWeek = 6 - dayOfWeek;
            targetDate.setDate(targetDate.getDate() + daysToEndOfWeek + (offset * 7));
            targetDate.setHours(23, 59, 59, 999);
          } else if (unit === 'month') {
            targetDate.setMonth(targetDate.getMonth() + 1 + offset, 0); // Go to last day of month
            targetDate.setHours(23, 59, 59, 999);
          } else if (unit === 'quarter') {
            const currentMonth = targetDate.getMonth();
            const currentQuarter = Math.floor(currentMonth / 3);
            const lastMonthOfQuarter = (currentQuarter + offset + 1) * 3 - 1;
            targetDate.setMonth(lastMonthOfQuarter + 1, 0); // Last day of the quarter
            targetDate.setHours(23, 59, 59, 999);
          } else if (unit === 'year') {
            targetDate.setFullYear(targetDate.getFullYear() + offset, 11, 31);
            targetDate.setHours(23, 59, 59, 999);
          }
          
          return targetDate;
        }
      }
    ];
  }

  /**
   * Helper method to parse month names to month numbers (0-11)
   */
  private parseMonth(monthStr: string): number {
    const monthMap: {[key: string]: number} = {
      'jan': 0, 'january': 0,
      'feb': 1, 'february': 1,
      'mar': 2, 'march': 2,
      'apr': 3, 'april': 3,
      'may': 4,
      'jun': 5, 'june': 5,
      'jul': 6, 'july': 6,
      'aug': 7, 'august': 7, 
      'sep': 8, 'september': 8,
      'oct': 9, 'october': 9,
      'nov': 10, 'november': 10,
      'dec': 11, 'december': 11
    };
    
    return monthMap[monthStr.toLowerCase()] || 0;
  }

  /**
   * Extract action items from a meeting transcript using NLP patterns
   * @param userId User identifier
   * @param meetingId Meeting identifier
   * @param transcript The meeting transcript
   * @param meetingDate Date when the meeting occurred
   * @returns Array of extracted action items
   */
  async extractActionItems(
    userId: string,
    meetingId: string,
    transcript: string,
    meetingDate: Date = new Date()
  ): Promise<ExtractedActionItem[]> {
    this.logger.info(`Extracting action items for meeting ${meetingId}`);
    
    try {
      // Use both rule-based and LLM-based extraction
      const [ruleBasedItems, llmBasedItems] = await Promise.all([
        this.extractActionItemsRuleBased(transcript, meetingId, meetingDate),
        this.extractActionItemsWithLLM(transcript, meetingId, meetingDate)
      ]);
      
      // Combine results, removing duplicates
      const combinedItems = this.mergeAndDeduplicate(ruleBasedItems, llmBasedItems);
      
      // Store the extracted items using the meeting service
      await this.storeActionItems(userId, meetingId, combinedItems);
      
      return combinedItems;
    } catch (error) {
      this.logger.error(`Error extracting action items: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Extract action items using rule-based patterns
   */
  private async extractActionItemsRuleBased(
    transcript: string,
    meetingId: string,
    meetingDate: Date
  ): Promise<ExtractedActionItem[]> {
    const actionItems: ExtractedActionItem[] = [];
    
    // Common action item indicators
    const actionPhrasePatterns = [
      /(?:action item|task|to-?do|assignment)(?:\s+for\s+(\w+))?:?\s*(.*?)(?:\.|$)/i,
      /(\w+)\s+(?:to|will|should|needs? to|is going to)\s+(.*?)(?:\.|$)/i,
      /(\w+)\s+(?:is responsible for|is assigned to|agreed to)\s+(.*?)(?:\.|$)/i,
      /let's\s+(\w+)\s+(.*?)(?:\.|$)/i,
      /(\w+),\s+(?:please|could you)\s+(.*?)(?:\.|$)/i
    ];
    
    // Split transcript into lines or segments
    const lines = transcript.split(/[\n.?!]+/);
    
    for (const line of lines) {
      for (const pattern of actionPhrasePatterns) {
        const matches = line.match(pattern);
        if (matches) {
          const possibleAssignee = matches[1] || '';
          const actionContent = matches[2]?.trim() || matches[0]?.trim() || '';
          
          if (actionContent.length < 3) continue; // Skip very short matches
          
          // Extract deadline from the content
          const { content, deadline } = this.extractDeadline(actionContent, meetingDate);
          
          // Extract priority signals
          const priority = this.extractPriority(line);
          
          actionItems.push({
            id: uuidv4(),
            content,
            assignee: possibleAssignee.length > 1 ? possibleAssignee : undefined,
            deadline,
            priority,
            status: ActionItemStatus.PENDING,
            confidence: 0.7, // Rule-based confidence is moderate
            context: line.trim(),
            meetingId,
            extractionMethod: 'rule-based',
            verificationStatus: 'unverified'
          });
          
          break; // Stop checking patterns once we find a match
        }
      }
    }
    
    return actionItems;
  }

  /**
   * Extract action items using LLM (OpenAI)
   */
  private async extractActionItemsWithLLM(
    transcript: string,
    meetingId: string,
    meetingDate: Date
  ): Promise<ExtractedActionItem[]> {
    // Create a prompt that asks the LLM to extract action items
    const prompt = `
    Please extract all action items from the following meeting transcript. For each action item, identify:
    1. The action to be taken
    2. The person assigned to the action (if specified)
    3. The deadline or due date (if specified)
    4. The priority level (if indicated)
    
    Format your response as a valid JSON array with objects having these properties:
    - content: The action item description
    - assignee: The person assigned to the task (or null if unspecified)
    - deadline: The due date in YYYY-MM-DD format (or null if unspecified)
    - priority: One of "low", "medium", "high", "critical" (or null if unspecified)
    - context: The sentence or context where this action item was mentioned
    
    Meeting transcript:
    ${transcript}
    `;
    
    try {
      const response = await this.llmConnector.generateChatCompletion([
        {
          role: 'user',
          content: prompt
        }
      ]);
      
      // Parse the JSON response
      let extractedItems: any[] = [];
      try {
        // Find JSON array in the response (it might be surrounded by other text)
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          extractedItems = JSON.parse(jsonMatch[0]);
        } else {
          this.logger.warn('Could not find JSON array in LLM response');
          return [];
        }
      } catch (parseError) {
        this.logger.error(`Error parsing LLM response: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`);
        return [];
      }
      
      // Convert to our ExtractedActionItem format
      return extractedItems.map(item => {
        // Parse deadline if it exists
        let deadlineDate: Date | null = null;
        if (item.deadline) {
          try {
            deadlineDate = new Date(item.deadline);
          } catch (e) {
            // Invalid date format, leave as null
          }
        }
        
        // Map priority to our enum
        let priority: ActionItemPriority | undefined;
        if (item.priority) {
          switch (item.priority.toLowerCase()) {
            case 'low': priority = ActionItemPriority.LOW; break;
            case 'medium': priority = ActionItemPriority.MEDIUM; break;
            case 'high': priority = ActionItemPriority.HIGH; break;
            case 'critical': priority = ActionItemPriority.CRITICAL; break;
            default: priority = undefined;
          }
        }
        
        return {
          id: uuidv4(),
          content: item.content || '',
          assignee: item.assignee || undefined,
          deadline: deadlineDate,
          priority,
          status: ActionItemStatus.PENDING,
          confidence: 0.85, // LLM confidence is generally higher
          context: item.context || '',
          meetingId,
          extractionMethod: 'llm',
          verificationStatus: 'unverified'
        };
      });
    } catch (error) {
      this.logger.error(`Error in LLM extraction: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  /**
   * Extract deadline from action item content
   */
  private extractDeadline(content: string, baseDate: Date): { content: string, deadline: Date | null } {
    for (const pattern of this.deadlinePatterns) {
      const matches = content.match(pattern.regex);
      if (matches) {
        try {
          const deadline = pattern.handler(matches, baseDate);
          // Remove the deadline text from the content
          const cleanedContent = content.replace(matches[0], '').trim();
          return { content: cleanedContent, deadline };
        } catch (e) {
          // If date parsing fails, continue to next pattern
        }
      }
    }
    
    return { content, deadline: null };
  }

  /**
   * Extract priority level from text based on keywords and phrases
   */
  private extractPriority(text: string): ActionItemPriority | undefined {
    const lowerText = text.toLowerCase();
    
    // Critical priority indicators
    if (/(urgent|critical|asap|emergency|highest priority|immediately|right away|top priority)/i.test(lowerText)) {
      return ActionItemPriority.CRITICAL;
    }
    
    // High priority indicators
    if (/(high priority|important|pressing|significant|crucial)/i.test(lowerText)) {
      return ActionItemPriority.HIGH;
    }
    
    // Low priority indicators
    if (/(low priority|whenever possible|when you have time|not urgent|if time permits)/i.test(lowerText)) {
      return ActionItemPriority.LOW;
    }
    
    // If no clear indicators, default to medium priority when specific indicators are present
    if (/(should|need to|have to|must)/i.test(lowerText)) {
      return ActionItemPriority.MEDIUM;
    }
    
    // Default is undefined (no explicit priority detected)
    return undefined;
  }

  /**
   * Merge and deduplicate action items from multiple sources
   */
  private mergeAndDeduplicate(
    ruleBasedItems: ExtractedActionItem[],
    llmBasedItems: ExtractedActionItem[]
  ): ExtractedActionItem[] {
    const allItems = [...ruleBasedItems];
    
    // Add LLM items that don't look like duplicates
    for (const llmItem of llmBasedItems) {
      // Check if this item might be a duplicate of any existing item
      const isDuplicate = allItems.some(existingItem => {
        // Check for significant content overlap
        const normalizedExisting = existingItem.content.toLowerCase().replace(/\s+/g, ' ');
        const normalizedLlm = llmItem.content.toLowerCase().replace(/\s+/g, ' ');
        
        return (
          // Either very similar content
          normalizedExisting.includes(normalizedLlm) ||
          normalizedLlm.includes(normalizedExisting) ||
          // Or same assignee and similar deadline
          (existingItem.assignee === llmItem.assignee && 
           existingItem.assignee !== undefined &&
           this.areSimilarDates(existingItem.deadline, llmItem.deadline))
        );
      });
      
      if (!isDuplicate) {
        allItems.push(llmItem);
      }
    }
    
    // Set hybrid extraction method for items detected by both methods
    return allItems.map(item => {
      // Calculate extraction confidence based on consistent information across sources
      const matchingLlmItems = llmBasedItems.filter(llmItem => 
        llmItem.content.toLowerCase().includes(item.content.toLowerCase()) || 
        item.content.toLowerCase().includes(llmItem.content.toLowerCase())
      );
      
      if (matchingLlmItems.length > 0 && item.extractionMethod === 'rule-based') {
        // This is a hybrid-detected item, boost confidence and merge info
        const matchingLlm = matchingLlmItems[0];
        return {
          ...item,
          confidence: Math.min(0.95, item.confidence + 0.15),
          extractionMethod: 'hybrid',
          // Prefer LLM extracted assignee and deadline if available
          assignee: matchingLlm.assignee || item.assignee,
          deadline: matchingLlm.deadline || item.deadline,
          priority: matchingLlm.priority || item.priority
        };
      }
      
      return item;
    });
  }

  /**
   * Compare two dates to see if they're similar (within 24 hours)
   */
  private areSimilarDates(date1: Date | null | undefined, date2: Date | null | undefined): boolean {
    if (!date1 || !date2) return false;
    
    const diff = Math.abs(date1.getTime() - date2.getTime());
    return diff <= 24 * 60 * 60 * 1000; // Within 24 hours
  }

  /**
   * Store extracted action items using the meeting service
   */
  private async storeActionItems(
    userId: string,
    meetingId: string,
    actionItems: ExtractedActionItem[]
  ): Promise<void> {
    // Use a simple embedding placeholder, as we're mainly concerned with metadata storage
    const defaultEmbedding = Array(1536).fill(0);
    
    for (const item of actionItems) {
      try {
        // Convert deadline to timestamp
        const dueDate = item.deadline ? item.deadline.getTime() : null;
        
        await this.meetingService.storeActionItem(
          userId,
          meetingId,
          item.id,
          item.content,
          item.assignee || 'unassigned',
          dueDate,
          defaultEmbedding,
          {
            priority: item.priority,
            confidence: item.confidence,
            extractionMethod: item.extractionMethod,
            verificationStatus: item.verificationStatus,
            context: item.context,
            tags: item.tags
          }
        );
      } catch (error) {
        this.logger.error(`Error storing action item ${item.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        // Continue with next item
      }
    }
  }

  /**
   * Validate action items and resolve assignees with organizational data
   */
  async validateActionItems(
    userId: string,
    meetingId: string,
    actionItems: ExtractedActionItem[],
    organizationalData?: any
  ): Promise<ExtractedActionItem[]> {
    // This is a simplified version - in a real implementation, we'd:
    // 1. Verify action items with LLM to check if they're actually tasks
    // 2. Match partial or ambiguous assignee names with org data
    // 3. Validate deadlines against organizational calendars
    // 4. Check for conflicts/duplicates
    
    return actionItems.map(item => ({
      ...item,
      verificationStatus: 'verified'
    }));
  }
} 