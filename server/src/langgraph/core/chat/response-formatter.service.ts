import { Logger } from '../../../shared/logger/logger.interface';
import { ChatResponse } from './chat-agent-interface';

/**
 * Analysis result data structure
 */
export interface AnalysisResult {
  /**
   * Meeting ID
   */
  meetingId: string;
  
  /**
   * Analysis timestamp
   */
  timestamp: number;
  
  /**
   * Summary of the meeting
   */
  summary?: {
    short: string;
    detailed?: string;
  };
  
  /**
   * Participants in the meeting
   */
  participants?: {
    id: string;
    name: string;
    speakingTime?: number;
    contributions?: number;
  }[];
  
  /**
   * Topics discussed
   */
  topics?: {
    id: string;
    name: string;
    relevance: number;
    keywords?: string[];
  }[];
  
  /**
   * Action items from the meeting
   */
  actionItems?: {
    id: string;
    description: string;
    assignees?: string[];
  }[];
  
  /**
   * Key insights from the meeting
   */
  insights?: string[];
  
  /**
   * Any generated visualizations
   */
  visualizations?: {
    type: string;
    data: any;
    metadata?: Record<string, any>;
  }[];
}

/**
 * Visualization data structure
 */
export interface Visualization {
  /**
   * Type of visualization
   */
  type: string;
  
  /**
   * Title of the visualization
   */
  title: string;
  
  /**
   * Format of the visualization (svg, png, html, etc.)
   */
  format: string;
  
  /**
   * The visualization data (could be a URL, base64 data, or HTML)
   */
  data: any;
  
  /**
   * Description of what the visualization shows
   */
  description?: string;
  
  /**
   * Additional metadata
   */
  metadata?: Record<string, any>;
}

/**
 * Clarification data structure
 */
export interface Clarification {
  /**
   * Topic being clarified
   */
  topic: string;
  
  /**
   * Explanation of the topic
   */
  explanation: string;
  
  /**
   * Related concepts
   */
  relatedConcepts?: string[];
  
  /**
   * Optional examples to illustrate the concept
   */
  examples?: string[];
}

/**
 * Options for response formatter service
 */
export interface ResponseFormatterOptions {
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * Maximum length for text responses
   */
  maxResponseLength?: number;
  
  /**
   * Whether to add timestamps to responses
   */
  includeTimestamps?: boolean;
}

/**
 * Response formatter service
 * Formats complex analysis results into chat-friendly responses
 * Handles rich media attachments (like visualization snippets)
 */
export class ResponseFormatterService {
  private logger?: Logger;
  private maxResponseLength: number;
  private includeTimestamps: boolean;
  
  /**
   * Create a new response formatter service
   */
  constructor(options: ResponseFormatterOptions = {}) {
    this.logger = options.logger;
    this.maxResponseLength = options.maxResponseLength || 4000;
    this.includeTimestamps = options.includeTimestamps || false;
  }
  
  /**
   * Format transcript processing result into a chat response
   * 
   * @param result - Analysis result from transcript processing
   * @returns Formatted chat response
   */
  formatTranscriptProcessingResult(result: AnalysisResult): ChatResponse {
    this.logger?.debug(`Formatting transcript processing result for meeting ${result.meetingId}`);
    
    // Build the response message
    let content = `I've analyzed the transcript (Meeting ID: ${result.meetingId}).\n\n`;
    
    // Add summary if available
    if (result.summary) {
      content += `**Summary**: ${result.summary.short}\n\n`;
    }
    
    // Add participant info if available
    if (result.participants && result.participants.length > 0) {
      content += `**Participants**: ${result.participants.length} people participated, including ${result.participants.slice(0, 3).map(p => p.name).join(', ')}`;
      if (result.participants.length > 3) {
        content += ` and ${result.participants.length - 3} others`;
      }
      content += '.\n\n';
    }
    
    // Add key insights if available
    if (result.insights && result.insights.length > 0) {
      content += '**Key Insights**:\n';
      const insightsToShow = Math.min(3, result.insights.length);
      for (let i = 0; i < insightsToShow; i++) {
        content += `- ${result.insights[i]}\n`;
      }
      if (result.insights.length > insightsToShow) {
        content += `- Plus ${result.insights.length - insightsToShow} more insights...\n`;
      }
      content += '\n';
    }
    
    // Add action items if available
    if (result.actionItems && result.actionItems.length > 0) {
      content += `**Action Items**: ${result.actionItems.length} action items were identified.\n\n`;
    }
    
    // Add a prompt for how to query the analysis
    content += 'You can ask me specific questions about this meeting, request visualizations, or get more details about particular aspects.';
    
    // Prepare attachments (if any)
    const attachments = [];
    
    // Include the first visualization if available
    if (result.visualizations && result.visualizations.length > 0) {
      const viz = result.visualizations[0];
      attachments.push({
        type: 'visualization',
        data: viz.data,
        metadata: {
          visualizationType: viz.type,
          ...viz.metadata
        }
      });
    }
    
    return {
      id: `resp-${Date.now()}`,
      content: this.truncateMessage(content),
      type: 'analysis',
      attachments: attachments.length > 0 ? attachments : undefined,
      timestamp: Date.now()
    };
  }
  
