import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import tokenRoutes from './routes/tokenRoutes';
import {
  redisClient,
  isRedisConnected,
  createLogger,
} from '@eterna/redis-client';

const logger = createLogger('api-gateway');

dotenv.config();

const PORT = process.env.PORT || 3000;
const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    message: 'Eterna API Gateway',
    version: '1.0.0',
    status: 'running',
    redis: isRedisConnected() ? 'connected' : 'disconnected',
  });
});

app.get('/health', (_req, res) => {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    redis: isRedisConnected(),
  };

  const status = health.redis ? 200 : 503;
  res.status(status).json(health);
});

app.use('/api', tokenRoutes);

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gracefully');
  await redisClient.quit();
  logger.info('Shutdown complete');
  process.exit(0);
}

async function main() {
  logger.info(
    {
      port: PORT,
      redisUrl: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
    },
    'API Gateway starting'
  );

  if (!isRedisConnected()) {
    logger.info('Waiting for Redis connection');
    await new Promise<void>((resolve) => {
      redisClient.once('ready', () => resolve());
      setTimeout(() => resolve(), 5000);
    });
  }

  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'API Gateway running');
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.fatal({ error }, 'Fatal error during startup');
  process.exit(1);
});
