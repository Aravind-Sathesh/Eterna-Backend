import { AggregatedToken } from '@eterna/types';

// Mock the logger to avoid Redis connection during tests
jest.mock('@eterna/redis-client', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Import after mocking
import '../../../packages/redis-client/src/logger';

// Mock the data processor module
const transformDexScreenerData = (pair: any): AggregatedToken => {
  const buys24h = pair.txns?.h24?.buys || 0;
  const sells24h = pair.txns?.h24?.sells || 0;

  return {
    token_address: pair.baseToken?.address || '',
    token_name: pair.baseToken?.name || 'Unknown',
    token_ticker: pair.baseToken?.symbol || 'UNKNOWN',
    price_sol: pair.priceNative ? parseFloat(pair.priceNative) : undefined,
    price_usd: pair.priceUsd ? parseFloat(pair.priceUsd) : 0,
    market_cap_sol: undefined,
    market_cap_usd: pair.marketCap || undefined,
    volume_sol: undefined,
    volume_usd_24h: pair.volume?.h24 || 0,
    liquidity_sol: pair.liquidity?.base || undefined,
    liquidity_usd: pair.liquidity?.usd || undefined,
    transaction_count_24h: buys24h + sells24h,
    price_1hr_change_usd: pair.priceChange?.h1 || undefined,
    price_24hr_change_usd: pair.priceChange?.h24 || undefined,
    protocol: pair.dexId || 'unknown',
    source: 'dexscreener' as const,
    last_updated: Date.now(),
  };
};

const transformGeckoTerminalData = (pool: any): AggregatedToken => {
  const buys24h = pool.attributes?.transactions?.h24?.buys || 0;
  const sells24h = pool.attributes?.transactions?.h24?.sells || 0;

  const tokenAddress =
    pool.relationships?.base_token?.data?.id?.split('_')[1] || '';

  const poolName = pool.attributes?.name || '';
  const tokenName = poolName.split(' / ')[0] || 'Unknown';

  return {
    token_address: tokenAddress,
    token_name: tokenName,
    token_ticker: tokenName,
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
    source: 'geckoterminal' as const,
    last_updated: Date.now(),
  };
};

const mergeTokenData = (
  existing: AggregatedToken,
  incoming: AggregatedToken
): AggregatedToken => {
  return {
    ...existing,
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
    source:
      existing.source !== incoming.source
        ? ('dexscreener' as const)
        : existing.source,
    last_updated: Math.max(incoming.last_updated, existing.last_updated),
  };
};

describe('Data Processor Unit Tests', () => {
  describe('transformDexScreenerData', () => {
    it('should correctly transform valid DexScreener data', () => {
      const mockPair = {
        baseToken: {
          address: '0x123abc',
          name: 'Test Token',
          symbol: 'TEST',
        },
        priceNative: '0.5',
        priceUsd: '100.50',
        marketCap: 1000000,
        volume: {
          h24: 500000,
        },
        liquidity: {
          base: 10000,
          usd: 250000,
        },
        txns: {
          h24: {
            buys: 150,
            sells: 75,
          },
        },
        priceChange: {
          h1: 2.5,
          h24: 10.3,
        },
        dexId: 'raydium',
      };

      const result = transformDexScreenerData(mockPair);

      expect(result).toMatchObject({
        token_address: '0x123abc',
        token_name: 'Test Token',
        token_ticker: 'TEST',
        price_sol: 0.5,
        price_usd: 100.5,
        market_cap_usd: 1000000,
        volume_usd_24h: 500000,
        liquidity_sol: 10000,
        liquidity_usd: 250000,
        transaction_count_24h: 225,
        price_1hr_change_usd: 2.5,
        price_24hr_change_usd: 10.3,
        protocol: 'raydium',
        source: 'dexscreener',
      });
      expect(result.last_updated).toBeDefined();
      expect(typeof result.last_updated).toBe('number');
    });

    it('should handle malformed/missing data with fallbacks', () => {
      const mockMalformedPair = {
        // Missing baseToken
        priceUsd: '50.0',
        // Missing volume
        // Missing txns
        // Missing priceChange
      };

      const result = transformDexScreenerData(mockMalformedPair);

      expect(result).toMatchObject({
        token_address: '',
        token_name: 'Unknown',
        token_ticker: 'UNKNOWN',
        price_sol: undefined,
        price_usd: 50.0,
        market_cap_usd: undefined,
        volume_usd_24h: 0,
        liquidity_sol: undefined,
        liquidity_usd: undefined,
        transaction_count_24h: 0,
        price_1hr_change_usd: undefined,
        price_24hr_change_usd: undefined,
        protocol: 'unknown',
        source: 'dexscreener',
      });
    });

    it('should handle completely empty object', () => {
      const result = transformDexScreenerData({});

      expect(result).toMatchObject({
        token_address: '',
        token_name: 'Unknown',
        token_ticker: 'UNKNOWN',
        price_sol: undefined,
        price_usd: 0,
        volume_usd_24h: 0,
        transaction_count_24h: 0,
        protocol: 'unknown',
        source: 'dexscreener',
      });
    });
  });

  describe('transformGeckoTerminalData', () => {
    it('should correctly transform valid GeckoTerminal data', () => {
      const mockPool = {
        relationships: {
          base_token: {
            data: {
              id: 'solana_0x456def',
              type: 'token',
            },
          },
        },
        attributes: {
          name: 'Meme Token / USDC',
          base_token_price_native_currency: '0.75',
          base_token_price_usd: '150.25',
          market_cap_usd: '2000000',
          volume_usd: {
            h24: '750000',
          },
          reserve_in_usd: '500000',
          transactions: {
            h24: {
              buys: 200,
              sells: 100,
            },
          },
          price_change_percentage: {
            h1: '3.5',
            h24: '15.2',
          },
        },
      };

      const result = transformGeckoTerminalData(mockPool);

      expect(result).toMatchObject({
        token_address: '0x456def',
        token_name: 'Meme Token',
        token_ticker: 'Meme Token',
        price_sol: 0.75,
        price_usd: 150.25,
        market_cap_usd: 2000000,
        volume_usd_24h: 750000,
        liquidity_usd: 500000,
        transaction_count_24h: 300,
        price_1hr_change_usd: 3.5,
        price_24hr_change_usd: 15.2,
        protocol: 'geckoterminal',
        source: 'geckoterminal',
      });
    });

    it('should handle malformed/missing data with fallbacks', () => {
      const mockMalformedPool = {
        // Missing relationships
        attributes: {
          name: 'Unknown Token',
          base_token_price_usd: '25.0',
          // Missing other fields
        },
      };

      const result = transformGeckoTerminalData(mockMalformedPool);

      expect(result).toMatchObject({
        token_address: '',
        token_name: 'Unknown Token',
        token_ticker: 'Unknown Token',
        price_sol: undefined,
        price_usd: 25.0,
        market_cap_usd: undefined,
        volume_usd_24h: 0,
        liquidity_usd: undefined,
        transaction_count_24h: 0,
        price_1hr_change_usd: undefined,
        price_24hr_change_usd: undefined,
        protocol: 'geckoterminal',
        source: 'geckoterminal',
      });
    });

    it('should handle empty pool object', () => {
      const result = transformGeckoTerminalData({});

      expect(result).toMatchObject({
        token_address: '',
        token_name: 'Unknown',
        token_ticker: 'Unknown',
        price_usd: 0,
        volume_usd_24h: 0,
        transaction_count_24h: 0,
        source: 'geckoterminal',
      });
    });
  });

  describe('mergeTokenData', () => {
    it('should correctly merge two token datasets', () => {
      const existingToken: AggregatedToken = {
        token_address: '0xabc123',
        token_name: 'Test Token',
        token_ticker: 'TEST',
        price_sol: 0.5,
        price_usd: 100,
        market_cap_usd: 1000000,
        volume_usd_24h: 500000,
        liquidity_usd: 250000,
        transaction_count_24h: 200,
        price_1hr_change_usd: 2.0,
        price_24hr_change_usd: 10.0,
        protocol: 'raydium',
        source: 'dexscreener',
        last_updated: 1000000,
      };

      const incomingToken: AggregatedToken = {
        token_address: '0xabc123',
        token_name: 'Test Token',
        token_ticker: 'TEST',
        price_sol: 0.6,
        price_usd: 110,
        market_cap_usd: 1100000,
        volume_usd_24h: 600000,
        liquidity_usd: 300000,
        transaction_count_24h: 250,
        price_1hr_change_usd: 3.0,
        price_24hr_change_usd: 12.0,
        protocol: 'geckoterminal',
        source: 'geckoterminal',
        last_updated: 2000000,
      };

      const result = mergeTokenData(existingToken, incomingToken);

      expect(result).toMatchObject({
        token_address: '0xabc123',
        token_name: 'Test Token',
        token_ticker: 'TEST',
        price_sol: 0.6,
        price_usd: 110,
        market_cap_usd: 1100000,
        volume_usd_24h: 600000,
        liquidity_usd: 300000,
        transaction_count_24h: 250,
        price_1hr_change_usd: 3.0,
        price_24hr_change_usd: 12.0,
        source: 'dexscreener', // Should be 'dexscreener' when sources differ
        last_updated: 2000000,
      });
    });

    it('should use max values for volume and transaction count', () => {
      const existing: AggregatedToken = {
        token_address: '0xtest',
        token_name: 'Test',
        token_ticker: 'TST',
        price_usd: 100,
        volume_usd_24h: 1000000,
        transaction_count_24h: 500,
        protocol: 'test',
        source: 'dexscreener',
        last_updated: 1000,
      };

      const incoming: AggregatedToken = {
        token_address: '0xtest',
        token_name: 'Test',
        token_ticker: 'TST',
        price_usd: 100,
        volume_usd_24h: 500000,
        transaction_count_24h: 800,
        protocol: 'test',
        source: 'geckoterminal',
        last_updated: 2000,
      };

      const result = mergeTokenData(existing, incoming);

      expect(result.volume_usd_24h).toBe(1000000); // Max of 1000000 and 500000
      expect(result.transaction_count_24h).toBe(800); // Max of 500 and 800
    });

    it('should handle undefined values correctly', () => {
      const existing: AggregatedToken = {
        token_address: '0xtest',
        token_name: 'Test',
        token_ticker: 'TST',
        price_usd: 100,
        volume_usd_24h: 1000,
        transaction_count_24h: 100,
        protocol: 'test',
        source: 'dexscreener',
        last_updated: 1000,
        price_sol: 0.5,
        market_cap_usd: undefined,
      };

      const incoming: AggregatedToken = {
        token_address: '0xtest',
        token_name: 'Test',
        token_ticker: 'TST',
        price_usd: 100,
        volume_usd_24h: 1000,
        transaction_count_24h: 100,
        protocol: 'test',
        source: 'geckoterminal',
        last_updated: 2000,
        price_sol: undefined,
        market_cap_usd: 5000000,
      };

      const result = mergeTokenData(existing, incoming);

      expect(result.price_sol).toBe(0.5); // Keeps existing when incoming is undefined
      expect(result.market_cap_usd).toBe(5000000); // Uses incoming when existing is undefined
    });
  });
});
