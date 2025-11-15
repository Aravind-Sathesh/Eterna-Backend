import dexScreenerClient from '../clients/dexScreener';
import geckoTerminalClient from '../clients/geckoTerminal';

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
  last_updated: number; // timestamp
}

function transformDexScreenerData(pair: any): AggregatedToken {
  const buys24h = pair.txns?.h24?.buys || 0;
  const sells24h = pair.txns?.h24?.sells || 0;

  return {
    token_address: pair.baseToken?.address || '',
    token_name: pair.baseToken?.name || 'Unknown',
    token_ticker: pair.baseToken?.symbol || 'UNKNOWN',
    price_sol: pair.priceNative ? parseFloat(pair.priceNative) : undefined,
    price_usd: pair.priceUsd ? parseFloat(pair.priceUsd) : 0,
    market_cap_sol: undefined, // DexScreener doesn't provide SOL denominated market cap directly
    market_cap_usd: pair.marketCap || undefined,
    volume_sol: undefined, // DexScreener doesn't provide SOL denominated volume directly
    volume_usd_24h: pair.volume?.h24 || 0,
    liquidity_sol: pair.liquidity?.base || undefined,
    liquidity_usd: pair.liquidity?.usd || undefined,
    transaction_count_24h: buys24h + sells24h,
    price_1hr_change_usd: pair.priceChange?.h1 || undefined,
    price_24hr_change_usd: pair.priceChange?.h24 || undefined,
    protocol: pair.dexId || 'unknown',
    source: 'dexscreener',
    last_updated: Date.now(),
  };
}

function transformGeckoTerminalData(pool: any): AggregatedToken {
  const buys24h = pool.attributes?.transactions?.h24?.buys || 0;
  const sells24h = pool.attributes?.transactions?.h24?.sells || 0;

  // Extract token address from the relationship ID (format: "sol_tokenaddress")
  const tokenAddress =
    pool.relationships?.base_token?.data?.id?.split('_')[1] || '';

  // Extract token name from pool name (format: "TOKEN / QUOTE")
  const poolName = pool.attributes?.name || '';
  const tokenName = poolName.split(' / ')[0] || 'Unknown';

  return {
    token_address: tokenAddress,
    token_name: tokenName,
    token_ticker: tokenName, // GeckoTerminal doesn't always provide ticker separately
    price_sol: pool.attributes?.base_token_price_native_currency
      ? parseFloat(pool.attributes.base_token_price_native_currency)
      : undefined,
    price_usd: pool.attributes?.base_token_price_usd
      ? parseFloat(pool.attributes.base_token_price_usd)
      : 0,
    market_cap_sol: undefined,
    market_cap_usd: pool.attributes?.market_cap_usd
      ? parseFloat(pool.attributes.market_cap_usd)
      : undefined,
    volume_sol: undefined,
    volume_usd_24h: pool.attributes?.volume_usd?.h24
      ? parseFloat(pool.attributes.volume_usd.h24)
      : 0,
    liquidity_sol: undefined,
    liquidity_usd: pool.attributes?.reserve_in_usd
      ? parseFloat(pool.attributes.reserve_in_usd)
      : undefined,
    transaction_count_24h: buys24h + sells24h,
    price_1hr_change_usd: pool.attributes?.price_change_percentage?.h1
      ? parseFloat(pool.attributes.price_change_percentage.h1)
      : undefined,
    price_24hr_change_usd: pool.attributes?.price_change_percentage?.h24
      ? parseFloat(pool.attributes.price_change_percentage.h24)
      : undefined,
    protocol: 'geckoterminal',
    source: 'geckoterminal',
    last_updated: Date.now(),
  };
}

function mergeTokenData(
  existing: AggregatedToken,
  incoming: AggregatedToken
): AggregatedToken {
  return {
    ...existing,
    // Use incoming data if it's more complete
    price_sol: incoming.price_sol ?? existing.price_sol,
    price_usd: incoming.price_usd || existing.price_usd,
    market_cap_sol: incoming.market_cap_sol ?? existing.market_cap_sol,
    market_cap_usd: incoming.market_cap_usd ?? existing.market_cap_usd,
    volume_sol: incoming.volume_sol ?? existing.volume_sol,
    volume_usd_24h: Math.max(
      incoming.volume_usd_24h || 0,
      existing.volume_usd_24h || 0
    ),
    liquidity_sol: incoming.liquidity_sol ?? existing.liquidity_sol,
    liquidity_usd: incoming.liquidity_usd ?? existing.liquidity_usd,
    transaction_count_24h: Math.max(
      incoming.transaction_count_24h || 0,
      existing.transaction_count_24h || 0
    ),
    price_1hr_change_usd:
      incoming.price_1hr_change_usd ?? existing.price_1hr_change_usd,
    price_24hr_change_usd:
      incoming.price_24hr_change_usd ?? existing.price_24hr_change_usd,
    // Keep track of multiple sources
    source:
      existing.source !== incoming.source
        ? ('dexscreener' as const)
        : existing.source,
    last_updated: Math.max(incoming.last_updated, existing.last_updated),
  };
}

