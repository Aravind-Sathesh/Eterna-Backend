import axios, { AxiosInstance } from 'axios';
import { createLogger } from '@eterna/redis-client';

const logger = createLogger('geckoterminal-client');

interface Network {
  id: string;
  type: string;
  attributes: {
    name: string;
    coingecko_asset_platform_id?: string;
  };
}

interface Pool {
  id: string;
  type: string;
  attributes: {
    name: string;
    address: string;
    base_token_price_usd: string;
    base_token_price_native_currency: string;
    quote_token_price_usd: string;
    quote_token_price_native_currency: string;
    base_token_price_quote_token: string;
    quote_token_price_base_token: string;
    pool_created_at: string;
    reserve_in_usd: string;
    fdv_usd?: string;
    market_cap_usd?: string;
    price_change_percentage: {
      m5: string;
      h1: string;
      h6: string;
      h24: string;
    };
    transactions: {
      m5: { buys: number; sells: number; buyers: number; sellers: number };
      h1: { buys: number; sells: number; buyers: number; sellers: number };
      h6: { buys: number; sells: number; buyers: number; sellers: number };
      h24: { buys: number; sells: number; buyers: number; sellers: number };
    };
    volume_usd: {
      m5: string;
      h1: string;
      h6: string;
      h24: string;
    };
  };
  relationships: {
    base_token: {
      data: {
        id: string;
        type: string;
      };
    };
    quote_token: {
      data: {
        id: string;
        type: string;
      };
    };
    dex: {
      data: {
        id: string;
        type: string;
      };
    };
  };
}

interface Token {
  id: string;
  type: string;
  attributes: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    total_supply?: string;
    coingecko_coin_id?: string;
    image_url?: string;
  };
}

interface PoolsResponse {
  data: Pool[];
  included?: (Token | { id: string; type: string; attributes: any })[];
}

interface NetworksResponse {
  data: Network[];
}

interface TrendingPool {
  id: string;
  type: string;
  attributes: {
    name: string;
    address: string;
    base_token_price_usd: string;
    volume_usd: {
      h24: string;
    };
  };
}

interface TrendingPoolsResponse {
  data: TrendingPool[];
}

export class GeckoTerminalClient {
  private client: AxiosInstance;
  private readonly baseURL = 'https://api.geckoterminal.com/api/v2';
  private readonly maxRetries = 3;

