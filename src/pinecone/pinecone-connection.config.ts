export interface PineconeConnectionConfig {
  maxRetries?: number;
  batchSize?: number;
  cacheExpirationMs?: number;
  maxCacheSize?: number;
}

export const DEFAULT_CONFIG: PineconeConnectionConfig = {
  maxRetries: 3,
  batchSize: 100,
  cacheExpirationMs: 30 * 60 * 1000, // 30 minutes
  maxCacheSize: 100,
};