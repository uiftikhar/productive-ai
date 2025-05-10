import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../logger/logger.interface';
import { ConsoleLogger } from '../logger/console-logger';

/**
 * Configuration options for FileStorageAdapter
 */
export interface StorageConfig {
  storageDir: string;
  expirationTime?: number; // in milliseconds
  compressionEnabled?: boolean;
  logger?: Logger;
}

/**
 * Stored session data structure
 */
export interface StoredSession {
  state: any;
  timestamp: number;
  expiresAt: number;
  metadata?: Record<string, any>;
}

/**
 * File-based storage adapter for persisting graph state and sessions
 */
export class FileStorageAdapter {
  private config: StorageConfig;
  private logger: Logger;
  private gzip = promisify(zlib.gzip);
  private gunzip = promisify(zlib.gunzip);

  /**
   * Create a new file storage adapter
   */
  constructor(config: StorageConfig) {
    this.config = {
      expirationTime: 24 * 60 * 60 * 1000, // 24 hours default
      compressionEnabled: true,
      ...config
    };
    
    this.logger = config.logger || new ConsoleLogger();
    
    // Ensure storage directory exists
    if (!fs.existsSync(this.config.storageDir)) {
      fs.mkdirSync(this.config.storageDir, { recursive: true });
      this.logger.info(`Created storage directory: ${this.config.storageDir}`);
    }
  }

