import dotenv from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';
import {
  getCache,
  CACHE_KEYS,
  redisClient,
  createLogger,
} from '@eterna/redis-client';
import type {
  AggregatedToken,
  ClientMessage,
  WebSocketMessage,
} from '@eterna/types';
import { SubscriptionManager, type Channel } from './subscriptionManager';
import { DiffCalculator } from './diffCalculator';

const logger = createLogger('websocket-server');

dotenv.config();

const PORT = process.env.PORT || 8080;

const wss = new WebSocketServer({ port: Number(PORT) });
const subscriber = redisClient.duplicate();

let clientCount = 0;

const subscriptionManager = new SubscriptionManager();
const diffCalculator = new DiffCalculator();

function sendToClient(ws: WebSocket, message: WebSocketMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      logger.error({ error }, 'Error sending message to client');
    }
  }
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
    const latestTokens = await getCache<AggregatedToken[]>(
      CACHE_KEYS.TOKENS_LATEST
    );

    if (!latestTokens || latestTokens.length === 0) {
      logger.warn('No tokens in cache, skipping broadcast');
      return;
    }

    // Calculate diff from previous state
    const diff = diffCalculator.calculateDiff(latestTokens);

    if (
      diff.new.length === 0 &&
      diff.updated.length === 0 &&
      diff.removed.length === 0
    ) {
      logger.debug('No changes detected, skipping broadcast');
      return;
    }

    const timestamp = Date.now();

    const allChannelCount = subscriptionManager.broadcast(
      { type: 'all' },
      {
        type: 'TOKEN_DIFF',
        payload: diff,
        timestamp,
      }
    );

    const affectedTokens = [...diff.new, ...diff.updated];
    let tokenChannelCount = 0;

    affectedTokens.forEach((token) => {
      const count = subscriptionManager.broadcast(
        { type: 'token', identifier: token.token_address },
        {
          type: 'TOKEN_UPDATE',
          payload: token,
          timestamp,
          channel: `token:${token.token_address}`,
        }
      );
      tokenChannelCount += count;
    });

    const topVolumeTokens = latestTokens
      .sort((a, b) => b.volume_usd_24h - a.volume_usd_24h)
      .slice(0, 50);

    const volumeChannelCount = subscriptionManager.broadcast(
      { type: 'volume' },
      {
        type: 'TOKEN_UPDATE',
        payload: topVolumeTokens,
        timestamp,
        channel: 'volume',
      }
    );

    logger.info(
      {
        new: diff.new.length,
        updated: diff.updated.length,
        removed: diff.removed.length,
        allChannel: allChannelCount,
        tokenChannels: tokenChannelCount,
        volumeChannel: volumeChannelCount,
      },
      'Broadcast token updates'
    );
  } catch (error) {
    logger.error({ error }, 'Error processing message');
  }
});

wss.on('connection', async (ws) => {
  clientCount++;
  const clientId = clientCount;

  subscriptionManager.addClient(ws, clientId);

  logger.info({ clientId, totalClients: wss.clients.size }, 'Client connected');

  sendToClient(ws, {
    type: 'CONNECTED',
    message: 'Connected to Eterna WebSocket Server',
    clientId,
  });

  subscriptionManager.subscribe(ws, { type: 'all' });

  try {
    const tokens = await getCache<AggregatedToken[]>(CACHE_KEYS.TOKENS_LATEST);
    if (tokens && tokens.length > 0) {
      if (diffCalculator.getStateSize() === 0) {
        diffCalculator.initializeState(tokens);
      }

      sendToClient(ws, {
        type: 'TOKEN_UPDATE',
        payload: tokens,
        timestamp: Date.now(),
      });
    }
  } catch (error) {
    logger.error({ error, clientId }, 'Error sending initial token data');
  }

  ws.on('message', async (data) => {
    try {
      const message: ClientMessage = JSON.parse(data.toString());
      logger.debug({ clientId, message }, 'Message from client');

      switch (message.type) {
        case 'REQUEST_TOKENS': {
          const tokens = await getCache<AggregatedToken[]>(
            CACHE_KEYS.TOKENS_LATEST
          );
          sendToClient(ws, {
            type: 'TOKEN_UPDATE',
            payload: tokens || [],
            timestamp: Date.now(),
          });
          break;
        }

        case 'SUBSCRIBE': {
          if (!message.channel) {
            sendToClient(ws, {
              type: 'SUBSCRIPTION_ERROR',
              message: 'Channel type is required',
            });
            break;
          }

          const channel: Channel = {
            type: message.channel,
            identifier: message.identifier,
          };

          const success = subscriptionManager.subscribe(ws, channel);

          if (success) {
            sendToClient(ws, {
              type: 'SUBSCRIPTION_SUCCESS',
              message: `Subscribed to channel: ${message.channel}${
                message.identifier ? `:${message.identifier}` : ''
              }`,
              channel: message.channel,
            });

            if (message.channel === 'token' && message.identifier) {
              const tokens = await getCache<AggregatedToken[]>(
                CACHE_KEYS.TOKENS_LATEST
              );
              const token = tokens?.find(
                (t) => t.token_address === message.identifier
              );
              if (token) {
                sendToClient(ws, {
                  type: 'TOKEN_UPDATE',
                  payload: token,
                  timestamp: Date.now(),
                  channel: `token:${message.identifier}`,
                });
              }
            } else if (message.channel === 'volume') {
              const tokens = await getCache<AggregatedToken[]>(
                CACHE_KEYS.TOKENS_BY_VOLUME
              );
              if (tokens) {
                sendToClient(ws, {
                  type: 'TOKEN_UPDATE',
                  payload: tokens,
                  timestamp: Date.now(),
                  channel: 'volume',
                });
              }
            }
          } else {
            sendToClient(ws, {
              type: 'SUBSCRIPTION_ERROR',
              message: 'Failed to subscribe',
            });
          }
          break;
        }

        case 'UNSUBSCRIBE': {
          if (!message.channel) {
            sendToClient(ws, {
              type: 'ERROR',
              message: 'Channel type is required',
            });
            break;
          }

          const channel: Channel = {
            type: message.channel,
            identifier: message.identifier,
          };

          subscriptionManager.unsubscribe(ws, channel);
          sendToClient(ws, {
            type: 'SUBSCRIPTION_SUCCESS',
            message: `Unsubscribed from channel: ${message.channel}${
              message.identifier ? `:${message.identifier}` : ''
            }`,
          });
          break;
        }

        case 'GET_SUBSCRIPTIONS': {
          const channels = subscriptionManager.getClientChannels(ws);
          sendToClient(ws, {
            type: 'SUBSCRIPTION_SUCCESS',
            message: 'Current subscriptions',
            payload: channels,
          });
          break;
        }

        default:
          sendToClient(ws, {
            type: 'ERROR',
            message: 'Unknown message type',
          });
      }
    } catch (error) {
      logger.error({ error, clientId }, 'Error handling message');
      sendToClient(ws, {
        type: 'ERROR',
        message: 'Failed to process message',
      });
    }
  });

  ws.on('close', () => {
    subscriptionManager.removeClient(ws);
    logger.info(
      { clientId, remainingClients: wss.clients.size },
      'Client disconnected'
    );

    // Log subscription stats periodically
    if (wss.clients.size % 10 === 0) {
      const stats = subscriptionManager.getStats();
      logger.info({ stats }, 'Subscription statistics');
    }
  });

  ws.on('error', (error) => {
    logger.error({ error, clientId }, 'Client error');
    subscriptionManager.removeClient(ws);
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
