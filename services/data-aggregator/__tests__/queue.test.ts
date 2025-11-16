import { Queue } from 'bullmq';

// Mock Redis connection
const mockRedisClient = {
  on: jest.fn(),
  connect: jest.fn(),
  quit: jest.fn(),
  duplicate: jest.fn().mockReturnThis(),
};

// Mock BullMQ Queue
jest.mock('bullmq', () => {
  const originalModule = jest.requireActual('bullmq');
  return {
    ...originalModule,
    Queue: jest.fn().mockImplementation((name: string, _options?: any) => {
      return {
        name,
        add: jest.fn().mockResolvedValue({
          id: 'test-job-id',
          data: {},
          opts: {},
        }),
        getJobs: jest.fn().mockResolvedValue([]),
        getJobCounts: jest.fn().mockResolvedValue({
          waiting: 0,
          active: 0,
          completed: 0,
          failed: 0,
        }),
        close: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

// Mock the Redis client module
jest.mock('@eterna/redis-client', () => ({
  redisClient: mockRedisClient,
  tokenAggregationQueue: {
    name: 'token-aggregation',
    add: jest.fn(),
  },
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

import type { TokenAggregationJobData } from '@eterna/redis-client';

describe('BullMQ Queue Unit Tests', () => {
  let queue: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create a new queue instance for each test
    queue = new Queue('token-aggregation', {
      connection: mockRedisClient as any,
    });
  });

  afterEach(async () => {
    if (queue) {
      await queue.close();
    }
  });

  describe('Queue Job Addition', () => {
    it('should successfully add a fetch-token-data job to the queue', async () => {
      const jobData: TokenAggregationJobData = {
        jobId: 'test-job-123',
        timestamp: Date.now(),
        triggeredBy: 'scheduled',
      };

      const job = await queue.add('fetch-token-data', jobData, {
        priority: 1,
        jobId: jobData.jobId,
      });

      expect(queue.add).toHaveBeenCalledWith(
        'fetch-token-data',
        jobData,
        expect.objectContaining({
          priority: 1,
          jobId: jobData.jobId,
        })
      );

      expect(job).toBeDefined();
      expect(job.id).toBe('test-job-id');
    });

    it('should add job with correct priority', async () => {
      const jobData: TokenAggregationJobData = {
        jobId: 'high-priority-job',
        timestamp: Date.now(),
        triggeredBy: 'manual',
      };

      await queue.add('fetch-token-data', jobData, {
        priority: 1,
        jobId: jobData.jobId,
      });

      expect(queue.add).toHaveBeenCalledWith(
        'fetch-token-data',
        jobData,
        expect.objectContaining({
          priority: 1,
        })
      );
    });

    it('should add job with unique jobId', async () => {
      const timestamp = Date.now();
      const jobData: TokenAggregationJobData = {
        jobId: `agg-${timestamp}-1`,
        timestamp,
        triggeredBy: 'scheduled',
      };

      await queue.add('fetch-token-data', jobData, {
        priority: 1,
        jobId: jobData.jobId,
      });

      expect(queue.add).toHaveBeenCalledWith(
        'fetch-token-data',
        expect.objectContaining({
          jobId: `agg-${timestamp}-1`,
        }),
        expect.any(Object)
      );
    });

    it('should include all required job data fields', async () => {
      const jobData: TokenAggregationJobData = {
        jobId: 'complete-job',
        timestamp: 1234567890,
        triggeredBy: 'scheduled',
      };

      await queue.add('fetch-token-data', jobData, {
        priority: 1,
        jobId: jobData.jobId,
      });

      const callArgs = (queue.add as jest.Mock).mock.calls[0];
      const addedJobData = callArgs[1];

      expect(addedJobData).toHaveProperty('jobId');
      expect(addedJobData).toHaveProperty('timestamp');
      expect(addedJobData).toHaveProperty('triggeredBy');
      expect(addedJobData.jobId).toBe('complete-job');
      expect(addedJobData.timestamp).toBe(1234567890);
      expect(addedJobData.triggeredBy).toBe('scheduled');
    });

    it('should handle multiple jobs being added', async () => {
      const jobs = [
        {
          jobId: 'job-1',
          timestamp: Date.now(),
          triggeredBy: 'scheduled' as const,
        },
        {
          jobId: 'job-2',
          timestamp: Date.now() + 1000,
          triggeredBy: 'manual' as const,
        },
        {
          jobId: 'job-3',
          timestamp: Date.now() + 2000,
          triggeredBy: 'scheduled' as const,
        },
      ];

      for (const jobData of jobs) {
        await queue.add('fetch-token-data', jobData, {
          priority: 1,
          jobId: jobData.jobId,
        });
      }

      expect(queue.add).toHaveBeenCalledTimes(3);
    });

    it('should handle job options correctly', async () => {
      const jobData: TokenAggregationJobData = {
        jobId: 'options-test',
        timestamp: Date.now(),
        triggeredBy: 'manual',
      };

      const options = {
        priority: 1,
        jobId: jobData.jobId,
        attempts: 3,
        backoff: {
          type: 'exponential' as const,
          delay: 1000,
        },
      };

      await queue.add('fetch-token-data', jobData, options);

      expect(queue.add).toHaveBeenCalledWith(
        'fetch-token-data',
        jobData,
        expect.objectContaining({
          priority: 1,
          jobId: jobData.jobId,
        })
      );
    });
  });

  describe('Queue State Management', () => {
    it('should initialize queue with correct name', () => {
      expect(queue.name).toBe('token-aggregation');
    });

    it('should be able to query job counts', async () => {
      const counts = await queue.getJobCounts();

      expect(counts).toBeDefined();
      expect(counts).toHaveProperty('waiting');
      expect(counts).toHaveProperty('active');
      expect(counts).toHaveProperty('completed');
      expect(counts).toHaveProperty('failed');
    });

    it('should be able to close the queue connection', async () => {
      await queue.close();

      expect(queue.close).toHaveBeenCalled();
    });
  });

  describe('Job Data Validation', () => {
    it('should accept job with all valid fields', async () => {
      const validJobData: TokenAggregationJobData = {
        jobId: 'valid-job',
        timestamp: Date.now(),
        triggeredBy: 'scheduled',
      };

      const job = await queue.add('fetch-token-data', validJobData, {
        priority: 1,
        jobId: validJobData.jobId,
      });

      expect(job).toBeDefined();
    });

    it('should handle different triggeredBy values', async () => {
      const triggers: Array<'scheduled' | 'manual'> = ['scheduled', 'manual'];

      for (const trigger of triggers) {
        const jobData: TokenAggregationJobData = {
          jobId: `trigger-${trigger}`,
          timestamp: Date.now(),
          triggeredBy: trigger,
        };

        await queue.add('fetch-token-data', jobData, {
          priority: 1,
          jobId: jobData.jobId,
        });
      }

      expect(queue.add).toHaveBeenCalledTimes(triggers.length);
    });
  });
});