  /**
   * Save state to a file
   */
  async saveState(sessionId: string, state: any, metadata?: Record<string, any>): Promise<void> {
    const filePath = path.join(this.config.storageDir, `${sessionId}.json`);
    const data: StoredSession = {
      state,
      timestamp: Date.now(),
      expiresAt: Date.now() + this.config.expirationTime!,
      metadata
    };
    
    try {
      const serializedData = JSON.stringify(data);
      const content = this.config.compressionEnabled
        ? await this.compress(serializedData)
        : serializedData;
        
      await fs.promises.writeFile(filePath, content);
      
      this.logger.debug(`Saved state for session ${sessionId}`, {
        filePath,
        compressed: this.config.compressionEnabled,
        size: content.length
      });
    } catch (error) {
      this.logger.error(`Failed to save state for session ${sessionId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Load state from a file
   */
  async loadState(sessionId: string): Promise<any> {
    const filePath = path.join(this.config.storageDir, `${sessionId}.json`);
    
    try {
      if (!fs.existsSync(filePath)) {
        this.logger.debug(`No state file found for session ${sessionId}`);
        return null;
      }
      
      const content = await fs.promises.readFile(filePath, this.config.compressionEnabled ? 'binary' : 'utf8');
      
      const serializedData = this.config.compressionEnabled
        ? await this.decompress(content)
        : content;
      
      const data: StoredSession = JSON.parse(serializedData);
        
      // Check if expired
      if (data.expiresAt < Date.now()) {
        this.logger.debug(`Session ${sessionId} expired`, {
          expiresAt: new Date(data.expiresAt).toISOString(),
          now: new Date().toISOString()
        });
        await this.deleteState(sessionId);
        return null;
      }
      
      this.logger.debug(`Loaded state for session ${sessionId}`, {
        timestamp: new Date(data.timestamp).toISOString(),
        expiresAt: new Date(data.expiresAt).toISOString()
      });
      
      return data.state;
    } catch (error) {
      this.logger.error(`Failed to load state for session ${sessionId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Update session expiration time
   */
  async extendSession(sessionId: string, extensionTime?: number): Promise<boolean> {
    const filePath = path.join(this.config.storageDir, `${sessionId}.json`);
    
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }
      
      const content = await fs.promises.readFile(filePath, this.config.compressionEnabled ? 'binary' : 'utf8');
      
      const serializedData = this.config.compressionEnabled
        ? await this.decompress(content)
        : content;
      
      const data: StoredSession = JSON.parse(serializedData);
      
      // Update expiration time
      data.expiresAt = Date.now() + (extensionTime || this.config.expirationTime!);
      
      const updatedContent = this.config.compressionEnabled
        ? await this.compress(JSON.stringify(data))
        : JSON.stringify(data);
        
      await fs.promises.writeFile(filePath, updatedContent);
      
      this.logger.debug(`Extended session ${sessionId}`, {
        newExpiresAt: new Date(data.expiresAt).toISOString()
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to extend session ${sessionId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Delete a session state file
   */
  async deleteState(sessionId: string): Promise<boolean> {
    const filePath = path.join(this.config.storageDir, `${sessionId}.json`);
    
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }
      
      await fs.promises.unlink(filePath);
      
      this.logger.debug(`Deleted state for session ${sessionId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete state for session ${sessionId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * List all active sessions
   */
  async listSessions(): Promise<string[]> {
    try {
      const files = await fs.promises.readdir(this.config.storageDir);
      const sessionIds = files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
      
      return sessionIds;
    } catch (error) {
      this.logger.error('Failed to list sessions', {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Clean expired sessions
   */
  async cleanExpiredSessions(): Promise<number> {
    try {
      const sessionIds = await this.listSessions();
      let removedCount = 0;
      
      for (const sessionId of sessionIds) {
        const filePath = path.join(this.config.storageDir, `${sessionId}.json`);
        const content = await fs.promises.readFile(filePath, this.config.compressionEnabled ? 'binary' : 'utf8');
        
        const serializedData = this.config.compressionEnabled
          ? await this.decompress(content)
          : content;
        
        const data: StoredSession = JSON.parse(serializedData);
        
        if (data.expiresAt < Date.now()) {
          await this.deleteState(sessionId);
          removedCount++;
        }
      }
      
      this.logger.info(`Cleaned up ${removedCount} expired sessions`);
      return removedCount;
    } catch (error) {
      this.logger.error('Failed to clean expired sessions', {
        error: error instanceof Error ? error.message : String(error)
      });
      return 0;
    }
  }

  /**
   * Compress data using gzip
   */
  private async compress(data: string): Promise<string> {
    try {
      const buffer = Buffer.from(data, 'utf8');
      const compressed = await this.gzip(buffer);
      return compressed.toString('base64');
    } catch (error) {
      this.logger.error('Compression failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Decompress data using gunzip
   */
  private async decompress(data: string | Buffer): Promise<string> {
    try {
      const buffer = typeof data === 'string' 
        ? Buffer.from(data, 'base64')
        : data;
      
      const decompressed = await this.gunzip(buffer);
      return decompressed.toString('utf8');
    } catch (error) {
      this.logger.error('Decompression failed', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Save JSON data to a categorized file
   */
  async saveJsonData(category: string, fileId: string, data: any): Promise<void> {
    // Ensure category directory exists
    const categoryDir = path.join(this.config.storageDir, category);
    if (!fs.existsSync(categoryDir)) {
      fs.mkdirSync(categoryDir, { recursive: true });
    }
    
    const filePath = path.join(categoryDir, `${fileId}.json`);
    
    try {
      const serializedData = JSON.stringify(data, null, 2);
      await fs.promises.writeFile(filePath, serializedData);
      
      this.logger.debug(`Saved JSON data to ${category}/${fileId}`, {
        filePath,
        size: serializedData.length
      });
    } catch (error) {
      this.logger.error(`Failed to save JSON data to ${category}/${fileId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Load JSON data from a categorized file
   */
  async loadJsonData(category: string, fileId: string): Promise<any> {
    const categoryDir = path.join(this.config.storageDir, category);
    const filePath = path.join(categoryDir, `${fileId}.json`);
    
    try {
      if (!fs.existsSync(filePath)) {
        this.logger.debug(`No JSON file found at ${category}/${fileId}`);
        return null;
      }
      
      const content = await fs.promises.readFile(filePath, 'utf8');
      
      const data = JSON.parse(content);
      
      this.logger.debug(`Loaded JSON data from ${category}/${fileId}`);
      
      return data;
    } catch (error) {
      this.logger.error(`Failed to load JSON data from ${category}/${fileId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * List files in a category directory
   */
  async listFiles(category: string): Promise<string[]> {
    const categoryDir = path.join(this.config.storageDir, category);
    
    try {
      if (!fs.existsSync(categoryDir)) {
        return [];
      }
      
      const files = await fs.promises.readdir(categoryDir);
      const fileIds = files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
      
      return fileIds;
    } catch (error) {
      this.logger.error(`Failed to list files in category ${category}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Delete a file in a category directory
   */
  async deleteFile(category: string, fileId: string): Promise<boolean> {
    const categoryDir = path.join(this.config.storageDir, category);
    const filePath = path.join(categoryDir, `${fileId}.json`);
    
    try {
      if (!fs.existsSync(filePath)) {
        return false;
      }
      
      await fs.promises.unlink(filePath);
      
      this.logger.debug(`Deleted file ${category}/${fileId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to delete file ${category}/${fileId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Save text data to a file
   * 
   * @param directory Directory to save in
   * @param id ID to use for the file name
   * @param data Text content to save
   * @returns Promise that resolves when the data is saved
   */
  async saveTextData(directory: string, id: string, data: string): Promise<void> {
    const dirPath = path.join(this.config.storageDir, directory);
    
    // Ensure directory exists
    await fs.promises.mkdir(dirPath, { recursive: true });
    
    // Save the file
    const filePath = path.join(dirPath, id);
    await fs.promises.writeFile(filePath, data, 'utf8');
  }
} 