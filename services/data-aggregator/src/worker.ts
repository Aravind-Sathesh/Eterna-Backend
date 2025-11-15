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
  type TokenAggregationJobData,
} from '@eterna/redis-client';
import {
  fetchAndProcessTokenData,
  getDataStatistics,
} from './core/dataProcessor';

dotenv.config();

const WORKER_CONCURRENCY = parseInt(process.env.WORKER_CONCURRENCY || '1', 10);
const WORKER_ID = process.env.WORKER_ID || `worker-${process.pid}`;

let worker: Worker<TokenAggregationJobData> | null = null;
let jobsProcessed = 0;

async function processTokenAggregation(
  job: Job<TokenAggregationJobData>
): Promise<{ success: boolean; tokensProcessed: number }> {
  const startTime = Date.now();
  const runId = ++jobsProcessed;

  console.log(`[${WORKER_ID}] [Job ${job.id}] Starting aggregation...`);
  console.log(`[${WORKER_ID}] [Job ${job.id}] Run #${runId}`);
  console.log(`[${WORKER_ID}] [Job ${job.id}] Data:`, job.data);

  try {
    await job.updateProgress(10);

    if (!isRedisConnected()) {
      console.warn(
        `[${WORKER_ID}] [Job ${job.id}] Warning: Redis not connected`
      );
    }

    // Fetch and process token data
    await job.updateProgress(30);
    const tokens = await fetchAndProcessTokenData();

    if (tokens.length === 0) {
      console.warn(
        `[${WORKER_ID}] [Job ${job.id}] No tokens found. Skipping cache update.`
      );
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

    console.log(`\n[${WORKER_ID}] [Job ${job.id}] Statistics:`);
    console.log(`- Total tokens: ${stats.total}`);
    console.log(`- DexScreener: ${stats.bySource.dexscreener}`);
    console.log(`- GeckoTerminal: ${stats.bySource.geckoterminal}`);
    console.log(
      `- Average 24h volume: $${stats.avgVolume.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })}`
    );
    console.log(
      `- Average price: $${stats.avgPrice.toLocaleString(undefined, {
        maximumFractionDigits: 6,
      })}`
    );
    console.log(`\n[${WORKER_ID}] [Job ${job.id}] Completed in ${duration}ms`);
    console.log(
      `[${WORKER_ID}] [Job ${job.id}] Cached ${tokens.length} tokens to Redis\n`
    );

    return { success: true, tokensProcessed: tokens.length };
  } catch (error) {
    console.error(
      `\n[${WORKER_ID}] [Job ${job.id}] Error during aggregation:`,
      error
    );
    console.error(
      `[${WORKER_ID}] [Job ${job.id}] Stack:`,
      (error as Error).stack
    );
    throw error; // Trigger BullMQ retry mechanism
  }
}

async function startWorker(): Promise<void> {
  console.log('\n🔧 Token Aggregation Worker Starting...\n');
  console.log('Configuration:');
  console.log(`- Worker ID: ${WORKER_ID}`);
  console.log(`- Concurrency: ${WORKER_CONCURRENCY}`);
  console.log(
    `- Redis URL: ${process.env.REDIS_URL || 'redis://127.0.0.1:6379'}`
  );
  console.log(`- Queue name: ${tokenAggregationQueue.name}\n`);

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
    console.log(
      `[${WORKER_ID}] Job ${job.id} completed successfully. Processed ${result.tokensProcessed} tokens.`
    );

    if (jobsProcessed % 5 === 0) {
      const metrics = await getQueueMetrics(tokenAggregationQueue);
      console.log(`[${WORKER_ID}] Queue metrics:`, metrics);
    }
  });

  worker.on('failed', (job, err) => {
    console.error(
      `[${WORKER_ID}] Job ${job?.id} failed after ${job?.attemptsMade} attempts:`,
      err.message
    );
  });

  worker.on('error', (err) => {
    console.error(`[${WORKER_ID}] Worker error:`, err);
  });

  worker.on('stalled', (jobId) => {
    console.warn(`[${WORKER_ID}]  Job ${jobId} stalled`);
  });

  console.log(`Worker ${WORKER_ID} is now running and processing jobs!\n`);
  console.log('Press Ctrl+C to stop the worker.\n');

  // Get initial queue state
  const metrics = await getQueueMetrics(tokenAggregationQueue);
  console.log(`[${WORKER_ID}] Initial queue state:`, metrics, '\n');
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n\n${signal} received. Shutting down worker gracefully...`);

  // Close the worker (will finish current jobs)
  if (worker) {
    console.log(
      `[${WORKER_ID}] Closing worker (waiting for active jobs to complete)...`
    );
    await worker.close();
    console.log(`[${WORKER_ID}] Worker closed`);
  }

  await closeQueue(tokenAggregationQueue);
  console.log(`[${WORKER_ID}] Closed queue connection`);

  console.log(`Worker ${WORKER_ID} shutdown complete.`);
  console.log(`Total jobs processed: ${jobsProcessed}`);
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startWorker().catch((error) => {
  console.error('Fatal error during worker startup:', error);
  process.exit(1);
});
