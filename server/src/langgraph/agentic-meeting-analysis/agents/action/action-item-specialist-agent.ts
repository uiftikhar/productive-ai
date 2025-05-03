/**
 * Action Item Specialist Agent for the Agentic Meeting Analysis System
 */
import { v4 as uuidv4 } from 'uuid';
import { 
  ISpecialistAnalysisAgent,
  AgentExpertise,
  AgentOutput,
  AnalysisGoalType,
  AnalysisTask,
  AnalysisTaskStatus,
  ConfidenceLevel,
  MessageType
} from '../../interfaces/agent.interface';
import { MeetingTranscript } from '../../interfaces/state.interface';
import { BaseMeetingAnalysisAgent } from '../base-meeting-analysis-agent';
import { Logger } from '../../../../shared/logger/logger.interface';
import { ChatOpenAI } from '@langchain/openai';
import { InstructionTemplateNameEnum } from '../../../../shared/prompts/instruction-templates';
import { RagPromptManager, RagRetrievalStrategy } from '../../../../shared/services/rag-prompt-manager.service';
import { SystemRoleEnum } from '../../../../shared/prompts/prompt-types';

/**
 * Configuration options for ActionItemSpecialistAgent
 */
export interface ActionItemSpecialistAgentConfig {
  id?: string;
  name?: string;
  logger?: Logger;
  llm?: ChatOpenAI;
  systemPrompt?: string;
  minConfidence?: number;
  enableDeadlineExtraction?: boolean;
  enablePriorityAssessment?: boolean;
  enableTopicLinking?: boolean;
  checkPreviousMeetings?: boolean;
}

/**
 * Implementation of the Action Item Specialist Agent
 * This agent is responsible for:
 * - Detecting explicit and implicit action items in transcripts
 * - Extracting ownership/assignee information
 * - Determining deadlines and priorities
 * - Linking actions to discussion topics
 * - Detecting follow-ups from previous meetings
 */
export class ActionItemSpecialistAgent extends BaseMeetingAnalysisAgent implements ISpecialistAnalysisAgent {
  private minConfidence: number;
  private enableDeadlineExtraction: boolean;
  private enablePriorityAssessment: boolean;
  private enableTopicLinking: boolean;
  private checkPreviousMeetings: boolean;
  
  /**
   * Create a new Action Item Specialist Agent
   */
  constructor(config: ActionItemSpecialistAgentConfig) {
    super({
      id: config.id,
      name: config.name || 'Action Item Specialist',
      expertise: [AgentExpertise.ACTION_ITEM_EXTRACTION],
      capabilities: [AnalysisGoalType.EXTRACT_ACTION_ITEMS],
      logger: config.logger,
      llm: config.llm,
      systemPrompt: config.systemPrompt
    });
    
    this.minConfidence = config.minConfidence || 0.6;
    this.enableDeadlineExtraction = config.enableDeadlineExtraction !== false;
    this.enablePriorityAssessment = config.enablePriorityAssessment !== false;
    this.enableTopicLinking = config.enableTopicLinking !== false;
    this.checkPreviousMeetings = config.checkPreviousMeetings || false;
    
    this.logger.info(`Initialized ${this.name} with features: deadlines=${this.enableDeadlineExtraction}, priorities=${this.enablePriorityAssessment}`);
  }
  
  /**
   * Initialize the action item specialist agent
   */
  async initialize(config?: Record<string, any>): Promise<void> {
    await super.initialize(config);
    
    // Register with coordinator
    await this.registerWithCoordinator();
    
    this.logger.info(`${this.name} initialized and registered with coordinator`);
  }
  
  /**
   * Register this agent with the analysis coordinator
   */
  private async registerWithCoordinator(): Promise<void> {
    const registrationMessage = this.createMessage(
      MessageType.NOTIFICATION,
      ['coordinator'],
      {
        messageType: 'AGENT_REGISTRATION',
        agentId: this.id,
        name: this.name,
        expertise: this.expertise,
        capabilities: Array.from(this.capabilities)
      }
    );
    
    await this.sendMessage(registrationMessage);
  }
  
