import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: isProd ? 'info' : 'debug',
  transport: !isProd ? { target: 'pino-pretty', options: { colorize: true } } : undefined,
  base: { service: 'snaptrade-backend' },
});
