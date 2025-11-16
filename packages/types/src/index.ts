export interface AggregatedToken {
  token_address: string;
  token_name: string;
  token_ticker: string;
  price_sol?: number;
  price_usd: number;
  market_cap_sol?: number;
  market_cap_usd?: number;
  volume_sol?: number;
  volume_usd_24h: number;
  liquidity_sol?: number;
  liquidity_usd?: number;
  transaction_count_24h: number;
  price_1hr_change_usd?: number;
  price_24hr_change_usd?: number;
  protocol: string;
  source: 'dexscreener' | 'geckoterminal';
  last_updated: number;
}

export interface TokenStatistics {
  total: number;
  bySource: Record<string, number>;
  avgVolume: number;
  avgPrice: number;
  lastUpdate?: string;
  runId?: number;
}

// WebSocket Message Types
export type SubscriptionAction = 'subscribe' | 'unsubscribe';
export type ChannelType = 'all' | 'token' | 'volume' | 'price-alerts';

export interface SubscriptionMessage {
  action: SubscriptionAction;
  channel: ChannelType;
  identifier?: string;
}

export interface TokenDiff {
  new: AggregatedToken[];
  updated: AggregatedToken[];
  removed: string[];
}

export interface WebSocketMessage {
  type:
    | 'CONNECTED'
    | 'SUBSCRIPTION_SUCCESS'
    | 'SUBSCRIPTION_ERROR'
    | 'TOKEN_UPDATE'
    | 'TOKEN_DIFF'
    | 'ERROR';
  message?: string;
  clientId?: number;
  payload?: any;
  timestamp?: number;
  channel?: string;
}

export interface ClientMessage {
  type: 'REQUEST_TOKENS' | 'SUBSCRIBE' | 'UNSUBSCRIBE' | 'GET_SUBSCRIPTIONS';
  channel?: ChannelType;
  identifier?: string;
}
