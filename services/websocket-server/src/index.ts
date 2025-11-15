import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import { getCache, CACHE_KEYS, redisClient } from '@eterna/redis-client';

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
  console.log('Subscriber connected to Redis');
});

subscriber.on('ready', () => {
  console.log('Subscriber is ready');
});

subscriber.subscribe('token-updates', (err) => {
  if (err) {
    console.error('Failed to subscribe to Redis channel:', err);
  } else {
    console.log('Subscribed to "token-updates" channel');
  }
});

subscriber.on('message', async (channel, message) => {
  console.log(`\nReceived message from channel "${channel}":`, message);

  try {
    const latestTokens = await getCache(CACHE_KEYS.TOKENS_LATEST);

    if (latestTokens) {
      const sentCount = broadcast({
        type: 'TOKEN_UPDATE',
        payload: latestTokens,
        timestamp: Date.now(),
      });
      console.log(
        `Broadcasted update to ${sentCount}/${wss.clients.size} clients\n`
      );
    } else {
      console.warn('No tokens in cache, skipping broadcast\n');
    }
  } catch (error) {
    console.error('Error processing message:', error);
  }
});

wss.on('connection', (ws) => {
  clientCount++;
  const clientId = clientCount;
  console.log(`Client #${clientId} connected (Total: ${wss.clients.size})`);

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
      console.log(`Message from client #${clientId}:`, message);

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
      console.error('Error handling message:', error);
    }
  });

  ws.on('close', () => {
    console.log(
      `Client #${clientId} disconnected (Total: ${wss.clients.size})`
    );
  });

  ws.on('error', (error) => {
    console.error(`Client #${clientId} error:`, error);
  });
});

async function shutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);

  console.log('Closing WebSocket connections...');
  wss.clients.forEach((client) => {
    client.close();
  });

  console.log('Closing Redis connections...');
  await subscriber.quit();
  await redisClient.quit();

  console.log('Closing WebSocket server...');
  wss.close(() => {
    console.log('Shutdown complete.');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
}

async function main() {
  console.log('\nWebSocket Server Starting...\n');
  console.log('Configuration:');
  console.log(`- Port: ${PORT}`);
  console.log(
    `- Redis URL: ${process.env.REDIS_URL || 'redis://127.0.0.1:6379'}\n`
  );

  await new Promise<void>((resolve) => {
    subscriber.once('ready', () => resolve());
    setTimeout(() => resolve(), 5000);
  });

  console.log('WebSocket server is now running!');
  console.log(`Listening on ws://localhost:${PORT}\n`);
  console.log('Waiting for connections...\n');

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
