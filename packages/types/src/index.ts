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
