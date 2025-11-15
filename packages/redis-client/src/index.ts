import Redis from 'ioredis';
import { createLogger } from './logger';

const logger = createLogger('redis-client');

export const redisClient = new Redis(
  process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  {
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: null, // Required for BullMQ blocking operations
  }
);

redisClient.on('connect', () => {
  logger.info('Connected to Redis');
});

redisClient.on('ready', () => {
  logger.info('Redis client is ready');
});

redisClient.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis connection error');
});

redisClient.on('close', () => {
  logger.info('Redis connection closed');
});

redisClient.on('reconnecting', () => {
  logger.info('Reconnecting to Redis');
});

export const CACHE_KEYS = {
  TOKENS_LATEST: 'tokens:latest',
  TOKENS_STATS: 'tokens:stats',
  TOKENS_BY_VOLUME: 'tokens:by_volume',
  LAST_UPDATE: 'system:last_update',
} as const;

export const CACHE_TTL = {
  TOKENS: 30,
  STATS: 60,
  SYSTEM: 300,
} as const;

export async function setCache(
  key: string,
  value: any,
  ttlSeconds?: number
): Promise<boolean> {
  try {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await redisClient.setex(key, ttlSeconds, serialized);
    } else {
      await redisClient.set(key, serialized);
    }
    return true;
  } catch (error) {
    logger.error({ key, error }, 'Failed to set cache');
    return false;
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const value = await redisClient.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    logger.error({ key, error }, 'Failed to get cache');
    return null;
  }
}

export async function deleteCache(key: string): Promise<boolean> {
  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    logger.error({ key, error }, 'Failed to delete cache');
    return false;
  }
}

export function isRedisConnected(): boolean {
  return redisClient.status === 'ready' || redisClient.status === 'connect';
}

// Export queue utilities
export * from './queue';

// Export logger utilities
export * from './logger';

export default redisClient;
