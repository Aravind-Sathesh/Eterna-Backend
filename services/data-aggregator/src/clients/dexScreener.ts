import axios, { AxiosInstance } from 'axios';
import { createLogger } from '@eterna/redis-client';

const logger = createLogger('dexscreener-client');

interface TokenProfile {
  url: string;
  chainId: string;
  tokenAddress: string;
  icon?: string;
  header?: string;
  description?: string;
  links?: {
    type: string;
    label: string;
    url: string;
  }[];
}

interface TokenPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd?: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h6: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h6: number;
    h24: number;
  };
  liquidity?: {
    usd?: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: { label: string; url: string }[];
    socials?: { type: string; url: string }[];
  };
}

interface SearchResponse {
  schemaVersion: string;
  pairs: TokenPair[];
}

interface TokenResponse {
  schemaVersion: string;
  pairs: TokenPair[];
}

interface TokenProfilesResponse {
  [tokenAddress: string]: TokenProfile;
}

export class DexScreenerClient {
  private client: AxiosInstance;
  private readonly baseURL = 'https://api.dexscreener.com/latest';
  private readonly maxRetries = 3;

  constructor() {
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        Accept: 'application/json',
      },
    });

    const apiKey = process.env.DEXSCREENER_API_KEY;
    if (apiKey) {
      this.client.defaults.headers.common['X-API-Key'] = apiKey;
    }

    this.client.interceptors.response.use(
      (response) => response,
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
            'DexScreener rate limit hit, retrying'
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.client.request(error.config);
        }

        return Promise.reject(error);
      }
    );
  }

  async searchPairs(query: string): Promise<TokenPair[]> {
    try {
      const response = await this.client.get<SearchResponse>(`/dex/search`, {
        params: { q: query },
      });
      return response.data.pairs || [];
    } catch (error) {
      logger.error({ error }, 'Error searching pairs on DexScreener');
      throw new Error(
        `Failed to search pairs: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async getTokenPairs(tokenAddresses: string[]): Promise<TokenPair[]> {
    if (tokenAddresses.length === 0) {
      return [];
    }

    if (tokenAddresses.length > 30) {
      throw new Error('Maximum 30 token addresses allowed per request');
    }

    try {
      const addresses = tokenAddresses.join(',');
      const response = await this.client.get<TokenResponse>(
        `/dex/tokens/${addresses}`
      );
      return response.data.pairs || [];
    } catch (error) {
      logger.error({ error }, 'Error fetching token pairs from DexScreener');
      throw new Error(
        `Failed to fetch token pairs: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async getPairsByAddress(pairAddresses: string[]): Promise<TokenPair[]> {
    if (pairAddresses.length === 0) {
      return [];
    }

    if (pairAddresses.length > 30) {
      throw new Error('Maximum 30 pair addresses allowed per request');
    }

    try {
      const addresses = pairAddresses.join(',');
      const response = await this.client.get<TokenResponse>(
        `/dex/pairs/${addresses}`
      );
      return response.data.pairs || [];
    } catch (error) {
      logger.error(
        { error },
        'Error fetching pairs by address from DexScreener'
      );
      throw new Error(
        `Failed to fetch pairs: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async getTokenProfiles(
    tokenAddresses: string[]
  ): Promise<TokenProfilesResponse> {
    if (tokenAddresses.length === 0) {
      return {};
    }

    try {
      const addresses = tokenAddresses.join(',');
      const response = await this.client.get<TokenProfilesResponse>(
        `/dex/tokens/profiles/${addresses}`
      );
      return response.data || {};
    } catch (error) {
      logger.error({ error }, 'Error fetching token profiles from DexScreener');
      throw new Error(
        `Failed to fetch token profiles: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async getLatestPairs(
    chainId: string,
    additionalQuery?: string
  ): Promise<TokenPair[]> {
    try {
      const query = additionalQuery ? `${chainId} ${additionalQuery}` : chainId;
      const response = await this.client.get<SearchResponse>(`/dex/search`, {
        params: { q: query },
      });

      const pairs = response.data.pairs || [];
      return pairs.filter(
        (pair) => pair.chainId.toLowerCase() === chainId.toLowerCase()
      );
    } catch (error) {
      logger.error(
        { error, chainId },
        'Error fetching latest pairs from DexScreener'
      );
      throw new Error(
        `Failed to fetch latest pairs: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}

export default new DexScreenerClient();
