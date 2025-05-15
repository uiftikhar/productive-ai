import { StorageAdapter, StorageOptions, StateFilter } from './storage-adapter.interface';
import { Logger } from '../../../../shared/logger/logger.interface';
import { promises as fs } from 'fs';
import path from 'path';
import { deepMerge } from '../../utils/object-utils';

/**
 * Options for file storage adapter
 */
export interface FileStorageOptions extends StorageOptions {
  /**
   * Directory where files will be stored
   */
  storageDir: string;
  
  /**
   * Logger instance
   */
  logger?: Logger;
  
  /**
   * File extension for stored files (default: .json)
   */
  fileExtension?: string;
  
  /**
   * Enable file locking to prevent race conditions
   */
  enableLocking?: boolean;
  
  /**
   * Lock timeout in milliseconds (default: 5000)
   */
  lockTimeoutMs?: number;
}

/**
 * Metadata stored with each file
 */
interface FileMetadata {
  /**
   * When the file was created
   */
  createdAt: number;
  
  /**
   * When the file was last updated
   */
  updatedAt: number;
  
  /**
   * When the file expires (if TTL is set)
   */
  expiresAt?: number;
  
  /**
   * Version number, incremented on each update
   */
  version: number;
}

/**
 * File storage structure
 */
interface FileData<T = any> {
  /**
   * The actual data
   */
  data: T;
  
  /**
   * Metadata about the file
   */
  metadata: FileMetadata;
}

/**
 * Lock information
 */
interface FileLock {
  /**
   * Process ID that created the lock
   */
  pid: number;
  
  /**
   * When the lock was created
   */
  createdAt: number;
  
  /**
   * When the lock expires
   */
  expiresAt: number;
}

/**
 * File-based storage adapter implementation
 * Provides persistent storage using the local filesystem
 */
export class FileStorageAdapter implements StorageAdapter {
  private options: FileStorageOptions;
  private logger?: Logger;
  private initialized = false;
  private locks: Map<string, NodeJS.Timeout> = new Map();
  
  /**
   * Create a new file storage adapter
   */
  constructor(options: FileStorageOptions) {
    this.options = {
      namespace: 'file-storage',
      keyPrefix: '',
      defaultTtl: 0, // No expiration by default
      fileExtension: '.json',
      enableLocking: true,
      lockTimeoutMs: 5000,
      ...options
    };
    
    if (!this.options.storageDir) {
      throw new Error('FileStorageAdapter requires storageDir option');
    }
    
    this.logger = options.logger;
  }
  
  /**
   * Initialize the storage adapter
   */
  async initialize(): Promise<void> {
    const namespace = this.options.namespace || 'default';
    const storageDir = path.join(this.options.storageDir, namespace);
    
    try {
      // Ensure the directory exists
      await fs.mkdir(storageDir, { recursive: true });
      this.initialized = true;
      this.logger?.debug(`FileStorageAdapter initialized with storage directory: ${storageDir}`);
    } catch (error) {
      this.logger?.error(`Failed to initialize FileStorageAdapter: ${(error as Error).message}`);
      throw new Error(`Failed to initialize file storage: ${(error as Error).message}`);
    }
  }
  
