// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SCHEDULE_INTERVAL = '30000';
process.env.WORKER_CONCURRENCY = '1';
