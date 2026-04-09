import { createLogger, format, transports } from 'winston';

/**
 * Logger configuration for backup operations
 */
export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  ),
  defaultMeta: { service: 'backup-service' },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ level, message, timestamp, ...metadata }) => {
          let msg = `${timestamp} [${level}]: ${message}`;
          if (Object.keys(metadata).length > 0) {
            msg += ` ${JSON.stringify(metadata)}`;
          }
          return msg;
        })
      ),
    }),
  ],
});

/**
 * Generate a timestamp-based backup filename
 * @param prefix - Optional prefix for the filename
 * @param extension - File extension (default: 'sql')
 * @returns Backup filename with timestamp
 */
export function generateBackupFilename(prefix: string = 'backup', extension: string = 'sql'): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('Z')[0];
  return `${prefix}_${timestamp}.${extension}`;
}

/**
 * Format bytes to human-readable size
 * @param bytes - Number of bytes
 * @param decimals - Number of decimal places (default: 2)
 * @returns Human-readable string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';
  if (bytes < 0) return 'Invalid';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Validate that all required environment variables are set
 * @param requiredVars - Array of required environment variable names
 * @throws Error if any required variable is missing
 */
export function validateEnvironmentVariables(requiredVars: string[]): void {
  const missingVars: string[] = [];
  const errors: string[] = [];

  // Check for DATABASE_URL
  if (!process.env.DATABASE_URL) {
    errors.push('DATABASE_URL is required for database connection');
  }

  // Check for AWS credentials
  if (!process.env.AWS_ACCESS_KEY_ID) {
    errors.push('AWS_ACCESS_KEY_ID is required for S3 access');
  }

  if (!process.env.AWS_SECRET_ACCESS_KEY) {
    errors.push('AWS_SECRET_ACCESS_KEY is required for S3 access');
  }

  // Check for AWS region
  if (!process.env.AWS_REGION) {
    errors.push('AWS_REGION is required for S3 configuration');
  }

  // Check for S3 backup bucket
  if (!process.env.S3_BACKUP_BUCKET) {
    errors.push('S3_BACKUP_BUCKET is required for backup storage');
  }

  // Check for backup encryption key with minimum length requirement
  if (!process.env.BACKUP_ENCRYPTION_KEY) {
    errors.push('BACKUP_ENCRYPTION_KEY is required for secure backups');
  } else if (process.env.BACKUP_ENCRYPTION_KEY.length < 32) {
    errors.push('BACKUP_ENCRYPTION_KEY must be at least 32 characters long');
  }

  // ALERT_BOT_TOKEN is optional - no validation needed

  // Check for any additional required vars passed as parameter
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  }

  if (missingVars.length > 0) {
    errors.push(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  if (errors.length > 0) {
    const errorMsg = 'Environment validation failed:\n  - ' + errors.join('\n  - ');
    logger.error(errorMsg);
    throw new Error(errorMsg);
  }

  logger.info('All required environment variables are set', {
    variables: ['DATABASE_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'S3_BACKUP_BUCKET', 'BACKUP_ENCRYPTION_KEY', ...requiredVars]
  });
}

/**
 * Common environment variables for backup operations
 */
export const BACKUP_ENV_VARS = {
  REQUIRED: [
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'BACKUP_BUCKET',
  ],
  OPTIONAL: [
    'BACKUP_RETENTION_DAYS',
    'LOG_LEVEL',
    'BACKUP_PREFIX',
  ],
};
