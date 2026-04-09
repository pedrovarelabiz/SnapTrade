/**
 * Environment configuration for the Chrome extension
 */

export const SENTRY_DSN_EXTENSION = process.env.SENTRY_DSN || process.env.SENTRY_DSN_EXTENSION || '';

export const NODE_ENV = process.env.NODE_ENV || 'production';

export const IS_DEVELOPMENT = NODE_ENV === 'development';
export const IS_PRODUCTION = NODE_ENV === 'production';
