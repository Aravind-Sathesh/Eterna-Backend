import type { AggregatedToken } from '@eterna/types';
import { createLogger } from '@eterna/redis-client';

const logger = createLogger('diff-calculator');

export interface TokenDiff {
  new: AggregatedToken[];
  updated: AggregatedToken[];
  removed: string[];
}

export interface TokenChange {
  token: AggregatedToken;
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
}

export class DiffCalculator {
  private previousState: Map<string, AggregatedToken> = new Map();
  private significantFields = [
    'price_usd',
    'price_sol',
    'volume_usd_24h',
    'market_cap_usd',
    'liquidity_usd',
    'transaction_count_24h',
    'price_1hr_change_usd',
    'price_24hr_change_usd',
  ];

  calculateDiff(newTokens: AggregatedToken[]): TokenDiff {
    const diff: TokenDiff = {
      new: [],
      updated: [],
      removed: [],
    };

    const newState = new Map<string, AggregatedToken>();

    newTokens.forEach((token) => {
      newState.set(token.token_address, token);

      const previous = this.previousState.get(token.token_address);

      if (!previous) {
        diff.new.push(token);
      } else {
        if (this.hasSignificantChanges(previous, token)) {
          diff.updated.push(token);
        }
      }
    });

    this.previousState.forEach((_, address) => {
      if (!newState.has(address)) {
        diff.removed.push(address);
      }
    });

    this.previousState = newState;

    logger.debug(
      {
        new: diff.new.length,
        updated: diff.updated.length,
        removed: diff.removed.length,
        total: newTokens.length,
      },
      'Calculated token diff'
    );

    return diff;
  }

  private hasSignificantChanges(
    previous: AggregatedToken,
    current: AggregatedToken
  ): boolean {
    for (const field of this.significantFields) {
      const oldValue = (previous as any)[field];
      const newValue = (current as any)[field];

      if (oldValue === undefined && newValue === undefined) continue;
      if (oldValue === undefined || newValue === undefined) return true;

      // For numeric fields, check if change is significant (> 0.1%)
      if (typeof newValue === 'number' && typeof oldValue === 'number') {
        if (oldValue === 0 && newValue !== 0) return true;
        if (oldValue !== 0) {
          const percentChange = Math.abs((newValue - oldValue) / oldValue);
          if (percentChange > 0.001) return true; // 0.1% change threshold
        }
      } else if (oldValue !== newValue) {
        return true;
      }
    }

    return false;
  }

  getTokenChanges(
    previous: AggregatedToken,
    current: AggregatedToken
  ): TokenChange {
    const changes: TokenChange['changes'] = [];

    this.significantFields.forEach((field) => {
      const oldValue = (previous as any)[field];
      const newValue = (current as any)[field];

      if (oldValue !== newValue) {
        changes.push({
          field,
          oldValue,
          newValue,
        });
      }
    });

    return {
      token: current,
      changes,
    };
  }

  static isEmpty(diff: TokenDiff): boolean {
    return (
      diff.new.length === 0 &&
      diff.updated.length === 0 &&
      diff.removed.length === 0
    );
  }

  getStateSize(): number {
    return this.previousState.size;
  }

  reset(): void {
    this.previousState.clear();
    logger.info('Diff calculator state reset');
  }

  initializeState(tokens: AggregatedToken[]): void {
    this.previousState.clear();
    tokens.forEach((token) => {
      this.previousState.set(token.token_address, token);
    });
    logger.info(
      { tokenCount: tokens.length },
      'Diff calculator state initialized'
    );
  }
}
