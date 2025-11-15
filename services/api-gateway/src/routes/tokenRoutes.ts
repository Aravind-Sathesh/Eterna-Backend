import { Router, Request, Response } from 'express';
import { getCache, CACHE_KEYS, createLogger } from '@eterna/redis-client';

const logger = createLogger('token-routes');
import { AggregatedToken } from '@eterna/types';

const router = Router();

router.get('/tokens', async (req: Request, res: Response): Promise<void> => {
  try {
    let tokens = await getCache<AggregatedToken[]>(CACHE_KEYS.TOKENS_LATEST);

    if (!tokens || tokens.length === 0) {
      res.status(503).json({
        message: 'Data is not yet available. Please try again in a moment.',
        data: [],
      });
      return;
    }

    const sortBy = (req.query.sortBy as string) || 'volume_usd_24h';
    const sortOrder = (req.query.sortOrder as string) || 'desc';

    const validSortFields = [
      'volume_usd_24h',
      'price_usd',
      'market_cap_usd',
      'transaction_count_24h',
      'price_1hr_change_usd',
      'price_24hr_change_usd',
      'liquidity_usd',
    ];

    if (validSortFields.includes(sortBy)) {
      tokens.sort((a, b) => {
        const valA = (a[sortBy as keyof AggregatedToken] as number) || 0;
        const valB = (b[sortBy as keyof AggregatedToken] as number) || 0;
        return sortOrder === 'desc' ? valB - valA : valA - valB;
      });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const cursor = parseInt(req.query.cursor as string) || 0;

    const minVolume = req.query.minVolume
      ? parseFloat(req.query.minVolume as string)
      : undefined;
    const minPrice = req.query.minPrice
      ? parseFloat(req.query.minPrice as string)
      : undefined;
    const maxPrice = req.query.maxPrice
      ? parseFloat(req.query.maxPrice as string)
      : undefined;

    if (minVolume !== undefined) {
      tokens = tokens.filter((t) => t.volume_usd_24h >= minVolume);
    }

    if (minPrice !== undefined) {
      tokens = tokens.filter((t) => t.price_usd >= minPrice);
    }

    if (maxPrice !== undefined) {
      tokens = tokens.filter((t) => t.price_usd <= maxPrice);
    }

    const paginatedTokens = tokens.slice(cursor, cursor + limit);

    res.json({
      data: paginatedTokens,
      meta: {
        total: tokens.length,
        limit,
        cursor,
        nextCursor: cursor + limit < tokens.length ? cursor + limit : null,
      },
    });
  } catch (error) {
    logger.error({ error }, 'Error in /tokens route');
    res.status(500).json({
      message: 'Internal Server Error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get(
  '/tokens/stats',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const stats = await getCache(CACHE_KEYS.TOKENS_STATS);

      if (!stats) {
        res.status(503).json({
          message: 'Statistics not yet available.',
        });
        return;
      }

      res.json(stats);
    } catch (error) {
      logger.error({ error }, 'Error in /tokens/stats route');
      res.status(500).json({
        message: 'Internal Server Error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

router.get(
  '/tokens/trending',
  async (req: Request, res: Response): Promise<void> => {
    try {
      let tokens = await getCache<AggregatedToken[]>(
        CACHE_KEYS.TOKENS_BY_VOLUME
      );

      if (!tokens || tokens.length === 0) {
        res.status(503).json({
          message: 'Data is not yet available.',
          data: [],
        });
        return;
      }

      const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);

      res.json({
        data: tokens.slice(0, limit),
        meta: {
          total: tokens.length,
          limit,
        },
      });
    } catch (error) {
      logger.error({ error }, 'Error in /tokens/trending route');
      res.status(500).json({
        message: 'Internal Server Error',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
