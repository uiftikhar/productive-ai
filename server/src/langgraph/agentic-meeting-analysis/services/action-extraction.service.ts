/**
 * Action Item Extraction Service
 * 
 * Implements the ActionItemExtractionService interface to extract action items from meeting transcripts
 * Part of Milestone 3.2: Action Item Processing
 */

import { v4 as uuidv4 } from 'uuid';
import {
  ActionItem,
  ActionItemExtractionService,
  ActionItemPriority,
  ActionItemStatus,
  AssigneeInfo,
  TimeFrame,
  VerificationStatus
} from '../interfaces/action-items.interface';
import { Logger } from '../../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../../shared/logger/console-logger';
import { ChatOpenAI } from '@langchain/openai';
import { SystemRoleEnum } from '../../../shared/prompts/prompt-types';

export interface ActionItemExtractionOptions {
  logger?: Logger;
  llm?: ChatOpenAI;
  minConfidence?: number;
  considerImplicitTimeframes?: boolean;
  organizationalData?: any;
}

/**
 * Implementation of the ActionItemExtractionService interface
 */
export class ActionItemExtractionServiceImpl implements ActionItemExtractionService {
  private logger: Logger;
  private llm: ChatOpenAI;
  private minConfidence: number;
  private considerImplicitTimeframes: boolean;
  private organizationalData: any;

  constructor(options: ActionItemExtractionOptions = {}) {
    this.logger = options.logger || new ConsoleLogger();
    this.llm = options.llm || new ChatOpenAI();
    this.minConfidence = options.minConfidence || 0.7;
    this.considerImplicitTimeframes = options.considerImplicitTimeframes !== false;
    this.organizationalData = options.organizationalData || null;

    this.logger.info('ActionItemExtractionService initialized');
  }

