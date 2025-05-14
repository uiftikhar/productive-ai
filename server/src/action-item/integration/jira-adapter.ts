// TODO Use MCP tool instead of API useage
import axios, { AxiosInstance } from 'axios';
import { Logger } from '../../shared/logger/logger.interface';
import { ConsoleLogger } from '../../shared/logger/console-logger';
import { 
  IntegrationAdapter, 
  IntegrationCredentials, 
  IntegrationPlatform,
  ActionItemData,
} from './action-item-integration.service';
import { ActionItemPriority, ActionItemStatus } from '../action-item-processor';

/**
 * JIRA-specific integration credentials
 */
export interface JiraCredentials extends IntegrationCredentials {
  baseUrl: string; // JIRA instance URL (e.g., https://yourcompany.atlassian.net)
  email: string; // User email for authentication
  apiToken: string; // API token for authentication
  projectKey: string; // JIRA project key
  issueTypeId?: string; // Issue type ID (defaults to Task if not specified)
}

/**
 * Mapping between ActionItemPriority and JIRA priority IDs
 */
const PRIORITY_MAP: Record<ActionItemPriority, string> = {
  [ActionItemPriority.LOW]: '4', // Low
  [ActionItemPriority.MEDIUM]: '3', // Medium
  [ActionItemPriority.HIGH]: '2', // High
  [ActionItemPriority.CRITICAL]: '1' // Highest
};

/**
 * Mapping between ActionItemStatus and JIRA transition IDs
 * Note: These may vary depending on JIRA workflow configuration
 */
const STATUS_MAP: Record<ActionItemStatus, string> = {
  [ActionItemStatus.PENDING]: 'To Do',
  [ActionItemStatus.IN_PROGRESS]: 'In Progress',
  [ActionItemStatus.COMPLETED]: 'Done',
  [ActionItemStatus.BLOCKED]: 'Blocked',
  [ActionItemStatus.CANCELLED]: 'Cancelled',
  [ActionItemStatus.DEFERRED]: 'Delayed'
};

/**
 * JIRA adapter implementation
 */
export class JiraAdapter extends IntegrationAdapter {
  private client: AxiosInstance | null = null;
  private initialized: boolean = false;
  
  constructor(credentials: JiraCredentials, logger?: Logger) {
    super(credentials, logger);
  }
  
  get platform(): IntegrationPlatform {
    return IntegrationPlatform.JIRA;
  }
  
