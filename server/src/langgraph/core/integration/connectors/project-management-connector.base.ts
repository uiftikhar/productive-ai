import { 
  IntegrationType, 
  IntegrationConnectorConfig, 
  IntegrationCapability, 
  IntegrationError,
  IntegrationErrorType
} from '../integration-framework';
import { BaseConnector } from './base-connector';

/**
 * Project status representation
 */
export interface ProjectStatus {
  id: string;
  name: string;
  description?: string;
  category: 'not_started' | 'in_progress' | 'blocked' | 'completed' | 'cancelled' | 'custom';
  color?: string;
}

/**
 * Project item representation (task, story, epic, etc.)
 */
export interface ProjectItem {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority?: 'lowest' | 'low' | 'medium' | 'high' | 'highest';
  assignees?: string[];
  tags?: string[];
  dueDate?: Date;
  createdDate: Date;
  updatedDate: Date;
  creator?: string;
  parentId?: string;
  metadata?: Record<string, any>;
  url?: string;
}

/**
 * Project representation
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  key?: string;
  createdDate: Date;
  updatedDate: Date;
  statuses: ProjectStatus[];
  url?: string;
  metadata?: Record<string, any>;
}

/**
 * Common capabilities for project management integrations
 */
export enum ProjectManagementCapability {
  LIST_PROJECTS = 'list_projects',
  GET_PROJECT = 'get_project',
  CREATE_PROJECT = 'create_project',
  LIST_PROJECT_ITEMS = 'list_project_items',
  GET_PROJECT_ITEM = 'get_project_item',
  CREATE_PROJECT_ITEM = 'create_project_item',
  UPDATE_PROJECT_ITEM = 'update_project_item',
  DELETE_PROJECT_ITEM = 'delete_project_item',
  SEARCH_PROJECT_ITEMS = 'search_project_items',
  LIST_PROJECT_STATUSES = 'list_project_statuses',
  GET_PROJECT_METRICS = 'get_project_metrics'
}

/**
 * Configuration for project management connectors
 */
export interface ProjectManagementConnectorConfig extends IntegrationConnectorConfig {
  /**
   * Default project to use when not specified
   */
  defaultProjectId?: string;
}

/**
 * Abstract base class for project management integrations
 */
export abstract class ProjectManagementConnector extends BaseConnector<IntegrationType.PROJECT_MANAGEMENT> {
  protected readonly defaultProjectId?: string;
  
  constructor(config: ProjectManagementConnectorConfig) {
    super(IntegrationType.PROJECT_MANAGEMENT, config);
    this.defaultProjectId = config.defaultProjectId;
  }
  
  /**
   * Get common project management capabilities
   */
  public getCapabilities(): IntegrationCapability[] {
    return [
      {
        id: ProjectManagementCapability.LIST_PROJECTS,
        name: 'List Projects',
        description: 'Get list of available projects',
        type: IntegrationType.PROJECT_MANAGEMENT
      },
      {
        id: ProjectManagementCapability.GET_PROJECT,
        name: 'Get Project',
        description: 'Get details of a specific project',
        type: IntegrationType.PROJECT_MANAGEMENT
      },
      {
        id: ProjectManagementCapability.LIST_PROJECT_ITEMS,
        name: 'List Project Items',
        description: 'List items (tasks, stories, etc.) from a project',
        type: IntegrationType.PROJECT_MANAGEMENT
      },
      {
        id: ProjectManagementCapability.GET_PROJECT_ITEM,
        name: 'Get Project Item',
        description: 'Get details of a specific project item',
        type: IntegrationType.PROJECT_MANAGEMENT
      },
      {
        id: ProjectManagementCapability.CREATE_PROJECT_ITEM,
        name: 'Create Project Item',
        description: 'Create a new item in a project',
        type: IntegrationType.PROJECT_MANAGEMENT
      },
      {
        id: ProjectManagementCapability.UPDATE_PROJECT_ITEM,
        name: 'Update Project Item',
        description: 'Update an existing item in a project',
        type: IntegrationType.PROJECT_MANAGEMENT
      }
    ];
  }
  
  /**
   * Execute a project management capability
   */
  public async executeCapability<TParams = any, TResult = any>(
    capabilityId: string,
    params: TParams
  ): Promise<TResult> {
    this.ensureConnected();
    
    switch (capabilityId) {
      case ProjectManagementCapability.LIST_PROJECTS:
        return this.listProjects() as unknown as TResult;
        
      case ProjectManagementCapability.GET_PROJECT:
        return this.getProject(params as unknown as { projectId: string }) as unknown as TResult;
        
      case ProjectManagementCapability.LIST_PROJECT_ITEMS:
        return this.listProjectItems(params as unknown as { 
          projectId?: string, 
          filter?: Record<string, any>
        }) as unknown as TResult;
        
      case ProjectManagementCapability.GET_PROJECT_ITEM:
        return this.getProjectItem(params as unknown as { 
          projectId?: string, 
          itemId: string 
        }) as unknown as TResult;
        
      case ProjectManagementCapability.CREATE_PROJECT_ITEM:
        return this.createProjectItem(params as unknown as { 
          projectId?: string, 
          item: Partial<ProjectItem> 
        }) as unknown as TResult;
        
      case ProjectManagementCapability.UPDATE_PROJECT_ITEM:
        return this.updateProjectItem(params as unknown as { 
          projectId?: string, 
          itemId: string,
          updates: Partial<ProjectItem> 
        }) as unknown as TResult;
        
      default:
        throw new IntegrationError(
          `Capability not supported: ${capabilityId}`,
          IntegrationErrorType.INVALID_REQUEST,
          {
            context: {
              capabilityId,
              availableCapabilities: this.getCapabilities().map(c => c.id)
            }
          }
        );
    }
  }
  
  /**
   * Get project ID, using default if not provided
   */
  protected getProjectId(projectId?: string): string {
    const resolvedProjectId = projectId || this.defaultProjectId;
    if (!resolvedProjectId) {
      throw new IntegrationError(
        'Project ID is required but was not provided and no default is configured',
        IntegrationErrorType.INVALID_REQUEST
      );
    }
    return resolvedProjectId;
  }
  
  /**
   * List available projects
   */
  public abstract listProjects(): Promise<Project[]>;
  
  /**
   * Get details of a specific project
   */
  public abstract getProject(params: { projectId: string }): Promise<Project>;
  
  /**
   * List items in a project
   */
  public abstract listProjectItems(params: { 
    projectId?: string, 
    filter?: Record<string, any> 
  }): Promise<ProjectItem[]>;
  
  /**
   * Get a specific project item
   */
  public abstract getProjectItem(params: { 
    projectId?: string, 
    itemId: string 
  }): Promise<ProjectItem>;
  
  /**
   * Create a new project item
   */
  public abstract createProjectItem(params: { 
    projectId?: string, 
    item: Partial<ProjectItem> 
  }): Promise<ProjectItem>;
  
  /**
   * Update an existing project item
   */
  public abstract updateProjectItem(params: { 
    projectId?: string, 
    itemId: string,
    updates: Partial<ProjectItem> 
  }): Promise<ProjectItem>;
  
  /**
   * Delete a project item
   */
  public abstract deleteProjectItem(params: { 
    projectId?: string, 
    itemId: string 
  }): Promise<boolean>;
} 