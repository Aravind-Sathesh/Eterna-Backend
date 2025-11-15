import Redis from 'ioredis';

export const redisClient = new Redis(
  process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  {
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
  }
);

redisClient.on('connect', () => {
  console.log('Connected to Redis');
});

redisClient.on('ready', () => {
  console.log('Redis client is ready');
});

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

redisClient.on('close', () => {
  console.log('Redis connection closed');
});

redisClient.on('reconnecting', () => {
  console.log('Reconnecting to Redis...');
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
    console.error(`Failed to set cache for key ${key}:`, error);
    return false;
  }
}

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const value = await redisClient.get(key);
    if (!value) return null;
    return JSON.parse(value) as T;
  } catch (error) {
    console.error(`Failed to get cache for key ${key}:`, error);
    return null;
  }
}

export async function deleteCache(key: string): Promise<boolean> {
  try {
    await redisClient.del(key);
    return true;
  } catch (error) {
    console.error(`Failed to delete cache for key ${key}:`, error);
    return false;
  }
}

export function isRedisConnected(): boolean {
  return redisClient.status === 'ready' || redisClient.status === 'connect';
}

export default redisClient;
