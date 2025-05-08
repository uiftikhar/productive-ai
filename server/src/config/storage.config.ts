import * as path from 'path';

/**
 * Storage path configuration
 */
const STORAGE_BASE_DIR = process.env.STORAGE_DIR || path.join(process.cwd(), 'data', 'storage');

/**
 * Storage configuration
 */
export const storageConfig = {
  // Base storage directory
  baseDir: STORAGE_BASE_DIR,
  
  // Session storage
  sessions: {
    // Directory for session data
    dir: path.join(STORAGE_BASE_DIR, 'sessions'),
    // Default expiration time - 24 hours
    expirationTime: 24 * 60 * 60 * 1000,
  },
  
  // Meeting analysis storage
  meetingAnalysis: {
    // Directory for meeting analysis data
    dir: path.join(STORAGE_BASE_DIR, 'meeting-analysis'),
    // Default expiration time - 7 days
    expirationTime: 7 * 24 * 60 * 60 * 1000,
  },
  
  // Graph state storage
  graphState: {
    // Directory for graph state data
    dir: path.join(STORAGE_BASE_DIR, 'graph-state'),
    // Default expiration time - 7 days
    expirationTime: 7 * 24 * 60 * 60 * 1000,
  },
  
  // Team storage
  teams: {
    // Directory for team data
    dir: path.join(STORAGE_BASE_DIR, 'teams'),
    // Default expiration time - 30 days
    expirationTime: 30 * 24 * 60 * 60 * 1000,
  },
  
  // Transcripts storage
  transcripts: {
    // Directory for transcript data
    dir: path.join(STORAGE_BASE_DIR, 'transcripts'),
    // Default expiration time - 30 days
    expirationTime: 30 * 24 * 60 * 60 * 1000,
  },
  
  // Default compression settings
  compression: {
    // Enable compression by default
    enabled: true,
  },
};

/**
 * Initialize storage directories
 */
export function initializeStorage(): void {
  const fs = require('fs');
  
  // Create base directory if it doesn't exist
  if (!fs.existsSync(storageConfig.baseDir)) {
    fs.mkdirSync(storageConfig.baseDir, { recursive: true });
  }
  
  // Create subdirectories
  [
    storageConfig.sessions.dir,
    storageConfig.meetingAnalysis.dir,
    storageConfig.graphState.dir,
    storageConfig.teams.dir,
    storageConfig.transcripts.dir,
  ].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
  
  console.log(`Storage directories initialized at: ${storageConfig.baseDir}`);
} 