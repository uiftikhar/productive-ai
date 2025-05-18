import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

/**
 * Service for managing and storing visualization event history for sessions
 */
@Injectable()
export class SessionHistoryService {
  private readonly logger = new Logger(SessionHistoryService.name);
  private readonly maxEventsPerSession: number;
  private readonly eventTtlSeconds: number;

  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly configService: ConfigService
  ) {
    this.maxEventsPerSession = this.configService.get<number>('VISUALIZATION_MAX_EVENTS_PER_SESSION', 1000);
    this.eventTtlSeconds = this.configService.get<number>('VISUALIZATION_EVENT_TTL_SECONDS', 86400); // 24 hours
    this.logger.log(`Session history service initialized with max ${this.maxEventsPerSession} events per session`);
  }

  /**
   * Add an event to a session's history
   * 
   * @param sessionId The session ID
   * @param event The event to add
   * @returns The updated list of events
   */
  async addEvent(sessionId: string, event: any): Promise<any[]> {
    if (!sessionId) {
      this.logger.warn('Attempted to add event to session with no ID');
      return [];
    }

    const cacheKey = this.getSessionCacheKey(sessionId);
    const events = await this.getSessionEvents(sessionId);
    
    // Add the new event with timestamp if not already present
    events.push({
      ...event,
      timestamp: event.timestamp || Date.now()
    });
    
    // Keep only the most recent events if we exceed max
    if (events.length > this.maxEventsPerSession) {
      events.splice(0, events.length - this.maxEventsPerSession);
    }
    
    await this.cacheManager.set(
      cacheKey,
      events,
      this.eventTtlSeconds 
    );
    
    return events;
  }
  
  /**
   * Get all events for a session
   * 
   * @param sessionId The session ID
   * @returns Array of events
   */
  async getSessionEvents(sessionId: string): Promise<any[]> {
    if (!sessionId) {
      return [];
    }
    
    const cacheKey = this.getSessionCacheKey(sessionId);
    const events = await this.cacheManager.get<any[]>(cacheKey);
    return events || [];
  }
  
  /**
   * Clear all events for a session
   * 
   * @param sessionId The session ID
   */
  async clearSessionEvents(sessionId: string): Promise<void> {
    if (!sessionId) {
      return;
    }
    
    const cacheKey = this.getSessionCacheKey(sessionId);
    await this.cacheManager.del(cacheKey);
    this.logger.debug(`Cleared events for session ${sessionId}`);
  }
  
  /**
   * Get a list of active session IDs
   * 
   * @returns Array of session IDs
   */
  async getActiveSessions(): Promise<string[]> {
    // In a real implementation, this would get keys from the cache with a pattern
    // For now, we'll return an empty array as it depends on the cache implementation
    return [];
  }
  
  /**
   * Get the cache key for a session
   * 
   * @param sessionId The session ID
   * @returns Cache key
   */
  private getSessionCacheKey(sessionId: string): string {
    return `visualization:session:${sessionId}`;
  }

  /**
   * Get all events for a session
   */
  async getEventsForSession(sessionId: string): Promise<any[]> {
    try {
      // Get cached events first
      const cachedEvents = await this.cacheManager.get(`session:${sessionId}:events`);
      if (cachedEvents) {
        this.logger.debug(`Retrieved ${(cachedEvents as any[]).length} events for session ${sessionId} from cache`);
        return cachedEvents as any[];
      }
      
      this.logger.debug(`No cached events found for session ${sessionId}`);
      return [];
    } catch (error) {
      this.logger.error(`Failed to get events for session ${sessionId}: ${error.message}`);
      return [];
    }
  }
} 