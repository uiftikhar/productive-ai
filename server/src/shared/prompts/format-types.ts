/**
 * Response format types for the instruction templates
 */

/**
 * Valid response format types for LLM responses
 */
export enum ResponseFormatType {
  /**
   * Free text response
   */
  TEXT = 'TEXT',
  
  /**
   * JSON object response
   */
  JSON_OBJECT = 'JSON_OBJECT',
  
  /**
   * JSON array response
   */
  JSON_ARRAY = 'JSON_ARRAY',
  
  /**
   * Markdown formatted response
   */
  MARKDOWN = 'MARKDOWN',
  
  /**
   * CSV formatted response
   */
  CSV = 'CSV'
}

/**
 * Types of response content structure
 */
export enum ContentStructureType {
  /**
   * Structured as a list of items
   */
  LIST = 'LIST',
  
  /**
   * Structured as a hierarchical tree
   */
  TREE = 'TREE',
  
  /**
   * Structured as a table
   */
  TABLE = 'TABLE',
  
  /**
   * Structured as key-value pairs
   */
  KEY_VALUE = 'KEY_VALUE',
  
  /**
   * Free-form structure
   */
  FREE_FORM = 'FREE_FORM'
}

/**
 * Configuration for response format
 */
export interface ResponseFormatConfig {
  /**
   * The type of response format
   */
  type: ResponseFormatType;
  
  /**
   * The structure of the content
   */
  structure?: ContentStructureType;
  
  /**
   * Schema for JSON responses
   */
  schema?: any;
  
  /**
   * Additional format-specific options
   */
  options?: Record<string, any>;
} 