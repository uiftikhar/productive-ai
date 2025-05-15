import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class StorageService {
  constructor(private readonly configService: ConfigService) {
    // Ensure storage directories exist
    this.initializeStorageFolders();
  }

  private async initializeStorageFolders(): Promise<void> {
    const storageConfig = this.configService.get('storage');
    
    // Create all required directories
    await this.ensureDir(storageConfig.fileStoragePath);
    await this.ensureDir(storageConfig.transcriptsPath);
    await this.ensureDir(storageConfig.meetingsPath);
    await this.ensureDir(storageConfig.teamsPath);
    await this.ensureDir(storageConfig.resultsPath);
    await this.ensureDir(storageConfig.sessionsPath);
    await this.ensureDir(storageConfig.memoryPath);
  }

  private async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch (error) {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  async saveFile(filePath: string, content: string | Buffer): Promise<void> {
    await this.ensureDir(path.dirname(filePath));
    await fs.writeFile(filePath, content);
  }

  async readFile(filePath: string): Promise<Buffer> {
    return fs.readFile(filePath);
  }

  async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, which is fine for delete operation
    }
  }

  async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async listFiles(dirPath: string): Promise<string[]> {
    try {
      return await fs.readdir(dirPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        await this.ensureDir(dirPath);
        return [];
      }
      throw error;
    }
  }

  getTranscriptsPath(): string {
    const path = this.configService.get<string>('storage.transcriptsPath');
    return path || '';
  }

  getMeetingsPath(): string {
    const path = this.configService.get<string>('storage.meetingsPath');
    return path || '';
  }

  getTeamsPath(): string {
    const path = this.configService.get<string>('storage.teamsPath');
    return path || '';
  }

  getResultsPath(): string {
    const path = this.configService.get<string>('storage.resultsPath');
    return path || '';
  }

  getSessionsPath(): string {
    const path = this.configService.get<string>('storage.sessionsPath');
    return path || '';
  }

  getMemoryPath(): string {
    const path = this.configService.get<string>('storage.memoryPath');
    return path || '';
  }
} 