  /**
   * Format analysis query result into a chat response
   * 
   * @param result - Analysis result data
   * @param query - Original user query
   * @returns Formatted chat response
   */
  formatAnalysisQueryResult(result: any, query: string): ChatResponse {
    this.logger?.debug(`Formatting analysis query result for query: ${query}`);
    
    let content = '';
    let responseType: 'text' | 'analysis' = 'text';
    let attachments: any[] = [];
    
    // Different formatting based on query type
    if (typeof result === 'string') {
      // Simple string response
      content = result;
    } else if (Array.isArray(result)) {
      // List of items
      if (result.length === 0) {
        content = 'I couldn\'t find any relevant information for your query.';
      } else if (typeof result[0] === 'string') {
        // Array of strings
        content = result.join('\n• ');
        if (content.length > 0) {
          content = '• ' + content;
        }
      } else {
        // Array of objects - format depends on query
        content = this.formatArrayOfObjects(result, query);
      }
    } else if (typeof result === 'object' && result !== null) {
      // Object result - handle different result types
      if (result.summary) {
        // Treat as meeting summary
        content = this.formatSummaryResult(result);
        responseType = 'analysis';
      } else if (result.visualization) {
        // Contains visualization
        content = result.description || 'Here\'s the visualization you requested:';
        responseType = 'analysis';
        attachments.push({
          type: 'visualization',
          data: result.visualization.data,
          metadata: {
            visualizationType: result.visualization.type,
            title: result.visualization.title || 'Visualization',
            description: result.visualization.description
          }
        });
      } else if (result.participants) {
        // Participant information
        content = this.formatParticipantResult(result);
      } else if (result.topics) {
        // Topic information
        content = this.formatTopicResult(result);
      } else if (result.actionItems) {
        // Action items
        content = this.formatActionItemResult(result);
      } else {
        // Generic object - convert to readable text
        content = this.objectToReadableText(result);
      }
    } else {
      // Fallback for unrecognized result types
      content = 'I found some information, but I\'m not sure how to present it in the best way.';
    }
    
    return {
      id: `resp-${Date.now()}`,
      content: this.truncateMessage(content),
      type: responseType,
      attachments: attachments.length > 0 ? attachments : undefined,
      timestamp: Date.now()
    };
  }
  
  /**
   * Format visualization data into a chat response
   * 
   * @param visualization - Visualization data
   * @param visualizationType - Type of visualization
   * @returns Formatted chat response
   */
  formatVisualization(visualization: Visualization, visualizationType: string): ChatResponse {
    this.logger?.debug(`Formatting visualization of type: ${visualizationType}`);
    
    // Create a meaningful description based on visualization type
    let content = '';
    
    switch (visualizationType) {
      case 'participant_breakdown':
        content = 'Here\'s a breakdown of participant contributions in the meeting:';
        break;
      case 'topic_distribution':
        content = 'Here\'s the distribution of topics discussed in the meeting:';
        break;
      case 'sentiment_analysis':
        content = 'Here\'s the sentiment analysis from the meeting:';
        break;
      case 'timeline':
        content = 'Here\'s a timeline of the meeting discussion:';
        break;
      case 'action_items':
        content = 'Here\'s a summary of action items from the meeting:';
        break;
      case 'network_graph':
        content = 'Here\'s a network graph showing interactions between participants:';
        break;
      case 'word_cloud':
        content = 'Here\'s a word cloud showing key terms from the meeting:';
        break;
      default:
        content = `Here's the ${visualizationType} visualization you requested:`;
    }
    
    // Add the visualization description if available
    if (visualization.description) {
      content += `\n\n${visualization.description}`;
    }
    
    return {
      id: `resp-${Date.now()}`,
      content,
      type: 'visualization',
      attachments: [
        {
          type: 'visualization',
          data: visualization.data,
          metadata: {
            visualizationType,
            title: visualization.title,
            format: visualization.format,
            ...visualization.metadata
          }
        }
      ],
      timestamp: Date.now()
    };
  }
  