  /**
   * Process an action item extraction task
   */
  async processTask(task: AnalysisTask): Promise<AgentOutput> {
    this.logger.info(`Processing action item extraction task: ${task.id}`);
    
    if (task.type !== AnalysisGoalType.EXTRACT_ACTION_ITEMS) {
      throw new Error(`Action Item Specialist cannot process task type: ${task.type}`);
    }
    
    try {
      // Get transcript data
      const transcript = await this.readMemory('transcript', 'meeting');
      const metadata = await this.readMemory('metadata', 'meeting');
      
      if (!transcript) {
        throw new Error('Meeting transcript not found in memory');
      }
      
      // Get topics if we need to link action items to them
      let topics = null;
      if (this.enableTopicLinking) {
        const topicsData = await this.readMemory('analysis.topics', 'meeting');
        topics = topicsData?.topics || null;
      }
      
      // Get previous action items if we need to check for follow-ups
      let previousActionItems = null;
      if (this.checkPreviousMeetings) {
        const previousData = await this.readMemory('previous.actionItems', 'meeting');
        previousActionItems = previousData || null;
      }
      
      // Initial action item extraction
      const actionItems = await this.extractActionItems(transcript, metadata);
      
      // Enhance with deadlines and priorities if enabled
      if (this.enableDeadlineExtraction) {
        await this.extractDeadlines(actionItems, transcript);
      }
      
      if (this.enablePriorityAssessment) {
        await this.assessPriorities(actionItems, transcript);
      }
      
      // Link action items to topics if enabled and topics are available
      if (this.enableTopicLinking && topics) {
        await this.linkActionItemsToTopics(actionItems, topics, transcript);
      }
      
      // Check for follow-ups from previous meetings if enabled
      if (this.checkPreviousMeetings && previousActionItems) {
        await this.detectFollowUps(actionItems, previousActionItems);
      }
      
      // Create complete action items analysis
      const actionItemAnalysis = {
        actionItems,
        metadata: {
          extractionTime: Date.now(),
          totalItems: actionItems.length,
          withDeadlines: actionItems.filter(item => !!item.dueDate).length,
          withAssignees: actionItems.filter(item => item.assignees && item.assignees.length > 0).length
        }
      };
      
      // Assess confidence in the analysis
      const confidence = await this.assessConfidence(actionItemAnalysis);
      
      // Explain reasoning
      const reasoning = await this.explainReasoning(actionItemAnalysis);
      
      // Create output
      const output: AgentOutput = {
        content: actionItemAnalysis,
        confidence,
        reasoning,
        metadata: {
          taskId: task.id,
          actionItemCount: actionItems.length,
          meetingId: metadata?.meetingId || 'unknown'
        },
        timestamp: Date.now()
      };
      
      // Notify coordinator of task completion
      await this.notifyTaskCompletion(task.id, output);
      
      return output;
    } catch (error) {
      this.logger.error(`Error processing action item extraction: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
  
  /**
   * Extract action items from the transcript
   */
  private async extractActionItems(transcript: MeetingTranscript, metadata: any): Promise<Array<{
    id: string;
    description: string;
    assignees: string[];
    dueDate?: string;
    priority?: 'low' | 'medium' | 'high';
    status: 'pending' | 'in_progress' | 'completed';
    explicit: boolean;
    segmentId: string;
    confidenceScore: number;
    relatedTopics?: string[];
    isFollowUp?: boolean;
    previousMeetingReference?: string;
  }>> {
    this.logger.info('Extracting action items from transcript');
    
    // Combine segments for context, but keep segment IDs for reference
    const fullText = transcript.segments.map(s => 
      `[SEGMENT: ${s.id} | SPEAKER: ${s.speakerName || s.speakerId}]\n${s.content}`
    ).join('\n\n');
    
    // Get participant information
    const participants = metadata?.participants || [];
    const participantInfo = participants.length > 0 
      ? `MEETING PARTICIPANTS:\n${participants.map((p: any) => `- ${p.name || p.id} (ID: ${p.id}${p.role ? `, Role: ${p.role}` : ''})`).join('\n')}`
      : 'No specific participant information available.';
    
    // Initialize RAG Prompt Manager
    const ragPromptManager = new RagPromptManager();
    
    // Create instruction content
    const instructionContent = `
      Extract all action items from the following meeting transcript.
      
      ${participantInfo}
      
      Identify both:
      1. Explicit action items (clearly stated tasks assigned to individuals)
      2. Implicit action items (implied responsibilities or next steps)
      
      For each action item:
      - Provide a clear, concise description of what needs to be done
      - Identify the assignee(s) by name or ID (from the participants list)
      - Note the segment ID where the action item appears
      - Determine if it's an explicit or implicit action item
      - Assess a confidence score (0.0 to 1.0) for each identified action item
      
      Only include action items with a confidence score of at least ${this.minConfidence}.
    `;
    
    // Generate dummy embedding for simplicity
    // In a real implementation, you would generate proper embeddings
    const dummyEmbedding = new Array(1536).fill(0).map(() => Math.random() - 0.5);
    
    // Create RAG options - using a custom retrieval strategy since we already have the transcript
    const ragOptions = {
      userId: metadata.userId || 'system',
      queryText: 'Extract action items from meeting transcript',
      queryEmbedding: dummyEmbedding,
      strategy: RagRetrievalStrategy.CUSTOM,
      customFilter: {
        meetingId: metadata.meetingId
      }
    };
    
    try {
      // Use RAG prompt manager to create an optimized prompt
      // TODO Use this rag prompt in the agent, it is defined but not used
      const ragPrompt = await ragPromptManager.createRagPrompt(
        SystemRoleEnum.MEETING_ANALYST,
        InstructionTemplateNameEnum.MEETING_ANALYSIS_CHUNK,
        instructionContent,
        ragOptions
      );
      
      // Add transcript as context
      const content = `${instructionContent}\n\nTRANSCRIPT:\n${fullText}`;
      
      // Call LLM with optimized prompt
      const response = await this.callLLM('Extract action items from transcript', content);
      
      try {
        let actionItems = JSON.parse(response);
        
        // If the response is wrapped in an object with 'actionItems' field, extract it
        if (actionItems.actionItems && Array.isArray(actionItems.actionItems)) {
          actionItems = actionItems.actionItems;
        }
        
        // Ensure each action item has an ID and required fields
        actionItems = actionItems.map((item: any) => ({
          id: item.id || `action-${uuidv4().substring(0, 8)}`,
          description: item.description,
          assignees: item.assignees || [],
          status: item.status || 'pending',
          explicit: !!item.explicit,
          segmentId: item.segmentId,
          confidenceScore: item.confidenceScore || this.minConfidence,
          // These fields will be populated later if enabled
          dueDate: item.dueDate,
          priority: item.priority,
          relatedTopics: item.relatedTopics || [],
          isFollowUp: false
        }));
        
        // Filter by minimum confidence
        actionItems = actionItems.filter(
          (item: any) => item.confidenceScore >= this.minConfidence
        );
        
        return actionItems;
      } catch (error) {
        this.logger.error(`Error parsing action item extraction response: ${error instanceof Error ? error.message : String(error)}`);
        
        // Return a minimal valid result if parsing fails
        return [];
      }
    } catch (error) {
      this.logger.error(`Error using RAG prompt manager: ${error instanceof Error ? error.message : String(error)}`);
      
      // Fall back to direct LLM call if RAG fails
      const fallbackPrompt = `
        Extract all action items from the following meeting transcript.
        
        ${participantInfo}
        
        Identify both:
        1. Explicit action items (clearly stated tasks assigned to individuals)
        2. Implicit action items (implied responsibilities or next steps)
        
        For each action item:
        - Provide a clear, concise description of what needs to be done
        - Identify the assignee(s) by name or ID (from the participants list)
        - Note the segment ID where the action item appears
        - Determine if it's an explicit or implicit action item
        - Assess a confidence score (0.0 to 1.0) for each identified action item
        
        Only include action items with a confidence score of at least ${this.minConfidence}.
        
        TRANSCRIPT:
        ${fullText}
        
        Return your analysis as a JSON array of action item objects.
      `;
      
      const fallbackResponse = await this.callLLM('Extract action items from transcript', fallbackPrompt);
      
      try {
        let actionItems = JSON.parse(fallbackResponse);
        
        // Ensure each action item has an ID and required fields
        actionItems = actionItems.map((item: any) => ({
          id: item.id || `action-${uuidv4().substring(0, 8)}`,
          description: item.description,
          assignees: item.assignees || [],
          status: item.status || 'pending',
          explicit: !!item.explicit,
          segmentId: item.segmentId,
          confidenceScore: item.confidenceScore || this.minConfidence,
          // These fields will be populated later if enabled
          dueDate: item.dueDate,
          priority: item.priority,
          relatedTopics: item.relatedTopics || [],
          isFollowUp: false
        }));
        
        // Filter by minimum confidence
        actionItems = actionItems.filter(
          (item: any) => item.confidenceScore >= this.minConfidence
        );
        
        return actionItems;
      } catch (error) {
        this.logger.error(`Error parsing fallback response: ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    }
  }
  
  /**
   * Extract deadlines for action items
   */
  private async extractDeadlines(
    actionItems: Array<any>,
    transcript: MeetingTranscript
  ): Promise<void> {
    if (actionItems.length === 0) {
      return;
    }
    
    this.logger.info('Extracting deadlines for action items');
    
    // Create segments lookup for efficiency
    const segmentsById: Record<string, any> = {};
    for (const segment of transcript.segments) {
      segmentsById[segment.id] = segment;
    }
    
    // Process action items in batches to avoid prompt length issues
    const batchSize = 5;
    for (let i = 0; i < actionItems.length; i += batchSize) {
      const batch = actionItems.slice(i, i + batchSize);
      
      const actionItemsWithContext = batch.map(item => {
        const segment = segmentsById[item.segmentId];
        
        // Get a few segments before and after for context
        const segmentIndex = transcript.segments.findIndex(s => s.id === item.segmentId);
        const contextSegments = transcript.segments.slice(
          Math.max(0, segmentIndex - 2),
          Math.min(transcript.segments.length, segmentIndex + 3)
        );
        
        return {
          ...item,
          context: contextSegments.map(s => 
            `[SPEAKER: ${s.speakerName || s.speakerId}]${s.id === item.segmentId ? ' [ACTION ITEM SEGMENT]' : ''}\n${s.content}`
          ).join('\n\n')
        };
      });
      
      const prompt = `
        Extract deadline information for the following action items from a meeting transcript.
        
        For each action item, examine the context provided and identify any mentioned deadlines, due dates, or timeframes.
        
        If a specific date is mentioned, use YYYY-MM-DD format.
        If a relative timeframe is mentioned (e.g., "by next week"), convert it to an approximate date.
        If no deadline is mentioned, indicate "null".
        
        Today's date is: ${new Date().toISOString().split('T')[0]}
        
        ACTION ITEMS WITH CONTEXT:
        ${actionItemsWithContext.map((item, index) => `
        --- ACTION ITEM ${index + 1} ---
        Description: ${item.description}
        Assignees: ${item.assignees.join(', ')}
        
        CONTEXT:
        ${item.context}
        `).join('\n\n')}
        
        Return a JSON array with deadline information for each action item, in the same order.
        Each item should have:
        - id: The action item ID
        - dueDate: The deadline in YYYY-MM-DD format, or null if none found
        - dueDateConfidence: A confidence score (0.0 to 1.0) for the extracted deadline
      `;
      
      try {
        const response = await this.callLLM('Extract deadlines', prompt);
        const deadlines = JSON.parse(response);
        
        // Update action items with deadline information
        for (const deadline of deadlines) {
          const actionItem = actionItems.find(item => item.id === deadline.id);
          if (actionItem) {
            // Only update if confidence is reasonable
            if (deadline.dueDateConfidence >= 0.7) {
              actionItem.dueDate = deadline.dueDate;
            }
          }
        }
      } catch (error) {
        this.logger.error(`Error extracting deadlines: ${error instanceof Error ? error.message : String(error)}`);
        // Continue with other batches despite error
      }
    }
  }
  
  /**
   * Assess priorities for action items
   */
  private async assessPriorities(
    actionItems: Array<any>,
    transcript: MeetingTranscript
  ): Promise<void> {
    if (actionItems.length === 0) {
      return;
    }
    
    this.logger.info('Assessing priorities for action items');
    
    // Create a global assessment of all action items
    const prompt = `
      Assess the relative priority of the following action items from a meeting.
      
      For each action item, assign a priority level of:
      - "high": Urgent or critical tasks that have significant impact or tight deadlines
      - "medium": Important tasks with moderate urgency or impact
      - "low": Tasks with lower urgency or impact
      
      Base your assessment on:
      - Language indicating urgency ("urgent", "ASAP", "critical", etc.)
      - Emphasis or repetition in the discussion
      - Speaker's authority (if executives or leaders stress importance)
      - Dependencies (if other tasks depend on this one)
      - Business impact implied in the description
      
      ACTION ITEMS:
      ${actionItems.map((item, index) => `
      ${index + 1}. ID: ${item.id}
         Description: ${item.description}
         Assignees: ${item.assignees.join(', ')}
         ${item.dueDate ? `Due date: ${item.dueDate}` : 'No due date specified'}
      `).join('\n')}
      
      Return a JSON array with priority assessments, including:
      - id: The action item ID
      - priority: Either "high", "medium", or "low"
      - explanation: Brief explanation for the priority assessment
    `;
    
    try {
      const response = await this.callLLM('Assess priorities', prompt);
      const priorities = JSON.parse(response);
      
      // Update action items with priority information
      for (const priority of priorities) {
        const actionItem = actionItems.find(item => item.id === priority.id);
        if (actionItem) {
          actionItem.priority = priority.priority;
          actionItem.priorityRationale = priority.explanation;
        }
      }
    } catch (error) {
      this.logger.error(`Error assessing priorities: ${error instanceof Error ? error.message : String(error)}`);
      // Set default priorities if assessment fails
      for (const item of actionItems) {
        if (!item.priority) {
          item.priority = 'medium';
        }
      }
    }
  }
  
  /**
   * Link action items to discussion topics
   */
  private async linkActionItemsToTopics(
    actionItems: Array<any>,
    topics: Array<any>,
    transcript: MeetingTranscript
  ): Promise<void> {
    if (actionItems.length === 0 || topics.length === 0) {
      return;
    }
    
    this.logger.info('Linking action items to discussion topics');
    
    // Create segments lookup for efficiency
    const segmentsById: Record<string, any> = {};
    for (const segment of transcript.segments) {
      segmentsById[segment.id] = segment;
    }
    
    const prompt = `
      Link each action item to the most relevant discussion topics from the meeting.
      
      TOPICS:
      ${topics.map((topic, index) => `
      ${index + 1}. ID: ${topic.id}
         Name: ${topic.name}
         Description: ${topic.description}
         Keywords: ${topic.keywords.join(', ')}
      `).join('\n')}
      
      ACTION ITEMS:
      ${actionItems.map((item, index) => {
        const segment = segmentsById[item.segmentId] || { content: 'Segment not found' };
        return `
        ${index + 1}. ID: ${item.id}
           Description: ${item.description}
           Context: ${segment.content}
        `;
      }).join('\n')}
      
      For each action item, identify the topic(s) it relates to. An action item may relate to multiple topics.
      
      Return a JSON array with the following structure:
      - id: The action item ID
      - relatedTopics: Array of topic IDs that relate to this action item
      - primaryTopic: The most relevant topic ID (from the relatedTopics array)
    `;
    
    try {
      const response = await this.callLLM('Link action items to topics', prompt);
      const linkages = JSON.parse(response);
      
      // Update action items with topic linkages
      for (const linkage of linkages) {
        const actionItem = actionItems.find(item => item.id === linkage.id);
        if (actionItem) {
          actionItem.relatedTopics = linkage.relatedTopics || [];
          actionItem.primaryTopic = linkage.primaryTopic;
        }
      }
    } catch (error) {
      this.logger.error(`Error linking action items to topics: ${error instanceof Error ? error.message : String(error)}`);
      // Continue without topic linkages if there's an error
    }
  }
  
  /**
   * Detect follow-ups from previous meetings
   */
  private async detectFollowUps(
    actionItems: Array<any>,
    previousActionItems: Array<any>
  ): Promise<void> {
    if (actionItems.length === 0 || previousActionItems.length === 0) {
      return;
    }
    
    this.logger.info('Detecting follow-ups from previous meetings');
    
    const prompt = `
      Identify which action items are follow-ups from previous meetings.
      
      PREVIOUS MEETING ACTION ITEMS:
      ${previousActionItems.map((item, index) => `
      ${index + 1}. ID: ${item.id}
         Description: ${item.description}
         Assignees: ${item.assignees.join(', ')}
         Status: ${item.status}
      `).join('\n')}
      
      CURRENT MEETING ACTION ITEMS:
      ${actionItems.map((item, index) => `
      ${index + 1}. ID: ${item.id}
         Description: ${item.description}
         Assignees: ${item.assignees.join(', ')}
      `).join('\n')}
      
      For each current action item, determine if it's a follow-up to any previous action item.
      Consider similarities in:
      - Description and task content
      - Assignees
      - General topic or subject matter
      
      Return a JSON array with the following structure:
      - id: The current action item ID
      - isFollowUp: Boolean indicating if this is a follow-up
      - previousItemId: ID of the previous action item it follows up on (if applicable)
      - continuationLevel: A score (0.0 to 1.0) indicating how confident you are this is a continuation
    `;
    
    try {
      const response = await this.callLLM('Detect follow-ups', prompt);
      const followUps = JSON.parse(response);
      
      // Update action items with follow-up information
      for (const followUp of followUps) {
        if (followUp.continuationLevel >= 0.7) {
          const actionItem = actionItems.find(item => item.id === followUp.id);
          if (actionItem) {
            actionItem.isFollowUp = followUp.isFollowUp;
            actionItem.previousMeetingReference = followUp.previousItemId;
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error detecting follow-ups: ${error instanceof Error ? error.message : String(error)}`);
      // Continue without follow-up information if there's an error
    }
  }
  
  /**
   * Analyze a specific segment of the transcript
   */
  async analyzeTranscriptSegment(segment: string, context?: any): Promise<AgentOutput> {
    this.logger.info('Analyzing transcript segment for action items');
    
    const prompt = `
      Identify any action items in this meeting transcript segment.
      
      Focus on both:
      - Explicit action items (clearly stated tasks)
      - Implicit action items (implied responsibilities)
      
      For each action item found:
      1. Provide a concise description of what needs to be done
      2. Identify the assignee(s) if mentioned
      3. Note any deadlines mentioned
      4. Assess if it's explicit or implicit
      5. Provide a confidence score (0.0 to 1.0)
      
      Additional context:
      ${context?.participantInfo ? `Participants: ${context.participantInfo}` : 'No participant information available'}
      
      TRANSCRIPT SEGMENT:
      ${segment}
      
      Return your analysis as a JSON object.
    `;
    
    const response = await this.callLLM('Analyze segment for action items', prompt);
    
    try {
      const segmentAnalysis = JSON.parse(response);
      
      // Ensure each action item has an ID
      if (segmentAnalysis.actionItems) {
        segmentAnalysis.actionItems = segmentAnalysis.actionItems.map((item: any) => ({
          ...item,
          id: item.id || `action-${uuidv4().substring(0, 8)}`
        }));
      }
      
      // Assess confidence in the analysis
      const confidence = await this.assessConfidence(segmentAnalysis);
      
      return {
        content: segmentAnalysis,
        confidence,
        reasoning: `Identified ${segmentAnalysis.actionItems?.length || 0} action items in this segment based on explicit task assignments and implied responsibilities.`,
        metadata: {
          segmentLength: segment.length,
          hasParticipantContext: !!context?.participantInfo
        },
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error(`Error analyzing transcript segment: ${error instanceof Error ? error.message : String(error)}`);
      
      return {
        content: {
          actionItems: []
        },
        confidence: ConfidenceLevel.LOW,
        reasoning: 'Failed to properly analyze the segment due to parsing error.',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          segmentLength: segment.length
        },
        timestamp: Date.now()
      };
    }
  }
  
  /**
   * Merge multiple analyses into a consolidated result
   */
  async mergeAnalyses(analyses: AgentOutput[]): Promise<AgentOutput> {
    this.logger.info(`Merging ${analyses.length} action item analyses`);
    
    if (analyses.length === 0) {
      throw new Error('No analyses to merge');
    }
    
    if (analyses.length === 1) {
      return analyses[0];
    }
    
    // Extract action items from all analyses
    const allActionItems: any[] = [];
    for (const analysis of analyses) {
      if (analysis.content.actionItems) {
        allActionItems.push(...analysis.content.actionItems);
      }
    }
    
    const prompt = `
      Merge the following action item analyses into a cohesive result.
      
      ACTION ITEMS FROM MULTIPLE ANALYSES:
      ${JSON.stringify(allActionItems, null, 2)}
      
      Create a consolidated list that:
      1. Combines similar or duplicate action items
      2. Preserves unique details from each source
      3. Resolves any conflicts in assignees or deadlines
      4. Maintains the highest confidence version of each item
      5. Keeps all proper attribution and linking information
      
      Return a JSON object with a merged 'actionItems' array.
    `;
    
    const response = await this.callLLM('Merge action item analyses', prompt);
    
    try {
      const mergedAnalysis = JSON.parse(response);
      
      // Calculate average confidence from input analyses
      const avgConfidence = analyses.reduce(
        (sum, analysis) => sum + (
          analysis.confidence === ConfidenceLevel.HIGH ? 1.0 :
          analysis.confidence === ConfidenceLevel.MEDIUM ? 0.7 :
          analysis.confidence === ConfidenceLevel.LOW ? 0.4 : 0.2
        ),
        0
      ) / analyses.length;
      
      const confidence = avgConfidence > 0.8 ? ConfidenceLevel.HIGH :
                         avgConfidence > 0.5 ? ConfidenceLevel.MEDIUM :
                         ConfidenceLevel.LOW;
      
      return {
        content: mergedAnalysis,
        confidence,
        reasoning: `Merged ${analyses.length} analyses containing a total of ${allActionItems.length} action items into ${mergedAnalysis.actionItems.length} consolidated items.`,
        metadata: {
          sourceAnalyses: analyses.length,
          originalItemCount: allActionItems.length,
          mergedItemCount: mergedAnalysis.actionItems.length
        },
        timestamp: Date.now()
      };
    } catch (error) {
      this.logger.error(`Error merging action item analyses: ${error instanceof Error ? error.message : String(error)}`);
      
      // Fall back to first analysis if merging fails
      return analyses[0];
    }
  }
  
  /**
   * Prioritize information based on importance
   */
  async prioritizeInformation(output: any): Promise<any> {
    this.logger.info('Prioritizing action item information');
    
    if (!output.actionItems || !Array.isArray(output.actionItems)) {
      return output;
    }
    
    // First prioritize by explicit vs implicit
    output.actionItems.sort((a: any, b: any) => {
      // First by explicit vs implicit
      if (a.explicit !== b.explicit) {
        return a.explicit ? -1 : 1;
      }
      
      // Then by priority if available
      if (a.priority && b.priority) {
        const priorityValues = { high: 3, medium: 2, low: 1 };
        return priorityValues[a.priority as keyof typeof priorityValues] > priorityValues[b.priority as keyof typeof priorityValues] ? -1 : 1;
      }
      
      // Then by confidence score
      return b.confidenceScore - a.confidenceScore;
    });
    
    return output;
  }
  
  /**
   * Notify coordinator of task completion
   */
  private async notifyTaskCompletion(taskId: string, output: AgentOutput): Promise<void> {
    const message = this.createMessage(
      MessageType.RESPONSE,
      ['coordinator'],
      {
        messageType: 'TASK_COMPLETED',
        taskId,
        output
      }
    );
    
    await this.sendMessage(message);
  }
  
  /**
   * Get default system prompt for action item specialist
   */
  protected getDefaultSystemPrompt(): string {
    return `You are the Action Item Specialist Agent, specialized in identifying and analyzing action items in meeting transcripts.
Your responsibilities include:
- Detecting both explicit and implied action items
- Extracting ownership/assignee information for each action item
- Determining deadlines and priorities for tasks
- Linking action items to relevant discussion topics
- Identifying follow-ups from previous meetings

When analyzing action items, be thorough but precise. Focus on concrete, actionable tasks rather than vague intentions.
For each action item, provide clear descriptions and as much contextual information as possible to ensure accountability.`;
  }
} 