export async function fetchAndProcessTokenData(): Promise<AggregatedToken[]> {
  console.log('[DataProcessor] Starting data aggregation cycle...');
  const startTime = Date.now();

  try {
    console.log(
      '[DataProcessor] Fetching from DexScreener and GeckoTerminal...'
    );
    const [dexScreenerPairs, geckoTerminalPools] = await Promise.all([
      dexScreenerClient.getLatestPairs('solana').catch((err: any) => {
        console.error('[DexScreener] Fetch failed:', err.message);
        return [];
      }),
      geckoTerminalClient.getTrendingPools('solana').catch((err: any) => {
        console.error('[GeckoTerminal] Fetch failed:', err.message);
        return [];
      }),
    ]);

    console.log(
      `[DataProcessor] Fetched ${dexScreenerPairs.length} pairs from DexScreener`
    );
    console.log(
      `[DataProcessor] Fetched ${geckoTerminalPools.length} pools from GeckoTerminal`
    );

    const transformedDexScreener = dexScreenerPairs
      .map((pair: any) => {
        try {
          return transformDexScreenerData(pair);
        } catch (err) {
          console.error('[DexScreener] Transform error:', err);
          return null;
        }
      })
      .filter((token): token is AggregatedToken => token !== null);

    const transformedGeckoTerminal = geckoTerminalPools
      .map((pool: any) => {
        try {
          return transformGeckoTerminalData(pool);
        } catch (err) {
          console.error('[GeckoTerminal] Transform error:', err);
          return null;
        }
      })
      .filter((token): token is AggregatedToken => token !== null);

    console.log(
      `[DataProcessor] Transformed ${transformedDexScreener.length} tokens from DexScreener`
    );
    console.log(
      `[DataProcessor] Transformed ${transformedGeckoTerminal.length} tokens from GeckoTerminal`
    );

    const tokenMap = new Map<string, AggregatedToken>();

    // Add all tokens from DexScreener
    for (const token of transformedDexScreener) {
      if (token.token_address) {
        tokenMap.set(token.token_address.toLowerCase(), token);
      }
    }

    // Merge/add tokens from GeckoTerminal
    for (const token of transformedGeckoTerminal) {
      if (token.token_address) {
        const key = token.token_address.toLowerCase();
        const existing = tokenMap.get(key);

        if (existing) {
          tokenMap.set(key, mergeTokenData(existing, token));
        } else {
          tokenMap.set(key, token);
        }
      }
    }

    const finalTokenList = Array.from(tokenMap.values());

    finalTokenList.sort((a, b) => b.volume_usd_24h - a.volume_usd_24h);

    const duration = Date.now() - startTime;
    console.log(
      `[DataProcessor] Successfully processed ${finalTokenList.length} unique tokens in ${duration}ms`
    );

    return finalTokenList;
  } catch (error) {
    console.error('[DataProcessor] Fatal error during processing:', error);
    throw error;
  }
}

export function getDataStatistics(tokens: AggregatedToken[]): {
  total: number;
  bySource: Record<string, number>;
  avgVolume: number;
  avgPrice: number;
} {
  const bySource: Record<string, number> = {
    dexscreener: 0,
    geckoterminal: 0,
  };

  let totalVolume = 0;
  let totalPrice = 0;

  for (const token of tokens) {
    bySource[token.source]++;
    totalVolume += token.volume_usd_24h || 0;
    totalPrice += token.price_usd || 0;
  }

  return {
    total: tokens.length,
    bySource,
    avgVolume: tokens.length > 0 ? totalVolume / tokens.length : 0,
    avgPrice: tokens.length > 0 ? totalPrice / tokens.length : 0,
  };
}