  /**
   * Extract action items from meeting transcript
   */
  async extractActionItems(
    transcript: string,
    meetingId: string,
    meetingTitle: string,
    participantInfo?: any[]
  ): Promise<ActionItem[]> {
    this.logger.info(`Extracting action items from meeting: ${meetingId}`);

    try {
      // Extract raw action items from transcript
      const rawActionItems = await this.extractRawActionItems(transcript);

      // Enrich with additional information
      const actionItems: ActionItem[] = [];
      
      for (const raw of rawActionItems) {
        const timeFrames = await this.extractTimeFrames(raw.context || raw.description);
        const priority = await this.detectPriority(raw.description, raw.context);
        const assignees = await this.detectAssignees(
          raw.description,
          participantInfo,
          this.organizationalData
        );

        // Create structured action item
        const actionItem: ActionItem = {
          id: `action-${uuidv4()}`,
          description: raw.description,
          meetingId,
          meetingTitle,
          createdAt: new Date(),
          updatedAt: new Date(),
          topicId: raw.topicId,
          topicTitle: raw.topicName,
          relatedDecisionId: raw.decisionId,
          assignees: assignees.length > 0 ? assignees : [
            {
              name: 'Unassigned',
              confidence: 0,
              detectionMethod: 'implied',
              verificationStatus: VerificationStatus.NEEDS_REVIEW
            }
          ],
          priority: priority.priority,
          priorityRationale: priority.rationale,
          status: ActionItemStatus.PENDING,
          deadline: timeFrames.length > 0 ? timeFrames[0] : undefined,
          verificationStatus: VerificationStatus.UNVERIFIED,
          extractionConfidence: raw.confidence || 0.8
        };

        actionItems.push(actionItem);
      }

      // Validate extracted action items
      const { validatedItems } = await this.validateActionItems(actionItems);
      
      return validatedItems;
    } catch (error) {
      this.logger.error(`Error extracting action items: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Extract initial raw action items from transcript
   */
  private async extractRawActionItems(transcript: string): Promise<any[]> {
    const prompt = `
      Analyze the meeting transcript below and extract all action items, tasks, or commitments made during the meeting.

      For each action item, identify:
      1. Description: What needs to be done?
      2. Context: The discussion context around the action item
      3. Decision: Was this action item derived from a decision?
      4. Topic: What topic or agenda item is this related to?
      5. Confidence: How confident are you this is an action item (0.0-1.0)

      MEETING TRANSCRIPT:
      ${transcript}

      Format your response as a JSON array of action items.
      [
        {
          "description": "Clear action item description",
          "context": "Relevant part of transcript that contains this action item",
          "decisionId": null or "ID if this came from a decision",
          "topicId": null or "relevant topic ID",
          "topicName": "Topic name if known",
          "confidence": 0.0-1.0
        },
        ...
      ]
    `;

    try {
      const result = await this.llm.invoke([
        {
          role: 'system',
          content: `You are an AI specialized in extracting action items from meeting transcripts. Be thorough and detailed, looking for explicit and implied tasks.`
        },
        {
          role: 'user',
          content: prompt
        }
      ]);

      const content = result.content as string;
      const jsonStart = content.indexOf('[');
      const jsonEnd = content.lastIndexOf(']') + 1;
      
      if (jsonStart === -1 || jsonEnd === -1) {
        throw new Error('Could not find JSON array in response');
      }
      
      const jsonString = content.substring(jsonStart, jsonEnd);
      const rawItems = JSON.parse(jsonString);
      
      // Filter items with confidence above threshold
      return rawItems.filter((item: any) => item.confidence >= this.minConfidence);
    } catch (error) {
      this.logger.error(`Error in extractRawActionItems: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Extract timeframes from text
   */
  async extractTimeFrames(text: string, baseDate?: Date): Promise<TimeFrame[]> {
    const base = baseDate || new Date();
    const baseString = base.toISOString().split('T')[0];
    
    const prompt = `
      Extract any deadlines, due dates, or timeframes from the text below.
      Today's date is ${baseString}.

      TEXT:
      ${text}

      For each timeframe found, identify:
      1. Type: Whether it's an absolute date or relative timeframe
      2. Date: For absolute dates, convert to YYYY-MM-DD format
      3. Relative value and unit: For relative timeframes (e.g., "in 2 weeks")
      4. Time: Any specific time mentioned (HH:MM format)
      5. Confidence: How confident you are in the extraction (0.0-1.0)
      6. Original text: The exact text that indicates the timeframe

      If the text contains implicit timeframes like "urgent", "ASAP", "immediately", interpret them as relative timeframes.

      Return your findings as a JSON array:
      [
        {
          "type": "absolute" or "relative",
          "date": "YYYY-MM-DD" or null,
          "relativeValue": number or null,
          "relativeUnit": "day", "week", "month" or null,
          "time": "HH:MM" or null,
          "confidence": 0.0-1.0,
          "originalText": "text snippet"
        },
        ...
      ]
      
      If no timeframes are found, return an empty array.
    `;

    try {
      const result = await this.llm.invoke([
        {
          role: 'system',
          content: `You are an AI specialized in extracting and normalizing date and time information from text.`
        },
        {
          role: 'user',
          content: prompt
        }
      ]);

      const content = result.content as string;
      const jsonStart = content.indexOf('[');
      const jsonEnd = content.lastIndexOf(']') + 1;
      
      if (jsonStart === -1 || jsonEnd === -1 || content.trim() === '[]') {
        return [];
      }
      
      const jsonString = content.substring(jsonStart, jsonEnd);
      const extractedTimeframes = JSON.parse(jsonString);
      
      // Convert to TimeFrame interface and add verification status
      return extractedTimeframes
        .filter((tf: any) => tf.confidence >= this.minConfidence)
        .map((tf: any) => ({
          ...tf,
          verificationStatus: VerificationStatus.UNVERIFIED
        }));
    } catch (error) {
      this.logger.error(`Error extracting timeframes: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Detect priority signals from text
   */
  async detectPriority(text: string, context?: string): Promise<{
    priority: ActionItemPriority;
    confidence: number;
    rationale: string;
  }> {
    const combinedText = context ? `${text}\n\nContext: ${context}` : text;
    
    const prompt = `
      Analyze the following text and determine the priority level of the action item or task described.

      TEXT:
      ${combinedText}

      Classify the priority as one of:
      - CRITICAL: Urgent tasks that must be completed immediately, often blocking other work
      - HIGH: Important tasks that should be prioritized above normal work
      - MEDIUM: Standard priority tasks that should be completed in a timely manner
      - LOW: Tasks that can be completed when time permits

      Look for signals like:
      - Explicit priority indicators ("urgent", "ASAP", "critical", "high priority")
      - Timeframe urgency ("by tomorrow", "immediately", "by end of day")
      - Impact language ("blocking", "essential", "required for launch")
      - Executive emphasis (CEO or leadership stressing importance)

      Return your analysis as a JSON object:
      {
        "priority": "CRITICAL", "HIGH", "MEDIUM", or "LOW",
        "confidence": 0.0-1.0,
        "rationale": "Brief explanation for this priority assessment"
      }
    `;

    try {
      const result = await this.llm.invoke([
        {
          role: 'system',
          content: `You are an AI specialized in analyzing text to determine task priority levels.`
        },
        {
          role: 'user',
          content: prompt
        }
      ]);

      const content = result.content as string;
      const jsonStart = content.indexOf('{');
      const jsonEnd = content.lastIndexOf('}') + 1;
      
      if (jsonStart === -1 || jsonEnd === -1) {
        // Default to MEDIUM if extraction fails
        return { 
          priority: ActionItemPriority.MEDIUM, 
          confidence: 0.5, 
          rationale: "Default priority assigned due to extraction failure" 
        };
      }
      
      const jsonString = content.substring(jsonStart, jsonEnd);
      const priorityData = JSON.parse(jsonString);
      
      // Convert string priority to enum
      let priority: ActionItemPriority;
      switch (priorityData.priority?.toUpperCase()) {
        case 'CRITICAL':
          priority = ActionItemPriority.CRITICAL;
          break;
        case 'HIGH':
          priority = ActionItemPriority.HIGH;
          break;
        case 'LOW':
          priority = ActionItemPriority.LOW;
          break;
        case 'MEDIUM':
        default:
          priority = ActionItemPriority.MEDIUM;
      }
      
      return {
        priority,
        confidence: priorityData.confidence || 0.7,
        rationale: priorityData.rationale || "No rationale provided"
      };
    } catch (error) {
      this.logger.error(`Error detecting priority: ${error instanceof Error ? error.message : String(error)}`);
      // Default to MEDIUM if extraction fails
      return { 
        priority: ActionItemPriority.MEDIUM, 
        confidence: 0.5, 
        rationale: "Default priority assigned due to extraction error" 
      };
    }
  }

  /**
   * Detect assignees from text
   */
  async detectAssignees(
    text: string,
    participantInfo?: any[],
    organizationData?: any
  ): Promise<AssigneeInfo[]> {
    // Build context for assignee detection
    let participantsContext = '';
    if (participantInfo && participantInfo.length > 0) {
      participantsContext = `
      MEETING PARTICIPANTS:
      ${participantInfo.map(p => `- ${p.name}${p.role ? ` (${p.role})` : ''}`).join('\n')}
      `;
    }

    let orgDataContext = '';
    if (organizationData) {
      orgDataContext = `
      ORGANIZATIONAL STRUCTURE:
      ${JSON.stringify(organizationData, null, 2)}
      `;
    }

    const prompt = `
      Analyze the following text and identify who is assigned to the task or action item described.

      TEXT:
      ${text}

      ${participantsContext}
      ${orgDataContext}

      For each assignee found, identify:
      1. Name: The person's name
      2. Role: Their role or department (if available)
      3. ID: Person identifier (if available)
      4. Confidence: How confident you are in this assignment (0.0-1.0)
      5. Detection method: How the assignee was determined (direct_mention, implied, role_based, org_structure)

      Consider:
      - Explicit assignments ("John will do this", "Sarah to complete by Friday")
      - First-person commitments ("I'll handle this", "Let me take care of it")
      - Implied assignments based on roles or expertise
      - Team assignments ("The engineering team will implement this")

      Return your findings as a JSON array:
      [
        {
          "name": "Person's name",
          "role": "Their role or department" or null,
          "id": "Person ID if available" or null,
          "confidence": 0.0-1.0,
          "detectionMethod": "direct_mention", "implied", "role_based", or "org_structure"
        },
        ...
      ]
      
      If no assignees are found, return an empty array.
    `;

    try {
      const result = await this.llm.invoke([
        {
          role: 'system',
          content: `You are an AI specialized in analyzing text to detect who is assigned to tasks.`
        },
        {
          role: 'user',
          content: prompt
        }
      ]);

      const content = result.content as string;
      const jsonStart = content.indexOf('[');
      const jsonEnd = content.lastIndexOf(']') + 1;
      
      if (jsonStart === -1 || jsonEnd === -1 || content.trim() === '[]') {
        return [];
      }
      
      const jsonString = content.substring(jsonStart, jsonEnd);
      const extractedAssignees = JSON.parse(jsonString);
      
      // Filter by confidence and convert to AssigneeInfo interface
      return extractedAssignees
        .filter((assignee: any) => assignee.confidence >= this.minConfidence)
        .map((assignee: any) => ({
          ...assignee,
          verificationStatus: VerificationStatus.UNVERIFIED
        }));
    } catch (error) {
      this.logger.error(`Error detecting assignees: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Validate detected action items
   */
  async validateActionItems(actionItems: ActionItem[]): Promise<{
    validatedItems: ActionItem[];
    issuesFound: { itemId: string; issueType: string; description: string }[];
  }> {
    const issues: { itemId: string; issueType: string; description: string }[] = [];
    const validatedItems: ActionItem[] = [];

    for (const item of actionItems) {
      let isValid = true;
      
      // Validate description
      if (!item.description || item.description.trim().length < 5) {
        issues.push({
          itemId: item.id,
          issueType: 'invalid_description',
          description: 'Action item description is too short or empty'
        });
        isValid = false;
      }
      
      // Validate assignees
      if (!item.assignees || item.assignees.length === 0) {
        issues.push({
          itemId: item.id,
          issueType: 'missing_assignee',
          description: 'No assignees detected for this action item'
        });
        // Not marking as invalid - we'll keep items without assignees
      }
      
      // Validate deadline (if present)
      if (item.deadline) {
        if (item.deadline.type === 'absolute' && !item.deadline.date) {
          issues.push({
            itemId: item.id,
            issueType: 'invalid_deadline',
            description: 'Absolute deadline missing date information'
          });
          // Fix by setting to null
          item.deadline = undefined;
        } else if (item.deadline.type === 'relative' && 
                  (!item.deadline.relativeValue || !item.deadline.relativeUnit)) {
          issues.push({
            itemId: item.id,
            issueType: 'invalid_relative_deadline',
            description: 'Relative deadline missing value or unit'
          });
          // Fix by setting to null
          item.deadline = undefined;
        }
      }
      
      // Add to valid items if it passed validation
      if (isValid) {
        validatedItems.push(item);
      }
    }
    
    return { validatedItems, issuesFound: issues };
  }
} 