  /**
   * Store data with an optional TTL override
   */
  async set(key: string, data: any, ttl?: number): Promise<void> {
    this.ensureInitialized();
    
    const filePath = this.getFilePath(key);
    const dirPath = path.dirname(filePath);
    
    try {
      this.logger?.info(`Storing data for key: ${key}`, { filePath });
      
      // Ensure the directory exists
      try {
        await fs.mkdir(dirPath, { recursive: true });
      } catch (mkdirError) {
        this.logger?.error(`Failed to create directory for key ${key}:`, {
          error: mkdirError instanceof Error ? mkdirError.message : String(mkdirError),
          stack: mkdirError instanceof Error ? mkdirError.stack : undefined,
          dirPath
        });
        throw new Error(`Failed to create directory: ${mkdirError instanceof Error ? mkdirError.message : String(mkdirError)}`);
      }
      
      const now = Date.now();
      const expiresAt = this.calculateExpiration(ttl);
      
      const fileData: FileData = {
        data,
        metadata: {
          createdAt: now,
          updatedAt: now,
          version: 1,
          ...(expiresAt ? { expiresAt } : {})
        }
      };
      
      let serializedData: string;
      try {
        serializedData = JSON.stringify(fileData, null, 2);
      } catch (jsonError) {
        this.logger?.error(`Failed to serialize data for key ${key}:`, {
          error: jsonError instanceof Error ? jsonError.message : String(jsonError),
          stack: jsonError instanceof Error ? jsonError.stack : undefined,
          dataType: typeof data,
          dataKeys: data && typeof data === 'object' ? Object.keys(data) : null
        });
        throw new Error(`Failed to serialize data: ${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
      }
      
      if (this.options.enableLocking) {
        await this.acquireLock(key);
      }
      
      try {
        // First write to a temporary file then rename it to avoid partial writes
        const tempFilePath = `${filePath}.tmp`;
        
        try {
          await fs.writeFile(tempFilePath, serializedData);
        } catch (writeError) {
          this.logger?.error(`Failed to write temp file for key ${key}:`, {
            error: writeError instanceof Error ? writeError.message : String(writeError),
            stack: writeError instanceof Error ? writeError.stack : undefined,
            tempFilePath,
            serializedLength: serializedData.length
          });
          throw new Error(`Failed to write temp file: ${writeError instanceof Error ? writeError.message : String(writeError)}`);
        }
        
        // Now rename (atomic operation on most file systems)
        try {
          await fs.rename(tempFilePath, filePath);
        } catch (renameError) {
          this.logger?.error(`Failed to rename temp file for key ${key}:`, {
            error: renameError instanceof Error ? renameError.message : String(renameError),
            stack: renameError instanceof Error ? renameError.stack : undefined,
            tempFilePath,
            filePath
          });
          
          // Try a fallback approach - delete and write directly
          try {
            await fs.writeFile(filePath, serializedData);
          } catch (fallbackError) {
            this.logger?.error(`Fallback write also failed for key ${key}:`, {
              error: fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
            });
            throw new Error(`Failed to store data using fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
          }
        }
        
        this.logger?.info(`Successfully stored data for key: ${key}`, { filePath });
        
        // Verify file was created
        try {
          const stats = await fs.stat(filePath);
          this.logger?.debug(`Verified file exists after write: ${key}`, { 
            filePath, 
            size: stats.size,
            modified: stats.mtime 
          });
          
          // Try to read it back to make absolutely sure it's valid
          const fileContent = await fs.readFile(filePath, 'utf-8');
          try {
            JSON.parse(fileContent);
            this.logger?.debug(`Verified file is valid JSON: ${key}`);
          } catch (parseError) {
            this.logger?.error(`File exists but contains invalid JSON: ${key}`, {
              error: parseError instanceof Error ? parseError.message : String(parseError),
              contentPreview: fileContent.substring(0, 200) + '...'
            });
          }
        } catch (verifyError) {
          this.logger?.error(`Failed to verify file creation: ${key}`, { 
            filePath, 
            error: verifyError instanceof Error ? verifyError.message : String(verifyError),
            stack: verifyError instanceof Error ? verifyError.stack : undefined
          });
          
          // Try one more time with direct write
          await fs.writeFile(filePath, serializedData);
          this.logger?.info(`Retry write successful for key: ${key}`);
        }
      } finally {
        if (this.options.enableLocking) {
          await this.releaseLock(key);
        }
      }
    } catch (error) {
      this.logger?.error(`Failed to set data for key ${key}:`, { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        filePath,
        dirPath,
        key,
        dataType: typeof data,
        dataLength: typeof data === 'string' ? data.length : null,
        dataKeys: data && typeof data === 'object' ? Object.keys(data) : null
      });
      throw new Error(`Failed to store data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Retrieve data by key
   */
  async get(key: string): Promise<any | null> {
    this.ensureInitialized();
    
    const filePath = this.getFilePath(key);
    
    try {
      this.logger?.debug(`Retrieving data for key: ${key}`, { filePath });
      
      // Check if file exists first
      try {
        await fs.access(filePath);
      } catch (accessError) {
        this.logger?.debug(`File not found for key: ${key}`, { filePath });
        return null;
      }
      
      // Read file content
      try {
        const fileContent = await fs.readFile(filePath, 'utf-8');
        this.logger?.debug(`Successfully read file for key: ${key}`, { 
          filePath, 
          contentLength: fileContent.length 
        });
        
        // Parse file content
        try {
          const fileData: FileData = JSON.parse(fileContent);
          
          // Check if the data is expired
          if (fileData.metadata.expiresAt && fileData.metadata.expiresAt < Date.now()) {
            this.logger?.debug(`Data expired for key: ${key}`, { 
              filePath, 
              expiresAt: new Date(fileData.metadata.expiresAt).toISOString(),
              now: new Date().toISOString()
            });
            
            // Delete expired file
            try {
              await fs.unlink(filePath);
              this.logger?.debug(`Deleted expired file for key: ${key}`, { filePath });
            } catch (unlinkError) {
              this.logger?.warn(`Failed to delete expired file: ${key}`, { 
                filePath, 
                error: unlinkError instanceof Error ? unlinkError.message : String(unlinkError)
              });
            }
            
            return null;
          }
          
          this.logger?.debug(`Successfully retrieved data for key: ${key}`, { 
            filePath, 
            version: fileData.metadata.version
          });
          
          return fileData.data;
        } catch (parseError) {
          this.logger?.error(`Failed to parse file content for key: ${key}`, { 
            filePath, 
            error: parseError instanceof Error ? parseError.message : String(parseError),
            contentPreview: fileContent.length > 200 ? fileContent.substring(0, 200) + '...' : fileContent
          });
          
          throw new Error(`Failed to parse file content: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
        }
      } catch (readError) {
        if (readError instanceof Error && readError.message.includes('parse')) {
          // Rethrow parsing errors
          throw readError;
        }
        
        this.logger?.error(`Failed to read file for key: ${key}`, { 
          filePath, 
          error: readError instanceof Error ? readError.message : String(readError)
        });
        
        throw new Error(`Failed to read file: ${readError instanceof Error ? readError.message : String(readError)}`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        // File not found errors should return null
        return null;
      }
      
      this.logger?.error(`Error getting data for key ${key}:`, { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        filePath,
        key
      });
      
      throw new Error(`Failed to get data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Update existing data (partial update)
   */
  async update(key: string, partialData: any, ttl?: number): Promise<void> {
    this.ensureInitialized();
    
    const filePath = this.getFilePath(key);
    
    try {
      if (this.options.enableLocking) {
        await this.acquireLock(key);
      }
      
      try {
        // Check if file exists
        try {
          await fs.access(filePath);
        } catch {
          // File doesn't exist, create it instead
          return this.set(key, partialData, ttl);
        }
        
        // Read existing file
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const fileData = JSON.parse(fileContent);
        
        // Check if data has expired
        if (fileData.metadata.expiresAt && fileData.metadata.expiresAt < Date.now()) {
          this.logger?.debug(`Data for key ${key} has expired, creating new data`);
          return this.set(key, partialData, ttl);
        }
        
        // Handle the case where the partialData is a PersistentStateEntry format
        // This is needed for compatibility with PersistentStateManager
        let dataToMerge = partialData;
        let metadataToUse = fileData.metadata;

        // If partialData has metadata field, it's likely a PersistentStateEntry format
        if (partialData.metadata && partialData.data) {
          dataToMerge = partialData.data;
          metadataToUse = {
            ...fileData.metadata,
            version: partialData.metadata.version || (fileData.metadata.version + 1),
            updatedAt: Date.now(),
            ...(partialData.metadata.updatedBy ? { updatedBy: partialData.metadata.updatedBy } : {}),
            ...(partialData.metadata.history ? { history: partialData.metadata.history } : {})
          };
        }
        
        // Merge data
        const now = Date.now();
        const expiresAt = this.calculateExpiration(ttl);
        
        const updatedFileData = {
          data: deepMerge(fileData.data, dataToMerge),
          metadata: {
            ...metadataToUse,
            updatedAt: now,
            version: metadataToUse.version, // Version is already updated if needed
            ...(expiresAt ? { expiresAt } : {})
          }
        };
        
        await fs.writeFile(filePath, JSON.stringify(updatedFileData, null, 2));
        this.logger?.debug(`Successfully updated data for key: ${key}`);
      } finally {
        if (this.options.enableLocking) {
          await this.releaseLock(key);
        }
      }
    } catch (error) {
      this.logger?.error(`Failed to update data for key ${key}: ${(error as Error).message}`);
      throw new Error(`Failed to update data: ${(error as Error).message}`);
    }
  }
  
  /**
   * Delete data by key
   */
  async delete(key: string): Promise<void> {
    this.ensureInitialized();
    
    const filePath = this.getFilePath(key);
    const lockFilePath = this.getLockFilePath(key);
    
    try {
      if (this.options.enableLocking) {
        await this.acquireLock(key);
      }
      
      try {
        // Delete the file
        try {
          await fs.unlink(filePath);
          this.logger?.debug(`Deleted data for key: ${key}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            this.logger?.debug(`No data found to delete for key: ${key}`);
          } else {
            throw error;
          }
        }
        
