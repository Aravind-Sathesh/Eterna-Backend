import request from 'supertest';
import express, { Express } from 'express';
import { AggregatedToken } from '@eterna/types';

// Mock the Redis client module
const mockGetCache = jest.fn();
jest.mock('@eterna/redis-client', () => ({
  getCache: mockGetCache,
  CACHE_KEYS: {
    TOKENS_LATEST: 'tokens:latest',
    TOKENS_STATS: 'tokens:stats',
    TOKENS_BY_VOLUME: 'tokens:by_volume',
  },
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  })),
}));

// Import routes after mocking
import tokenRoutes from '../src/routes/tokenRoutes';

describe('Token Routes Integration Tests', () => {
  let app: Express;

  // Sample token data
  const mockTokens: AggregatedToken[] = [
    {
      token_address: '0xtoken1',
      token_name: 'Token One',
      token_ticker: 'TK1',
      price_usd: 100,
      volume_usd_24h: 1000000,
      transaction_count_24h: 500,
      market_cap_usd: 5000000,
      liquidity_usd: 250000,
      price_1hr_change_usd: 2.5,
      price_24hr_change_usd: 10.0,
      protocol: 'raydium',
      source: 'dexscreener',
      last_updated: Date.now(),
    },
    {
      token_address: '0xtoken2',
      token_name: 'Token Two',
      token_ticker: 'TK2',
      price_usd: 50,
      volume_usd_24h: 500000,
      transaction_count_24h: 300,
      market_cap_usd: 2500000,
      liquidity_usd: 150000,
      price_1hr_change_usd: 1.5,
      price_24hr_change_usd: 5.0,
      protocol: 'orca',
      source: 'geckoterminal',
      last_updated: Date.now(),
    },
    {
      token_address: '0xtoken3',
      token_name: 'Token Three',
      token_ticker: 'TK3',
      price_usd: 25,
      volume_usd_24h: 250000,
      transaction_count_24h: 150,
      market_cap_usd: 1250000,
      liquidity_usd: 75000,
      price_1hr_change_usd: 0.5,
      price_24hr_change_usd: 2.0,
      protocol: 'raydium',
      source: 'dexscreener',
      last_updated: Date.now(),
    },
    {
      token_address: '0xtoken4',
      token_name: 'Token Four',
      token_ticker: 'TK4',
      price_usd: 10,
      volume_usd_24h: 100000,
      transaction_count_24h: 75,
      market_cap_usd: 500000,
      liquidity_usd: 40000,
      price_1hr_change_usd: -0.5,
      price_24hr_change_usd: -1.0,
      protocol: 'orca',
      source: 'geckoterminal',
      last_updated: Date.now(),
    },
    {
      token_address: '0xtoken5',
      token_name: 'Token Five',
      token_ticker: 'TK5',
      price_usd: 5,
      volume_usd_24h: 50000,
      transaction_count_24h: 50,
      market_cap_usd: 250000,
      liquidity_usd: 20000,
      price_1hr_change_usd: 0.1,
      price_24hr_change_usd: 0.5,
      protocol: 'raydium',
      source: 'dexscreener',
      last_updated: Date.now(),
    },
    {
      token_address: '0xtoken6',
      token_name: 'Token Six',
      token_ticker: 'TK6',
      price_usd: 2,
      volume_usd_24h: 25000,
      transaction_count_24h: 25,
      market_cap_usd: 125000,
      liquidity_usd: 10000,
      price_1hr_change_usd: 0.0,
      price_24hr_change_usd: 0.0,
      protocol: 'orca',
      source: 'geckoterminal',
      last_updated: Date.now(),
    },
  ];

  beforeEach(() => {
    // Set up Express app
    app = express();
    app.use(express.json());
    app.use('/api', tokenRoutes);

    // Reset mock
    mockGetCache.mockReset();
  });

  describe('GET /api/tokens', () => {
    it('should return 200 OK with correct data structure', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get('/api/tokens');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('meta');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.meta).toHaveProperty('total');
      expect(response.body.meta).toHaveProperty('limit');
      expect(response.body.meta).toHaveProperty('cursor');
      expect(response.body.meta).toHaveProperty('nextCursor');
    });

    it('should return 503 when no data is available', async () => {
      mockGetCache.mockResolvedValue(null);

      const response = await request(app).get('/api/tokens');

      expect(response.status).toBe(503);
      expect(response.body).toHaveProperty('message');
      expect(response.body.data).toEqual([]);
    });

    it('should return tokens sorted by volume_usd_24h by default', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get('/api/tokens');

      expect(response.status).toBe(200);
      const tokens = response.body.data;

      // Verify tokens are sorted by volume in descending order
      for (let i = 0; i < tokens.length - 1; i++) {
        expect(tokens[i].volume_usd_24h).toBeGreaterThanOrEqual(
          tokens[i + 1].volume_usd_24h
        );
      }
    });
  });

  describe('GET /api/tokens with sortBy parameter', () => {
    it('should sort tokens by price_usd when sortBy=price_usd', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get('/api/tokens?sortBy=price_usd');

      expect(response.status).toBe(200);
      const tokens = response.body.data;

      // Verify tokens are sorted by price in descending order
      for (let i = 0; i < tokens.length - 1; i++) {
        expect(tokens[i].price_usd).toBeGreaterThanOrEqual(
          tokens[i + 1].price_usd
        );
      }
    });

    it('should sort tokens by market_cap_usd when sortBy=market_cap_usd', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get(
        '/api/tokens?sortBy=market_cap_usd'
      );

      expect(response.status).toBe(200);
      const tokens = response.body.data;

      // Verify tokens are sorted by market cap in descending order
      for (let i = 0; i < tokens.length - 1; i++) {
        expect(tokens[i].market_cap_usd).toBeGreaterThanOrEqual(
          tokens[i + 1].market_cap_usd
        );
      }
    });

    it('should sort in ascending order when sortOrder=asc', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get(
        '/api/tokens?sortBy=price_usd&sortOrder=asc'
      );

      expect(response.status).toBe(200);
      const tokens = response.body.data;

      // Verify tokens are sorted by price in ascending order
      for (let i = 0; i < tokens.length - 1; i++) {
        expect(tokens[i].price_usd).toBeLessThanOrEqual(
          tokens[i + 1].price_usd
        );
      }
    });
  });

  describe('GET /api/tokens with pagination', () => {
    it('should respect limit parameter', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get('/api/tokens?limit=3');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(3);
      expect(response.body.meta.limit).toBe(3);
    });

    it('should respect cursor parameter', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get('/api/tokens?cursor=2&limit=2');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.meta.cursor).toBe(2);

      // Verify we got the third and fourth tokens (indices 2 and 3)
      expect(response.body.data[0].token_address).toBe('0xtoken3');
      expect(response.body.data[1].token_address).toBe('0xtoken4');
    });

    it('should use limit=5 and cursor=5 correctly', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get('/api/tokens?limit=5&cursor=5');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1); // Only 1 token left (6 total, starting at index 5)
      expect(response.body.meta.limit).toBe(5);
      expect(response.body.meta.cursor).toBe(5);
      expect(response.body.meta.nextCursor).toBeNull();
    });

    it('should set nextCursor correctly when more data available', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get('/api/tokens?limit=2&cursor=0');

      expect(response.status).toBe(200);
      expect(response.body.meta.nextCursor).toBe(2);
    });

    it('should set nextCursor to null when no more data', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get('/api/tokens?limit=10&cursor=0');

      expect(response.status).toBe(200);
      expect(response.body.meta.nextCursor).toBeNull();
    });

    it('should enforce maximum limit of 100', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get('/api/tokens?limit=200');

      expect(response.status).toBe(200);
      expect(response.body.meta.limit).toBe(100); // Should be capped at 100
    });
  });

  describe('GET /api/tokens with invalid parameters', () => {
    it('should handle invalid sortBy parameter gracefully', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get(
        '/api/tokens?sortBy=invalid_field'
      );

      // Should not crash, should return data with default sorting
      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });

    it('should handle non-numeric limit gracefully', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get('/api/tokens?limit=abc');

      expect(response.status).toBe(200);
      // Should use default limit when parsing fails
      expect(response.body.data).toBeDefined();
    });

    it('should handle non-numeric cursor gracefully', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get('/api/tokens?cursor=xyz');

      expect(response.status).toBe(200);
      // Should use default cursor (0) when parsing fails
      expect(response.body.meta.cursor).toBe(0);
    });
  });

  describe('GET /api/tokens with filters', () => {
    it('should filter by minimum volume', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get('/api/tokens?minVolume=500000');

      expect(response.status).toBe(200);
      const tokens = response.body.data;

      tokens.forEach((token: AggregatedToken) => {
        expect(token.volume_usd_24h).toBeGreaterThanOrEqual(500000);
      });
    });

    it('should filter by price range', async () => {
      mockGetCache.mockResolvedValue(mockTokens);

      const response = await request(app).get(
        '/api/tokens?minPrice=10&maxPrice=60'
      );

      expect(response.status).toBe(200);
      const tokens = response.body.data;

      tokens.forEach((token: AggregatedToken) => {
        expect(token.price_usd).toBeGreaterThanOrEqual(10);
        expect(token.price_usd).toBeLessThanOrEqual(60);
      });
    });
  });

  describe('Error handling', () => {
    it('should return 500 on internal server error', async () => {
      mockGetCache.mockRejectedValue(new Error('Redis connection failed'));

      const response = await request(app).get('/api/tokens');

      expect(response.status).toBe(500);
      expect(response.body).toHaveProperty('message', 'Internal Server Error');
      expect(response.body).toHaveProperty('error');
    });
  });
});
