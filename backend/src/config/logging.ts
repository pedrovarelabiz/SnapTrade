import type { LoggerOptions } from 'pino';

/**
 * Security event types for webhook operations
 */
export enum SecurityEventType {
  WEBHOOK_VERIFICATION_SUCCESS = 'webhook.verification.success',
  WEBHOOK_VERIFICATION_FAILURE = 'webhook.verification.failure',
  WEBHOOK_SIGNATURE_INVALID = 'webhook.signature.invalid',
  WEBHOOK_REPLAY_DETECTED = 'webhook.replay.detected',
  WEBHOOK_TIMESTAMP_EXPIRED = 'webhook.timestamp.expired',
  WEBHOOK_UNAUTHORIZED_SOURCE = 'webhook.unauthorized.source',
}

/**
 * Sensitive fields that should be redacted from logs
 */
const SENSITIVE_FIELDS = [
  'signature',
  'transmissionSig',
  'paypal-transmission-sig',
  'authorization',
  'Authorization',
  'password',
  'secret',
  'token',
  'apiKey',
  'api_key',
  'credential',
  'privateKey',
  'private_key',
];

/**
 * Redacts sensitive data from log objects
 */
export function redactSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }

  const redacted: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    const isSensitive = SENSITIVE_FIELDS.some(field =>
      lowerKey.includes(field.toLowerCase())
    );

    if (isSensitive) {
      redacted[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Webhook security logging configuration
 */
export const webhookSecurityConfig = {
  /**
   * Dedicated log level for security events
   * - 'warn' for failed verifications (potential attacks)
   * - 'info' for successful verifications
   */
  securityLogLevel: process.env.SECURITY_LOG_LEVEL || 'warn',

  /**
   * Enable detailed security logging
   */
  enableDetailedSecurityLogs: process.env.ENABLE_DETAILED_SECURITY_LOGS === 'true',

  /**
   * Log retention policy (in days) for audit compliance
   */
  auditLogRetentionDays: parseInt(process.env.AUDIT_LOG_RETENTION_DAYS || '90', 10),

  /**
   * Path for audit logs (separate from application logs)
   */
  auditLogPath: process.env.AUDIT_LOG_PATH || '/var/log/snaptrade/audit',

  /**
   * Enable automatic log rotation
   */
  enableLogRotation: process.env.ENABLE_LOG_ROTATION !== 'false',

  /**
   * Maximum log file size before rotation (in MB)
   */
  maxLogFileSizeMB: parseInt(process.env.MAX_LOG_FILE_SIZE_MB || '100', 10),
};

/**
 * Format webhook security event for logging
 */
export function formatWebhookSecurityEvent(
  eventType: SecurityEventType,
  details: Record<string, any>
): Record<string, any> {
  return {
    timestamp: new Date().toISOString(),
    eventType,
    category: 'security',
    subcategory: 'webhook',
    ...redactSensitiveData(details),
  };
}

/**
 * Pino logger configuration with security enhancements
 */
export const securityLoggerOptions: Partial<LoggerOptions> = {
  level: webhookSecurityConfig.securityLogLevel,
  redact: {
    paths: SENSITIVE_FIELDS.map(field => `*.${field}`),
    remove: false,
    censor: '[REDACTED]',
  },
  formatters: {
    level(label) {
      return { level: label.toUpperCase() };
    },
    bindings(bindings) {
      return {
        pid: bindings.pid,
        hostname: bindings.hostname,
        service: bindings.service || 'snaptrade-backend',
      };
    },
  },
  serializers: {
    req(req) {
      return redactSensitiveData({
        method: req.method,
        url: req.url,
        headers: req.headers,
        remoteAddress: req.remoteAddress,
        remotePort: req.remotePort,
      });
    },
    res(res) {
      return {
        statusCode: res.statusCode,
        headers: redactSensitiveData(res.getHeaders()),
      };
    },
    err: pino.stdSerializers.err,
  },
};

// Import pino for serializers
import pino from 'pino';

/**
 * Helper function to log webhook security events
 */
export function logWebhookSecurityEvent(
  logger: any,
  eventType: SecurityEventType,
  details: Record<string, any>
): void {
  const formattedEvent = formatWebhookSecurityEvent(eventType, details);

  const logLevel = eventType.includes('success') ? 'info' : 'warn';

  logger[logLevel](formattedEvent, `Webhook security event: ${eventType}`);
}

export default {
  webhookSecurityConfig,
  securityLoggerOptions,
  redactSensitiveData,
  formatWebhookSecurityEvent,
  logWebhookSecurityEvent,
  SecurityEventType,
};