        // Clean up any lock file
        try {
          await fs.unlink(lockFilePath);
        } catch {
          // Ignore errors when cleaning up lock file
        }
      } finally {
        if (this.options.enableLocking) {
          await this.releaseLock(key);
        }
      }
    } catch (error) {
      this.logger?.error(`Failed to delete data for key ${key}: ${(error as Error).message}`);
      throw new Error(`Failed to delete data: ${(error as Error).message}`);
    }
  }
  
  /**
   * List keys according to filter criteria
   */
  async listKeys(pattern: string | StateFilter): Promise<string[]> {
    this.ensureInitialized();
    
    // Handle string pattern case
    if (typeof pattern === 'string') {
      // For simple string patterns, convert to a filter with keyPrefix
      return this.listKeys({ keyPrefix: pattern });
    }
    
    const filter = pattern as StateFilter;
    const namespace = this.options.namespace || 'default';
    const storageDir = path.join(this.options.storageDir, namespace);
    const keys: string[] = [];
    
    try {
      const allFiles = await this.listAllFiles(storageDir);
      const now = Date.now();
      
      for (const filePath of allFiles) {
        // Skip non-JSON files if the extension is JSON
        if (this.options.fileExtension === '.json' && !filePath.endsWith('.json')) {
          continue;
        }
        
        // Skip lock files
        if (filePath.endsWith('.lock')) {
          continue;
        }
        
        try {
          // Check if file has expired
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const fileData: FileData = JSON.parse(fileContent);
          
          if (fileData.metadata.expiresAt && fileData.metadata.expiresAt < now) {
            // File has expired, delete it
            await fs.unlink(filePath).catch(() => {
              // Ignore errors when cleaning up
            });
            continue;
          }
          
          // Convert file path to key
          const key = this.filePathToKey(filePath);
          if (key) {
            keys.push(key);
          }
        } catch {
          // Skip files that can't be read or parsed
          continue;
        }
      }
      
      // Apply filters
      let filteredKeys = keys;
      
      // Apply key prefix filter
      if (filter.keyPrefix) {
        filteredKeys = filteredKeys.filter(key => 
          key.startsWith(filter.keyPrefix || '')
        );
      }
      
      // Apply custom filter function
      if (filter.filterFn) {
        filteredKeys = filteredKeys.filter(filter.filterFn);
      }
      
      // Apply pagination
      if (filter.offset !== undefined || filter.limit !== undefined) {
        const offset = filter.offset || 0;
        const limit = filter.limit || filteredKeys.length;
        filteredKeys = filteredKeys.slice(offset, offset + limit);
      }
      
      this.logger?.debug(`Listed ${filteredKeys.length} keys matching filter`, { filter });
      return filteredKeys;
    } catch (error) {
      this.logger?.error(`Failed to list keys: ${(error as Error).message}`);
      throw new Error(`Failed to list keys: ${(error as Error).message}`);
    }
  }
  
  /**
   * Clear all data in this adapter's namespace
   */
  async clear(): Promise<void> {
    this.ensureInitialized();
    
    const namespace = this.options.namespace || 'default';
    const storageDir = path.join(this.options.storageDir, namespace);
    
    try {
      const allFiles = await this.listAllFiles(storageDir);
      
      // Delete all files
      const deletePromises = allFiles.map(filePath => 
        fs.unlink(filePath).catch(err => {
          this.logger?.warn(`Failed to delete file ${filePath}: ${err.message}`);
        })
      );
      
      await Promise.all(deletePromises);
      this.logger?.debug(`Cleared ${allFiles.length} files from namespace '${namespace}'`);
    } catch (error) {
      this.logger?.error(`Failed to clear storage: ${(error as Error).message}`);
      throw new Error(`Failed to clear storage: ${(error as Error).message}`);
    }
  }
  
  /**
   * Check if key exists
   */
  async has(key: string): Promise<boolean> {
    this.ensureInitialized();
    
    const filePath = this.getFilePath(key);
    
    try {
      this.logger?.debug(`Checking if key exists: ${key}`, { filePath });
      
      try {
        // Check if file exists
        await fs.access(filePath);
        
        // If we need to check expiration, we should read the file
        if (this.options.defaultTtl !== 0) {
          // Read file to check expiration
          const fileContent = await fs.readFile(filePath, 'utf-8');
          const fileData: FileData = JSON.parse(fileContent);
          
          // Check if the data is expired
          if (fileData.metadata.expiresAt && fileData.metadata.expiresAt < Date.now()) {
            this.logger?.debug(`File exists but data is expired for key: ${key}`, { 
              filePath, 
              expiresAt: new Date(fileData.metadata.expiresAt).toISOString() 
            });
            return false;
          }
        }
        
        this.logger?.debug(`Key exists: ${key}`, { filePath });
        return true;
      } catch (accessError) {
        // If file doesn't exist or can't be accessed
        this.logger?.debug(`Key does not exist: ${key}`, { 
          filePath, 
          error: accessError instanceof Error ? accessError.message : String(accessError)
        });
        return false;
      }
    } catch (error) {
      this.logger?.error(`Error checking if key ${key} exists:`, { 
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        filePath,
        key
      });
      
      // Return false on error to be safe
      return false;
    }
  }
  
  /**
   * Get file path for a key
   */
  private getFilePath(key: string): string {
    // Replace characters that are unsafe in filenames
    const safeKey = this.getSafeFilename(key);
    const prefixedKey = this.options.keyPrefix 
      ? `${this.options.keyPrefix}.${safeKey}`
      : safeKey;
    
    const namespace = this.options.namespace || 'default';
    
    return path.join(
      this.options.storageDir,
      namespace,
      `${prefixedKey}${this.options.fileExtension}`
    );
  }
  
  /**
   * Get lock file path for a key
   */
  private getLockFilePath(key: string): string {
    return `${this.getFilePath(key)}.lock`;
  }
  
  /**
   * Convert a file path to a key
   */
  private filePathToKey(filePath: string): string | null {
    const namespace = this.options.namespace || 'default';
    const ext = this.options.fileExtension || '';
    
    // Get the relative path from the namespace directory
    const storageDir = path.join(this.options.storageDir, namespace);
    if (!filePath.startsWith(storageDir)) {
      return null;
    }
    
    // Extract just the filename without the extension
    let relativePath = filePath.substring(storageDir.length + 1);
    if (relativePath.endsWith(ext)) {
      relativePath = relativePath.substring(0, relativePath.length - ext.length);
    }
    
    // Remove the prefix if it exists
    const prefix = this.options.keyPrefix;
    if (prefix && relativePath.startsWith(`${prefix}.`)) {
      relativePath = relativePath.substring(prefix.length + 1);
    }
    
    // Convert safe filename back to original key format
    return relativePath;
  }
  
  /**
   * Make a filename safe for the filesystem
   */
  private getSafeFilename(name: string): string {
    // Replace unsafe characters with underscores
    return name.replace(/[\/\\?%*:|"<>]/g, '_');
  }
  
  /**
   * Recursively list all files in a directory
   */
  private async listAllFiles(dir: string): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    const files = await Promise.all(entries.map(async entry => {
      const fullPath = path.join(dir, entry.name);
      return entry.isDirectory() 
        ? this.listAllFiles(fullPath)
        : [fullPath];
    }));
    
    return files.flat();
  }
  
  /**
   * Calculate expiration timestamp from TTL
   */
  private calculateExpiration(ttl?: number): number | undefined {
    const effectiveTtl = ttl !== undefined ? ttl : this.options.defaultTtl;
    
    if (!effectiveTtl || effectiveTtl <= 0) {
      return undefined; // No expiration
    }
    
    return Date.now() + (effectiveTtl * 1000);
  }
  
  /**
   * Ensure the adapter is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('FileStorageAdapter is not initialized. Call initialize() first.');
    }
  }
  
  /**
   * Acquire a lock for a key
   */
  private async acquireLock(key: string): Promise<void> {
    if (!this.options.enableLocking) {
      return;
    }
    
    const lockFilePath = this.getLockFilePath(key);
    const lockTimeoutMs = this.options.lockTimeoutMs || 5000;
    const maxRetries = 10;
    const retryDelayMs = 100;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Check if lock file exists
        try {
          const lockData = await fs.readFile(lockFilePath, 'utf-8');
          const lock: FileLock = JSON.parse(lockData);
          
          // Check if lock has expired
          if (lock.expiresAt < Date.now()) {
            // Lock has expired, remove it
            await fs.unlink(lockFilePath).catch(() => {
              // Ignore errors when cleaning up
            });
          } else {
            // Lock is still valid, wait and retry
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            continue;
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            this.logger?.warn(`Error checking lock file: ${(error as Error).message}`);
          }
          // Lock file doesn't exist or is corrupted, we can continue
        }
        
        // Create lock file
        const now = Date.now();
        const lock: FileLock = {
          pid: process.pid,
          createdAt: now,
          expiresAt: now + lockTimeoutMs
        };
        
        await fs.writeFile(lockFilePath, JSON.stringify(lock));
        
        // Set up auto-release timeout
        const timeout = setTimeout(() => {
          this.releaseLock(key).catch(err => {
            this.logger?.warn(`Failed to auto-release lock for ${key}: ${err.message}`);
          });
        }, lockTimeoutMs);
        
        this.locks.set(key, timeout);
        return;
      } catch (error) {
        this.logger?.warn(`Failed to acquire lock (attempt ${attempt + 1}): ${(error as Error).message}`);
        
        if (attempt === maxRetries - 1) {
          throw new Error(`Failed to acquire lock after ${maxRetries} attempts: ${(error as Error).message}`);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
      }
    }
  }
  
  /**
   * Release a lock for a key
   */
  private async releaseLock(key: string): Promise<void> {
    if (!this.options.enableLocking) {
      return;
    }
    
    // Clear the timeout
    const timeout = this.locks.get(key);
    if (timeout) {
      clearTimeout(timeout);
      this.locks.delete(key);
    }
    
    // Remove the lock file
    const lockFilePath = this.getLockFilePath(key);
    try {
      await fs.unlink(lockFilePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.logger?.warn(`Failed to remove lock file: ${(error as Error).message}`);
      }
    }
  }
} 