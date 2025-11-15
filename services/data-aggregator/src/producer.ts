import dotenv from 'dotenv';
import {
  tokenAggregationQueue,
  getQueueMetrics,
  closeQueue,
  type TokenAggregationJobData,
} from '@eterna/redis-client';

dotenv.config();

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

    console.log(
      `[Producer] Scheduled job ${job.id} at ${new Date(
        jobData.timestamp
      ).toISOString()}`
    );

    if (jobCounter % 10 === 0) {
      const metrics = await getQueueMetrics(tokenAggregationQueue);
      console.log('[Producer] Queue metrics:', metrics);
    }
  } catch (error) {
    console.error('[Producer] Failed to schedule job:', error);
  }
}

async function startProducer(): Promise<void> {
  console.log('\nToken Aggregation Producer Starting...\n');
  console.log('Configuration:');
  console.log(
    `- Schedule interval: ${SCHEDULE_INTERVAL}ms (${SCHEDULE_INTERVAL / 1000}s)`
  );
  console.log(
    `- Redis URL: ${process.env.REDIS_URL || 'redis://127.0.0.1:6379'}`
  );
  console.log(`- Queue name: ${tokenAggregationQueue.name}\n`);

  await new Promise((resolve) => setTimeout(resolve, 1000));

  const metrics = await getQueueMetrics(tokenAggregationQueue);
  console.log('[Producer] Initial queue state:', metrics);

  console.log('\n[Producer] Scheduling initial job...\n');
  await scheduleTokenAggregation();

  schedulerInterval = setInterval(scheduleTokenAggregation, SCHEDULE_INTERVAL);

  console.log('Producer is now running and scheduling jobs!\n');
  console.log('Press Ctrl+C to stop the producer.\n');
}

async function shutdown(signal: string): Promise<void> {
  console.log(`\n\n${signal} received. Shutting down producer gracefully...`);

  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[Producer] Stopped job scheduler');
  }

  await closeQueue(tokenAggregationQueue);
  console.log('[Producer] Closed queue connection');

  console.log('Producer shutdown complete.');
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

startProducer().catch((error) => {
  console.error('Fatal error during producer startup:', error);
  process.exit(1);
});