  /**
   * Format analysis refresh result into a chat response
   * 
   * @param result - Result from refreshing the analysis
   * @returns Formatted chat response
   */
  formatAnalysisRefreshResult(result: AnalysisResult): ChatResponse {
    this.logger?.debug(`Formatting analysis refresh result for meeting ${result.meetingId}`);
    
    // Similar to transcript processing result but with different messaging
    let content = `I've refreshed the analysis for Meeting ${result.meetingId}.\n\n`;
    
    // Add new insights or updates if available
    if (result.insights && result.insights.length > 0) {
      content += '**Key Insights**:\n';
      const insightsToShow = Math.min(3, result.insights.length);
      for (let i = 0; i < insightsToShow; i++) {
        content += `- ${result.insights[i]}\n`;
      }
      content += '\n';
    }
    
    // Add a prompt for next steps
    content += 'You can now ask me updated questions about this meeting or request the latest visualizations.';
    
    return {
      id: `resp-${Date.now()}`,
      content: this.truncateMessage(content),
      type: 'analysis',
      timestamp: Date.now()
    };
  }
  
  /**
   * Format clarification into a chat response
   * 
   * @param clarification - Clarification data
   * @param topic - Original topic being clarified
   * @returns Formatted chat response
   */
  formatClarification(clarification: Clarification, topic: string): ChatResponse {
    this.logger?.debug(`Formatting clarification for topic: ${topic}`);
    
    let content = `**${clarification.topic}**: ${clarification.explanation}`;
    
    // Add examples if available
    if (clarification.examples && clarification.examples.length > 0) {
      content += '\n\n**Examples**:\n';
      for (const example of clarification.examples) {
        content += `- ${example}\n`;
      }
    }
    
    // Add related concepts if available
    if (clarification.relatedConcepts && clarification.relatedConcepts.length > 0) {
      content += '\n\n**Related Concepts**: ';
      content += clarification.relatedConcepts.join(', ');
    }
    
    return {
      id: `resp-${Date.now()}`,
      content: this.truncateMessage(content),
      type: 'text',
      timestamp: Date.now()
    };
  }
  
  /**
   * Format a summary result into readable text
   * 
   * @param result - Summary result data
   * @returns Formatted text
   */
  private formatSummaryResult(result: any): string {
    if (result.summary.detailed) {
      return `**Meeting Summary**\n\n${result.summary.detailed}`;
    } else if (result.summary.short) {
      return `**Meeting Summary**\n\n${result.summary.short}`;
    } else {
      return 'No detailed summary is available for this meeting.';
    }
  }
  
  /**
   * Format participant data into readable text
   * 
   * @param result - Participant data
   * @returns Formatted text
   */
  private formatParticipantResult(result: any): string {
    if (!result.participants || result.participants.length === 0) {
      return 'No participant information is available.';
    }
    
    let content = '**Participant Information**\n\n';
    
    for (const participant of result.participants) {
      content += `- **${participant.name}**: `;
      
      if (participant.speakingTime) {
        // Format speaking time in minutes and seconds
        const minutes = Math.floor(participant.speakingTime / 60);
        const seconds = participant.speakingTime % 60;
        content += `Spoke for ${minutes}m ${seconds}s`;
      }
      
      if (participant.contributions) {
        content += participant.speakingTime ? ' with ' : '';
        content += `${participant.contributions} contributions`;
      }
      
      if (participant.role) {
        content += ` (${participant.role})`;
      }
      
      content += '\n';
    }
    
    return content;
  }
  
  /**
   * Format topic data into readable text
   * 
   * @param result - Topic data
   * @returns Formatted text
   */
  private formatTopicResult(result: any): string {
    if (!result.topics || result.topics.length === 0) {
      return 'No topic information is available.';
    }
    
    let content = '**Topics Discussed**\n\n';
    
    // Sort topics by relevance
    const sortedTopics = [...result.topics].sort((a, b) => b.relevance - a.relevance);
    
    for (const topic of sortedTopics) {
      // Convert relevance to percentage
      const relevancePercent = Math.round(topic.relevance * 100);
      content += `- **${topic.name}** (${relevancePercent}% relevance)`;
      
      if (topic.keywords && topic.keywords.length > 0) {
        content += `\n  Keywords: ${topic.keywords.join(', ')}`;
      }
      
      content += '\n';
    }
    
    return content;
  }
  
