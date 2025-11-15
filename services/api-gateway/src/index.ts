import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import tokenRoutes from './routes/tokenRoutes';
import { redisClient, isRedisConnected } from '@eterna/redis-client';

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
  console.log(`\n${signal} received. Shutting down gracefully...`);
  await redisClient.quit();
  console.log('Shutdown complete.');
  process.exit(0);
}

async function main() {
  console.log('\nAPI Gateway Starting...\n');
  console.log('Configuration:');
  console.log(`- Port: ${PORT}`);
  console.log(
    `- Redis URL: ${process.env.REDIS_URL || 'redis://127.0.0.1:6379'}\n`
  );

  if (!isRedisConnected()) {
    console.log('Waiting for Redis connection...');
    await new Promise<void>((resolve) => {
      redisClient.once('ready', () => resolve());
      setTimeout(() => resolve(), 5000);
    });
  }

  app.listen(PORT, () => {
    console.log(`API Gateway running on http://localhost:${PORT}`);
  });

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
