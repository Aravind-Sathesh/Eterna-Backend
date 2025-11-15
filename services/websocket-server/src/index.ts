import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import {
  getCache,
  CACHE_KEYS,
  redisClient,
  createLogger,
} from '@eterna/redis-client';
const logger = createLogger('websocket-server');

dotenv.config();

const PORT = process.env.PORT || 8080;

const wss = new WebSocketServer({ port: Number(PORT) });
const subscriber = redisClient.duplicate();

let clientCount = 0;

function broadcast(data: any) {
  const payload = JSON.stringify(data);
  let sentCount = 0;

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sentCount++;
    }
  });

  return sentCount;
}

subscriber.on('connect', () => {
  logger.info('Subscriber connected to Redis');
});

subscriber.on('ready', () => {
  logger.info('Subscriber is ready');
});

subscriber.subscribe('token-updates', (err) => {
  if (err) {
    logger.error({ error: err }, 'Failed to subscribe to Redis channel');
  } else {
    logger.info('Subscribed to token-updates channel');
  }
});

subscriber.on('message', async (channel, message) => {
  logger.debug({ channel, message }, 'Received message from Redis');

  try {
    const latestTokens = await getCache(CACHE_KEYS.TOKENS_LATEST);

    if (latestTokens) {
      const sentCount = broadcast({
        type: 'TOKEN_UPDATE',
        payload: latestTokens,
        timestamp: Date.now(),
      });
      logger.debug({ sentCount }, 'Broadcast token update to clients');
    } else {
      logger.warn('No tokens in cache, skipping broadcast');
    }
  } catch (error) {
    logger.error({ error }, 'Error processing message');
  }
});

wss.on('connection', (ws) => {
  clientCount++;
  const clientId = clientCount;
  logger.info({ clientId, totalClients: wss.clients.size }, 'Client connected');

  ws.send(
    JSON.stringify({
      type: 'CONNECTED',
      message: 'Connected to Eterna WebSocket Server',
      clientId,
    })
  );

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      logger.debug({ clientId, message }, 'Message from client');

      if (message.type === 'REQUEST_TOKENS') {
        const tokens = await getCache(CACHE_KEYS.TOKENS_LATEST);
        ws.send(
          JSON.stringify({
            type: 'TOKEN_UPDATE',
            payload: tokens || [],
            timestamp: Date.now(),
          })
        );
      }
    } catch (error) {
      logger.error({ error }, 'Error handling message');
    }
  });

  ws.on('close', () => {
    logger.info(
      { clientId, remainingClients: wss.clients.size },
      'Client disconnected'
    );
  });

  ws.on('error', (error) => {
    logger.error({ error, clientId }, 'Client error');
  });
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down gracefully');

  logger.info('Closing WebSocket connections');
  wss.clients.forEach((client) => {
    client.close();
  });

  logger.info('Closing Redis connections');
  await subscriber.quit();
  await redisClient.quit();

  logger.info('Closing WebSocket server');
  wss.close(() => {
    logger.info('Shutdown complete');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
}

async function main() {
  logger.info('WebSocket Server starting');

  await new Promise<void>((resolve) => {
    subscriber.once('ready', () => resolve());
    setTimeout(() => resolve(), 5000);
  });

  logger.info({ port: PORT }, 'WebSocket server is now running');

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.fatal({ error }, 'Fatal error during startup');
  process.exit(1);
});