  /**
   * Initialize the JIRA API client
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      return true;
    }
    
    try {
      // Validate required credentials
      if (!this.credentials.baseUrl || !this.credentials.email || !this.credentials.apiToken) {
        throw new Error('Missing required JIRA credentials');
      }
      
      // Create Axios instance with basic auth
      this.client = axios.create({
        baseURL: `${this.credentials.baseUrl}/rest/api/3`,
        auth: {
          username: this.credentials.email,
          password: this.credentials.apiToken
        },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });
      
      // Test connection
      const connectionValid = await this.testConnection();
      
      if (!connectionValid) {
        throw new Error('Failed to establish connection to JIRA');
      }
      
      this.initialized = true;
      this.logger.info('JIRA adapter initialized successfully');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to initialize JIRA adapter: ${errorMessage}`);
      return false;
    }
  }
  
  /**
   * Test the connection to JIRA
   */
  async testConnection(): Promise<boolean> {
    try {
      if (!this.client) {
        return false;
      }
      
      // Attempt to get project information
      const response = await this.client.get(`/project/${this.credentials.projectKey}`);
      return response.status === 200;
    } catch (error) {
      this.logger.error('JIRA connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return false;
    }
  }
  
  /**
   * Create a new issue in JIRA
   */
  async createItem(item: ActionItemData): Promise<string | null> {
    try {
      await this.ensureInitialized();
      
      // Determine issue type ID
      const issueTypeId = this.credentials.issueTypeId || '10002'; // Default to Task type
      
      // Convert to JIRA issue fields
      const issueData = {
        fields: {
          summary: item.title,
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: item.description || item.title
                  }
                ]
              },
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: `From meeting: ${item.meetingTitle || 'Untitled meeting'}`
                  }
                ]
              }
            ]
          },
          project: {
            key: this.credentials.projectKey
          },
          issuetype: {
            id: issueTypeId
          },
          // Add priority if defined
          ...(item.priority && { priority: { id: PRIORITY_MAP[item.priority] } }),
          // Add due date if defined
          ...(item.dueDate && { duedate: item.dueDate.toISOString().split('T')[0] }),
          // Add labels if defined
          ...(item.labels && item.labels.length > 0 && { labels: item.labels })
        }
      };
      
      // Create JIRA issue
      const response = await this.client!.post('/issue', issueData);
      
      if (response.status === 201 && response.data.key) {
        const issueKey = response.data.key;
        this.logger.info(`Created JIRA issue ${issueKey} for action item ${item.id}`);
        
        // If item has an assignee, assign the issue
        if (item.assigneeId) {
          try {
            await this.assignIssue(issueKey, item.assigneeId);
          } catch (assignError) {
            this.logger.warn(`Couldn't assign JIRA issue ${issueKey}: ${assignError instanceof Error ? assignError.message : 'Unknown error'}`);
          }
        }
        
        // If item status is not default, update it
        if (item.status !== ActionItemStatus.PENDING) {
          try {
            await this.updateIssueStatus(issueKey, item.status);
          } catch (statusError) {
            this.logger.warn(`Couldn't update JIRA issue status: ${statusError instanceof Error ? statusError.message : 'Unknown error'}`);
          }
        }
        
        return issueKey;
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Failed to create JIRA issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }
  
  /**
   * Update an existing JIRA issue
   */
  async updateItem(item: ActionItemData): Promise<boolean> {
    try {
      await this.ensureInitialized();
      
      if (!item.externalId) {
        throw new Error('Missing external ID for JIRA issue update');
      }
      
      // Prepare update data
      const updateData = {
        fields: {
          summary: item.title,
          description: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: item.description || item.title
                  }
                ]
              }
            ]
          },
          // Add priority if defined
          ...(item.priority && { priority: { id: PRIORITY_MAP[item.priority] } }),
          // Add due date if defined
          ...(item.dueDate && { duedate: item.dueDate.toISOString().split('T')[0] }),
          // Update labels if defined
          ...(item.labels && item.labels.length > 0 && { labels: item.labels })
        }
      };
      
      // Update JIRA issue
      const response = await this.client!.put(`/issue/${item.externalId}`, updateData);
      
      if (response.status === 204 || response.status === 200) {
        // If item has an assignee, update assignment
        if (item.assigneeId) {
          try {
            await this.assignIssue(item.externalId, item.assigneeId);
          } catch (assignError) {
            this.logger.warn(`Couldn't assign JIRA issue ${item.externalId}: ${assignError instanceof Error ? assignError.message : 'Unknown error'}`);
          }
        }
        
        // Update issue status if needed
        try {
          await this.updateIssueStatus(item.externalId, item.status);
        } catch (statusError) {
          this.logger.warn(`Couldn't update JIRA issue status: ${statusError instanceof Error ? statusError.message : 'Unknown error'}`);
        }
        
        this.logger.info(`Updated JIRA issue ${item.externalId} for action item ${item.id}`);
        return true;
      }
      
      return false;
    } catch (error) {
      this.logger.error(`Failed to update JIRA issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }
  
  /**
   * Get JIRA issue by key
   */
  async getItem(externalId: string): Promise<ActionItemData | null> {
    try {
      await this.ensureInitialized();
      
      const response = await this.client!.get(`/issue/${externalId}`);
      
      if (response.status === 200) {
        const issue = response.data;
        
        // Convert JIRA data to our format
        return this.convertJiraIssueToActionItem(issue);
      }
      
      return null;
    } catch (error) {
      this.logger.error(`Failed to get JIRA issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  }
  
  /**
   * List issues from JIRA project
   */
  async listItems(options?: any): Promise<ActionItemData[]> {
    try {
      await this.ensureInitialized();
      
      // Build JQL query
      const jql = `project = ${this.credentials.projectKey} ORDER BY updated DESC`;
      
      const response = await this.client!.get('/search', {
        params: {
          jql,
          maxResults: options?.maxResults || 50,
          fields: 'summary,description,assignee,duedate,status,priority,labels,updated'
        }
      });
      
      if (response.status === 200 && response.data.issues) {
        return response.data.issues.map((issue: any) => this.convertJiraIssueToActionItem(issue));
      }
      
      return [];
    } catch (error) {
      this.logger.error(`Failed to list JIRA issues: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }
  
  /**
   * Delete a JIRA issue
   */
  async deleteItem(externalId: string): Promise<boolean> {
    try {
      await this.ensureInitialized();
      
      const response = await this.client!.delete(`/issue/${externalId}`);
      return response.status === 204 || response.status === 200;
    } catch (error) {
      this.logger.error(`Failed to delete JIRA issue: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }
  
  /**
   * Assign a JIRA issue to a user
   */
  private async assignIssue(issueKey: string, accountId: string): Promise<boolean> {
    try {
      const response = await this.client!.put(`/issue/${issueKey}/assignee`, {
        accountId
      });
      
      return response.status === 204 || response.status === 200;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Update JIRA issue status
   */
  private async updateIssueStatus(issueKey: string, status: ActionItemStatus): Promise<boolean> {
    try {
      // Get available transitions for the issue
      const transitionsResponse = await this.client!.get(`/issue/${issueKey}/transitions`);
      const transitions = transitionsResponse.data.transitions || [];
      
      // Find transition ID that matches our desired status
      const targetStatusName = STATUS_MAP[status];
      const transition = transitions.find((t: any) => t.to.name === targetStatusName);
      
      if (!transition) {
        this.logger.warn(`No transition found for status ${status} on issue ${issueKey}`);
        return false;
      }
      
      // Execute the transition
      const response = await this.client!.post(`/issue/${issueKey}/transitions`, {
        transition: {
          id: transition.id
        }
      });
      
      return response.status === 204 || response.status === 200;
    } catch (error) {
      throw error;
    }
  }
  
  /**
   * Convert JIRA issue to ActionItemData format
   */
  private convertJiraIssueToActionItem(issue: any): ActionItemData {
    // Map JIRA priority to our priority enum
    let priority: ActionItemPriority | undefined;
    if (issue.fields?.priority?.id) {
      const priorityId = issue.fields.priority.id;
      for (const [key, value] of Object.entries(PRIORITY_MAP)) {
        if (value === priorityId) {
          priority = key as ActionItemPriority;
          break;
        }
      }
    }
    
    // Map JIRA status to our status enum
    let status = ActionItemStatus.PENDING;
    if (issue.fields?.status?.name) {
      const statusName = issue.fields.status.name;
      for (const [key, value] of Object.entries(STATUS_MAP)) {
        if (value === statusName) {
          status = key as ActionItemStatus;
          break;
        }
      }
    }
    
    // Parse due date if present
    let dueDate: Date | null = null;
    if (issue.fields?.duedate) {
      try {
        dueDate = new Date(issue.fields.duedate);
      } catch (e) {
        // Invalid date, leave as null
      }
    }
    
    // Extract description text from JIRA's Atlassian Document Format
    let description = '';
    if (issue.fields?.description?.content) {
      description = this.extractTextFromADF(issue.fields.description);
    }
    
    return {
      id: `jira-${issue.id}`,
      externalId: issue.key,
      title: issue.fields?.summary || '',
      description,
      assigneeId: issue.fields?.assignee?.accountId,
      assigneeName: issue.fields?.assignee?.displayName,
      dueDate,
      priority,
      status,
      labels: issue.fields?.labels || [],
      meetingId: '', // Not available from JIRA
      externalUrl: `${this.credentials.baseUrl}/browse/${issue.key}`,
      lastSyncedAt: new Date(),
      platform: IntegrationPlatform.JIRA
    };
  }
  
  /**
   * Extract plain text from Atlassian Document Format (ADF)
   */
  private extractTextFromADF(doc: any): string {
    if (!doc || !doc.content) {
      return '';
    }
    
    let result = '';
    
    // Recursive function to extract text
    const extractText = (node: any): void => {
      if (node.text) {
        result += node.text;
      }
      
      if (node.content) {
        for (const child of node.content) {
          extractText(child);
        }
        
        // Add paragraph breaks
        if (node.type === 'paragraph') {
          result += '\n';
        }
      }
    };
    
    for (const node of doc.content) {
      extractText(node);
    }
    
    return result.trim();
  }
  
  /**
   * Make sure the adapter is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      const success = await this.initialize();
      if (!success) {
        throw new Error('Failed to initialize JIRA adapter');
      }
    }
  }
} 