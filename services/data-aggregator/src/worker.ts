import dotenv from 'dotenv';
import { Worker, Job } from 'bullmq';
import {
  redisClient,
  tokenAggregationQueue,
  getQueueMetrics,
  closeQueue,
  setCache,
  CACHE_KEYS,
  CACHE_TTL,
  isRedisConnected,
  createLogger,
  type TokenAggregationJobData,
} from '@eterna/redis-client';
import {
  fetchAndProcessTokenData,
  getDataStatistics,
} from './core/dataProcessor';

dotenv.config();

const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '1', 10);
const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}`;
const baseLogger = createLogger('aggregator-worker');
const logger = baseLogger.child({ workerId: WORKER_ID });

let worker: Worker<TokenAggregationJobData> | null = null;
let jobsProcessed = 0;

async function processTokenAggregation(
  job: Job<TokenAggregationJobData>
): Promise<{ success: boolean; tokensProcessed: number }> {
  const startTime = Date.now();
  const runId = ++jobsProcessed;

  logger.info({ jobId: job.id, runId, data: job.data }, 'Starting aggregation');

  try {
    await job.updateProgress(10);

    if (!isRedisConnected()) {
      logger.warn({ jobId: job.id }, 'Redis not connected');
    }

    // Fetch and process token data
    await job.updateProgress(30);
    const tokens = await fetchAndProcessTokenData();

    if (tokens.length === 0) {
      logger.warn({ jobId: job.id }, 'No tokens found, skipping cache update');
      return { success: false, tokensProcessed: 0 };
    }

    await job.updateProgress(70);

    const stats = getDataStatistics(tokens);

    const cachePromises = [];

    cachePromises.push(
      setCache(CACHE_KEYS.TOKENS_LATEST, tokens, CACHE_TTL.TOKENS)
    );

    cachePromises.push(
      setCache(
        CACHE_KEYS.TOKENS_STATS,
        {
          ...stats,
          lastUpdate: new Date().toISOString(),
          runId,
          workerId: WORKER_ID,
          jobId: job.id,
        },
        CACHE_TTL.STATS
      )
    );

    const topByVolume = tokens.slice(0, 50);
    cachePromises.push(
      setCache(CACHE_KEYS.TOKENS_BY_VOLUME, topByVolume, CACHE_TTL.TOKENS)
    );

    cachePromises.push(
      setCache(CACHE_KEYS.LAST_UPDATE, Date.now(), CACHE_TTL.SYSTEM)
    );

    await Promise.all(cachePromises);

    await job.updateProgress(90);

    await redisClient.publish(
      'token-updates',
      JSON.stringify({
        status: 'updated',
        runId,
        workerId: WORKER_ID,
        jobId: job.id,
        timestamp: Date.now(),
        tokensCount: tokens.length,
      })
    );

    await job.updateProgress(100);

    const duration = Date.now() - startTime;

    logger.info(
      {
        jobId: job.id,
        durationMs: duration,
        totalTokens: stats.total,
        dexScreener: stats.bySource.dexscreener,
        geckoTerminal: stats.bySource.geckoterminal,
        avgVolume: stats.avgVolume,
        avgPrice: stats.avgPrice,
        cachedTokens: tokens.length,
      },
      'Job completed successfully'
    );

    return { success: true, tokensProcessed: tokens.length };
  } catch (error) {
    logger.error(
      { error, jobId: job.id, stack: (error as Error).stack },
      'Error during aggregation'
    );
    throw error; // Trigger BullMQ retry mechanism
  }
}

async function startWorker(): Promise<void> {
  logger.info(
    {
      workerId: WORKER_ID,
      concurrency: WORKER_CONCURRENCY,
      redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      queueName: tokenAggregationQueue.name,
    },
    'Token Aggregation Worker starting'
  );

  await new Promise((resolve) => setTimeout(resolve, 1000));

  worker = new Worker<TokenAggregationJobData>(
    tokenAggregationQueue.name,
    async (job) => {
      return await processTokenAggregation(job);
    },
    {
      connection: redisClient,
      concurrency: WORKER_CONCURRENCY,
      limiter: {
        max: 10, // Max 10 jobs
        duration: 60000, // per 60 seconds
      },
    }
  );

  worker.on('completed', async (job, result) => {
    logger.info(
      { jobId: job.id, tokensProcessed: result.tokensProcessed },
      'Job completed'
    );

    if (jobsProcessed % 5 === 0) {
      const metrics = await getQueueMetrics(tokenAggregationQueue);
      logger.info({ metrics }, 'Queue metrics');
    }
  });

  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, attemptsMade: job?.attemptsMade, error: err.message },
      'Job failed'
    );
  });

  worker.on('error', (err) => {
    logger.error({ error: err }, 'Worker error');
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ jobId }, 'Job stalled');
  });

  logger.info('Worker is now running and processing jobs');

  const metrics = await getQueueMetrics(tokenAggregationQueue);
  logger.info({ metrics }, 'Initial queue state');
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down worker gracefully');

  if (worker) {
    logger.info('Closing worker, waiting for active jobs to complete');
    await worker.close();
    logger.info('Worker closed');
  }

  await closeQueue(tokenAggregationQueue);
  logger.info('Closed queue connection');

  logger.info(
    { totalJobsProcessed: jobsProcessed },
    'Worker shutdown complete'
  );
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startWorker().catch((error) => {
  logger.fatal(
    {
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
    },
    'Fatal error during worker startup'
  );
  process.exit(1);
});
