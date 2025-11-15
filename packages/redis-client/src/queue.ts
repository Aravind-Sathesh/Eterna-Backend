import { Queue, QueueOptions } from 'bullmq';
import { redisClient } from './index';

export interface TokenAggregationJobData {
  jobId: string;
  timestamp: number;
  triggeredBy: 'scheduled' | 'manual';
}

export const QUEUE_NAMES = {
  TOKEN_AGGREGATION: 'token-aggregation',
} as const;

const defaultQueueOptions: QueueOptions = {
  connection: redisClient,
  defaultJobOptions: {
    removeOnComplete: {
      age: 3600,
      count: 100,
    },
    removeOnFail: {
      age: 86400,
      count: 1000,
    },
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
};

export function createQueue<T = any>(
  name: string,
  options?: Partial<QueueOptions>
): Queue<T> {
  return new Queue<T>(name, {
    ...defaultQueueOptions,
    ...options,
  });
}

export const tokenAggregationQueue = createQueue<TokenAggregationJobData>(
  QUEUE_NAMES.TOKEN_AGGREGATION
);

export async function getQueueMetrics(queue: Queue) {
  const [waitingCount, activeCount, completedCount, failedCount, delayedCount] =
    await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

  return {
    waiting: waitingCount,
    active: activeCount,
    completed: completedCount,
    failed: failedCount,
    delayed: delayedCount,
    total: waitingCount + activeCount + delayedCount,
  };
}

export async function closeQueue(queue: Queue): Promise<void> {
  await queue.close();
}

export async function cleanQueue(
  queue: Queue,
  grace: number = 3600000,
  limit: number = 1000
): Promise<void> {
  await queue.clean(grace, limit, 'completed');
  await queue.clean(grace * 24, limit, 'failed'); // Keep failed jobs longer
}
