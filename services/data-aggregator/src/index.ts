import dotenv from 'dotenv';
import cron from 'node-cron';
import {
  fetchAndProcessTokenData,
  getDataStatistics,
} from './core/dataProcessor';
import {
  redisClient,
  setCache,
  CACHE_KEYS,
  CACHE_TTL,
  isRedisConnected,
} from './clients/redis';

dotenv.config();

const PORT = process.env.PORT || 3001;

// Track aggregation statistics
let aggregationCount = 0;

async function runDataAggregation() {
  const runId = ++aggregationCount;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Run #${runId}] Starting data aggregation cycle...`);
  console.log(`[Run #${runId}] Time: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(60)}\n`);

  try {
    if (!isRedisConnected()) {
      console.warn(
        '[Warning] Redis is not connected. Data will not be cached.'
      );
    }

    const tokens = await fetchAndProcessTokenData();

    if (tokens.length === 0) {
      console.warn('[Run #${runId}]  No tokens found. Skipping cache update.');
      return;
    }

    const stats = getDataStatistics(tokens);

    const cachePromises = [];

    cachePromises.push(
      setCache(CACHE_KEYS.TOKENS_LATEST, tokens, CACHE_TTL.TOKENS)
    );

    cachePromises.push(
      setCache(
        CACHE_KEYS.TOKENS_STATS,
        {
          ...stats,
          lastUpdate: new Date().toISOString(),
          runId,
        },
        CACHE_TTL.STATS
      )
    );

    const topByVolume = tokens.slice(0, 50); // Top 50 by volume
    cachePromises.push(
      setCache(CACHE_KEYS.TOKENS_BY_VOLUME, topByVolume, CACHE_TTL.TOKENS)
    );

    cachePromises.push(
      setCache(CACHE_KEYS.LAST_UPDATE, Date.now(), CACHE_TTL.SYSTEM)
    );

    await Promise.all(cachePromises);

    console.log(`\n[Run #${runId}] Statistics:`);
    console.log(`  • Total tokens: ${stats.total}`);
    console.log(`  • DexScreener: ${stats.bySource.dexscreener}`);
    console.log(`  • GeckoTerminal: ${stats.bySource.geckoterminal}`);
    console.log(
      `  • Average 24h volume: $${stats.avgVolume.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })}`
    );
    console.log(
      `  • Average price: $${stats.avgPrice.toLocaleString(undefined, {
        maximumFractionDigits: 6,
      })}`
    );
    console.log(`\n[Run #${runId}] Data aggregation completed successfully!`);
    console.log(`[Run #${runId}] Cached ${tokens.length} tokens to Redis\n`);
  } catch (error) {
    console.error(`\n[Run #${runId}] Error during data aggregation:`, error);
    console.error(`[Run #${runId}] Stack:`, (error as Error).stack);
  }
}

async function shutdown(signal: string) {
  console.log(`\n\n${signal} received. Shutting down gracefully...`);

  console.log('Closing Redis connection...');
  await redisClient.quit();

  console.log('Shutdown complete.');
  process.exit(0);
}

async function main() {
  console.log('\nData Aggregator Service Starting...\n');
  console.log('Configuration:');
  console.log(`  • Port: ${PORT}`);
  console.log(
    `  • Redis URL: ${process.env.REDIS_URL || 'redis://127.0.0.1:6379'}`
  );
  console.log(`  • Update interval: Every 30 seconds`);
  console.log(`  • Cache TTL: ${CACHE_TTL.TOKENS} seconds\n`);

  if (!isRedisConnected()) {
    console.log('Waiting for Redis connection...');
    await new Promise<void>((resolve) => {
      redisClient.once('ready', () => resolve());
      setTimeout(() => resolve(), 5000);
    });
  }

  console.log('Running initial data aggregation...\n');
  await runDataAggregation();

  console.log('\nScheduling periodic aggregation (every 30 seconds)...\n');
  cron.schedule('*/30 * * * * *', runDataAggregation);

  console.log('Data Aggregator service is now running!\n');
  console.log('Press Ctrl+C to stop the service.\n');

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('Fatal error during startup:', error);
  process.exit(1);
});