  constructor() {
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        Accept: 'application/json',
      },
    });

    const apiKey = process.env.GECKOTERMINAL_API_KEY;
    if (apiKey) {
      this.client.defaults.headers.common['X-API-Key'] = apiKey;
    }

    this.client.interceptors.response.use(
      (response) => {
        const remaining = response.headers['x-ratelimit-remaining'];
        const limit = response.headers['x-ratelimit-limit'];
        if (remaining && limit) {
          logger.debug({ remaining, limit }, 'GeckoTerminal rate limit status');
        }
        return response;
      },
      async (error) => {
        if (
          error.response?.status === 429 &&
          error.config &&
          !error.config.__retryCount
        ) {
          error.config.__retryCount = 0;
        }

        if (
          error.response?.status === 429 &&
          error.config.__retryCount < this.maxRetries
        ) {
          error.config.__retryCount += 1;
          const delay = Math.pow(2, error.config.__retryCount) * 1000;
          logger.warn(
            {
              delay,
              attempt: error.config.__retryCount,
              maxRetries: this.maxRetries,
            },
            'GeckoTerminal rate limit hit, retrying'
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.client.request(error.config);
        }

        if (error.response?.status === 429) {
          logger.error('GeckoTerminal rate limit exceeded after max retries');
        }
        return Promise.reject(error);
      }
    );
  }

  async getNetworks(): Promise<Network[]> {
    try {
      const response = await this.client.get<NetworksResponse>('/networks');
      return response.data.data || [];
    } catch (error) {
      logger.error({ error }, 'Error fetching networks from GeckoTerminal');
      throw new Error(
        `Failed to fetch networks: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async getTrendingPools(networkId: string): Promise<TrendingPool[]> {
    try {
      const response = await this.client.get<TrendingPoolsResponse>(
        `/networks/${networkId}/trending_pools`
      );
      return response.data.data || [];
    } catch (error) {
      logger.error(
        { error, networkId },
        'Error fetching trending pools from GeckoTerminal'
      );
      throw new Error(
        `Failed to fetch trending pools: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async getPool(networkId: string, poolAddress: string): Promise<Pool | null> {
    try {
      const response = await this.client.get<{ data: Pool }>(
        `/networks/${networkId}/pools/${poolAddress}`
      );
      return response.data.data || null;
    } catch (error) {
      logger.error(
        { error, poolAddress, networkId },
        'Error fetching pool from GeckoTerminal'
      );
      throw new Error(
        `Failed to fetch pool: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async getMultiplePools(
    networkId: string,
    poolAddresses: string[]
  ): Promise<Pool[]> {
    if (poolAddresses.length === 0) {
      return [];
    }

    if (poolAddresses.length > 30) {
      throw new Error('Maximum 30 pool addresses allowed per request');
    }

    try {
      const addresses = poolAddresses.join(',');
      const response = await this.client.get<PoolsResponse>(
        `/networks/${networkId}/pools/multi/${addresses}`
      );
      return response.data.data || [];
    } catch (error) {
      logger.error(
        { error, networkId, poolCount: poolAddresses.length },
        'Error fetching multiple pools from GeckoTerminal'
      );
      throw new Error(
        `Failed to fetch pools: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async getTokenPools(
    networkId: string,
    tokenAddress: string
  ): Promise<Pool[]> {
    try {
      const response = await this.client.get<PoolsResponse>(
        `/networks/${networkId}/tokens/${tokenAddress}/pools`
      );
      return response.data.data || [];
    } catch (error) {
      logger.error(
        { error, tokenAddress, networkId },
        'Error fetching pools for token from GeckoTerminal'
      );
      throw new Error(
        `Failed to fetch token pools: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async getNewPools(networkId: string, page: number = 1): Promise<Pool[]> {
    try {
      const response = await this.client.get<PoolsResponse>(
        `/networks/${networkId}/new_pools`,
        { params: { page } }
      );
      return response.data.data || [];
    } catch (error) {
      logger.error(
        { error, networkId, page },
        'Error fetching new pools from GeckoTerminal'
      );
      throw new Error(
        `Failed to fetch new pools: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async searchPools(query: string, networkId?: string): Promise<Pool[]> {
    try {
      const endpoint = networkId
        ? `/networks/${networkId}/pools/search`
        : `/search/pools`;

      const response = await this.client.get<PoolsResponse>(endpoint, {
        params: { query },
      });
      return response.data.data || [];
    } catch (error) {
      logger.error(
        { error, query, networkId },
        'Error searching pools on GeckoTerminal'
      );
      throw new Error(
        `Failed to search pools: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async getPoolOHLCV(
    networkId: string,
    poolAddress: string,
    timeframe: 'day' | 'hour' | 'minute' = 'hour',
    aggregate: number = 1,
    beforeTimestamp?: number,
    limit: number = 100
  ): Promise<any[]> {
    try {
      const response = await this.client.get(
        `/networks/${networkId}/pools/${poolAddress}/ohlcv/${timeframe}`,
        {
          params: {
            aggregate,
            before_timestamp: beforeTimestamp,
            limit: Math.min(limit, 1000),
          },
        }
      );
      return response.data.data?.attributes?.ohlcv_list || [];
    } catch (error) {
      logger.error(
        { error, poolAddress, networkId, timeframe, aggregate },
        'Error fetching OHLCV data from GeckoTerminal'
      );
      throw new Error(
        `Failed to fetch OHLCV data: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}

export default new GeckoTerminalClient();
