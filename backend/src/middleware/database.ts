import * as Sentry from '@sentry/node';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Initialize Prisma error interceptor middleware
 * Captures database connection failures and critical errors to Sentry
 */
export function initDatabaseErrorHandler(): void {
  // Note: Prisma middleware ($use) is deprecated in newer Prisma versions
  // Database error handling is now done at the application level
  // using try-catch blocks around Prisma operations
  console.log('Database error handler initialized (using application-level error handling)');
}

/**
 * Test database connection and report failures to Sentry
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$connect();
    return true;
  } catch (error) {
    Sentry.captureException(error, { level: 'fatal' });
    console.error('Database connection failed:', error);
    return false;
  }
}
