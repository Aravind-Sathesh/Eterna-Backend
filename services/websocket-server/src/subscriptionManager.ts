import { WebSocket } from 'ws';
import { createLogger } from '@eterna/redis-client';

const logger = createLogger('subscription-manager');

export type ChannelType = 'all' | 'token' | 'volume' | 'price-alerts';

export interface Channel {
  type: ChannelType;
  identifier?: string;
}

export interface ClientSubscription {
  ws: WebSocket;
  clientId: number;
  channels: Set<string>;
}

export class SubscriptionManager {
  private clients: Map<WebSocket, ClientSubscription> = new Map();
  private channelSubscribers: Map<string, Set<WebSocket>> = new Map();

  addClient(ws: WebSocket, clientId: number): void {
    const subscription: ClientSubscription = {
      ws,
      clientId,
      channels: new Set(),
    };

    this.clients.set(ws, subscription);
    logger.debug({ clientId }, 'Client registered with subscription manager');
  }

  removeClient(ws: WebSocket): void {
    const subscription = this.clients.get(ws);
    if (!subscription) return;

    subscription.channels.forEach((channelKey) => {
      const subscribers = this.channelSubscribers.get(channelKey);
      if (subscribers) {
        subscribers.delete(ws);
        if (subscribers.size === 0) {
          this.channelSubscribers.delete(channelKey);
        }
      }
    });

    this.clients.delete(ws);
    logger.debug(
      { clientId: subscription.clientId },
      'Client removed from subscription manager'
    );
  }

  subscribe(ws: WebSocket, channel: Channel): boolean {
    const subscription = this.clients.get(ws);
    if (!subscription) {
      logger.warn('Attempted to subscribe unknown client');
      return false;
    }

    const channelKey = this.getChannelKey(channel);

    subscription.channels.add(channelKey);

    if (!this.channelSubscribers.has(channelKey)) {
      this.channelSubscribers.set(channelKey, new Set());
    }
    this.channelSubscribers.get(channelKey)!.add(ws);

    logger.info(
      {
        clientId: subscription.clientId,
        channel: channelKey,
        totalSubscribers: this.channelSubscribers.get(channelKey)!.size,
      },
      'Client subscribed to channel'
    );

    return true;
  }

  unsubscribe(ws: WebSocket, channel: Channel): boolean {
    const subscription = this.clients.get(ws);
    if (!subscription) return false;

    const channelKey = this.getChannelKey(channel);

    subscription.channels.delete(channelKey);

    const subscribers = this.channelSubscribers.get(channelKey);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        this.channelSubscribers.delete(channelKey);
      }
    }

    logger.info(
      { clientId: subscription.clientId, channel: channelKey },
      'Client unsubscribed from channel'
    );

    return true;
  }

  broadcast(channel: Channel, data: any): number {
    const channelKey = this.getChannelKey(channel);
    const subscribers = this.channelSubscribers.get(channelKey);

    if (!subscribers || subscribers.size === 0) {
      logger.debug({ channel: channelKey }, 'No subscribers for channel');
      return 0;
    }

    const payload = JSON.stringify(data);
    let sentCount = 0;

    subscribers.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
          sentCount++;
        } catch (error) {
          logger.error(
            { error, channel: channelKey },
            'Error sending to subscriber'
          );
        }
      }
    });

    logger.debug(
      { channel: channelKey, sentCount, totalSubscribers: subscribers.size },
      'Broadcast to channel'
    );

    return sentCount;
  }

  broadcastToChannels(channels: Channel[], data: any): number {
    const payload = JSON.stringify(data);
    const targetClients = new Set<WebSocket>();

    channels.forEach((channel) => {
      const channelKey = this.getChannelKey(channel);
      const subscribers = this.channelSubscribers.get(channelKey);
      if (subscribers) {
        subscribers.forEach((ws) => targetClients.add(ws));
      }
    });

    let sentCount = 0;
    targetClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
          sentCount++;
        } catch (error) {
          logger.error({ error }, 'Error sending to subscriber');
        }
      }
    });

    logger.debug(
      { channelCount: channels.length, sentCount },
      'Broadcast to multiple channels'
    );

    return sentCount;
  }

  getClientChannels(ws: WebSocket): string[] {
    const subscription = this.clients.get(ws);
    return subscription ? Array.from(subscription.channels) : [];
  }

  getStats() {
    const channelStats = Array.from(this.channelSubscribers.entries()).map(
      ([channel, subscribers]) => ({
        channel,
        subscribers: subscribers.size,
      })
    );

    return {
      totalClients: this.clients.size,
      totalChannels: this.channelSubscribers.size,
      channels: channelStats,
    };
  }

  private getChannelKey(channel: Channel): string {
    if (channel.type === 'all') {
      return 'channel:all';
    }
    if (channel.type === 'token' && channel.identifier) {
      return `channel:token:${channel.identifier}`;
    }
    if (channel.type === 'volume') {
      return 'channel:volume';
    }
    if (channel.type === 'price-alerts') {
      return 'channel:price-alerts';
    }
    return `channel:${channel.type}`;
  }
}
