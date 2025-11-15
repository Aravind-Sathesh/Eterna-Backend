import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';

/**
 * Create a structured logger instance with Pino
 * @param service - The service name (e.g., 'data-aggregator', 'api-gateway')
 * @param options - Additional logger options
 */
export function createLogger(service: string, options?: pino.LoggerOptions) {
  return pino({
    name: service,
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    formatters: {
      level: (label) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...options,
    ...(isDevelopment && {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      },
    }),
  });
}

/**
 * Create a child logger with additional context
 */
export function createChildLogger(
  logger: pino.Logger,
  bindings: pino.Bindings
) {
  return logger.child(bindings);
}

export type Logger = pino.Logger;
