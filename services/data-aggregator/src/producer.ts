import dotenv from 'dotenv';
import {
  tokenAggregationQueue,
  getQueueMetrics,
  closeQueue,
  createLogger,
  type TokenAggregationJobData,
} from '@eterna/redis-client';

dotenv.config();

const logger = createLogger('aggregator-producer');

const SCHEDULE_INTERVAL = parseInt(
  process.env.SCHEDULE_INTERVAL || '30000',
  10
); // Default: 30 seconds
let jobCounter = 0;
let schedulerInterval: NodeJS.Timeout | null = null;

async function scheduleTokenAggregation(): Promise<void> {
  try {
    const jobData: TokenAggregationJobData = {
      jobId: `agg-${Date.now()}-${++jobCounter}`,
      timestamp: Date.now(),
      triggeredBy: 'scheduled',
    };

    const job = await tokenAggregationQueue.add('fetch-token-data', jobData, {
      priority: 1,
      jobId: jobData.jobId,
    });

    logger.info(
      { jobId: job.id, timestamp: new Date(jobData.timestamp).toISOString() },
      'Scheduled job'
    );

    if (jobCounter % 10 === 0) {
      const metrics = await getQueueMetrics(tokenAggregationQueue);
      logger.info({ metrics }, 'Queue metrics');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to schedule job');
  }
}

async function startProducer(): Promise<void> {
  logger.info(
    {
      scheduleIntervalMs: SCHEDULE_INTERVAL,
      scheduleIntervalSec: SCHEDULE_INTERVAL / 1000,
      redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
      queueName: tokenAggregationQueue.name,
    },
    'Token Aggregation Producer starting'
  );

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const metrics = await getQueueMetrics(tokenAggregationQueue);
  logger.info({ metrics }, 'Initial queue state');

  logger.info('Scheduling initial job');
  await scheduleTokenAggregation();

  schedulerInterval = setInterval(scheduleTokenAggregation, SCHEDULE_INTERVAL);

  logger.info('Producer is now running and scheduling jobs');
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutting down producer gracefully');

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logger.info('Stopped job scheduler');
  }

  await closeQueue(tokenAggregationQueue);
  logger.info('Closed queue connection');

  logger.info('Producer shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startProducer().catch((error) => {
  logger.fatal({ error }, 'Fatal error during producer startup');
  process.exit(1);
});