  /**
   * Format action item data into readable text
   * 
   * @param result - Action item data
   * @returns Formatted text
   */
  private formatActionItemResult(result: any): string {
    if (!result.actionItems || result.actionItems.length === 0) {
      return 'No action items were identified in this meeting.';
    }
    
    let content = '**Action Items**\n\n';
    
    for (const item of result.actionItems) {
      content += `- ${item.description}`;
      
      if (item.assignees && item.assignees.length > 0) {
        content += `\n  Assigned to: ${item.assignees.join(', ')}`;
      }
      
      if (item.dueDate) {
        content += `\n  Due: ${item.dueDate}`;
      }
      
      if (item.status) {
        content += `\n  Status: ${item.status}`;
      }
      
      content += '\n\n';
    }
    
    return content.trim();
  }
  
  /**
   * Format an array of objects into readable text
   * 
   * @param array - Array of objects
   * @param query - Original query to guide formatting
   * @returns Formatted text
   */
  private formatArrayOfObjects(array: any[], query: string): string {
    if (array.length === 0) {
      return 'No results found for your query.';
    }
    
    // Try to determine what type of data we're dealing with
    const firstItem = array[0];
    
    if (firstItem.description) {
      // Possibly action items or similar
      return array.map((item, index) => 
        `${index + 1}. ${item.description}`
      ).join('\n');
    } else if (firstItem.name) {
      // Possibly participants or topics
      return array.map((item) => 
        `- **${item.name}**${item.relevance ? ` (Relevance: ${Math.round(item.relevance * 100)}%)` : ''}`
      ).join('\n');
    } else {
      // Generic object array
      return array.map((item, index) => 
        `${index + 1}. ${this.objectToReadableText(item)}`
      ).join('\n');
    }
  }
  
  /**
   * Convert an object to readable text
   * 
   * @param obj - Object to convert
   * @returns Readable text representation
   */
  private objectToReadableText(obj: Record<string, any>): string {
    if (!obj) return 'No data available';
    
    const lines: string[] = [];
    
    // Process key-value pairs
    for (const [key, value] of Object.entries(obj)) {
      // Skip internal or technical properties
      if (key.startsWith('_') || key === 'id' || key === 'metadata') continue;
      
      // Format the key for display (capitalize, replace underscores)
      const formattedKey = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase());
      
      // Format the value based on its type
      let formattedValue = '';
      
      if (value === null || value === undefined) {
        continue; // Skip null or undefined values
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        // Nested objects - format recursively but indented
        formattedValue = '\n' + this.objectToReadableText(value)
          .split('\n')
          .map(line => `  ${line}`)
          .join('\n');
      } else if (Array.isArray(value)) {
        if (value.length === 0) continue; // Skip empty arrays
        
        if (typeof value[0] === 'string') {
          // Array of strings
          formattedValue = value.join(', ');
        } else {
          // Array of objects - just mention the count
          formattedValue = `${value.length} items`;
        }
      } else if (typeof value === 'number') {
        if (key.toLowerCase().includes('time') || key.toLowerCase().includes('duration')) {
          // Format time values specially
          const minutes = Math.floor(value / 60);
          const seconds = value % 60;
          formattedValue = `${minutes}m ${seconds}s`;
        } else if (key.toLowerCase().includes('percentage') || key.toLowerCase().includes('relevance')) {
          // Format percentage values
          formattedValue = `${Math.round(value * 100)}%`;
        } else {
          formattedValue = value.toString();
        }
      } else {
        formattedValue = value.toString();
      }
      
      lines.push(`**${formattedKey}**: ${formattedValue}`);
    }
    
    return lines.join('\n');
  }
  
  /**
   * Truncate a message to the maximum allowed length
   * 
   * @param message - Message to truncate
   * @returns Truncated message
   */
  private truncateMessage(message: string): string {
    if (message.length <= this.maxResponseLength) {
      return message;
    }
    
    const truncationSuffix = '... (message truncated)';
    const maxContentLength = this.maxResponseLength - truncationSuffix.length;
    
    // Try to truncate at a sentence or paragraph boundary
    const paragraphBreak = message.lastIndexOf('\n\n', maxContentLength - 10);
    if (paragraphBreak > maxContentLength * 0.7) {
      return message.substring(0, paragraphBreak) + '\n\n' + truncationSuffix;
    }
    
    const sentenceBreak = message.lastIndexOf('. ', maxContentLength - 5);
    if (sentenceBreak > maxContentLength * 0.7) {
      return message.substring(0, sentenceBreak + 1) + ' ' + truncationSuffix;
    }
    
    // If no good breakpoint is found, just cut at the maximum length
    return message.substring(0, maxContentLength) + truncationSuffix;
  }
} 