import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';
import type { Express } from 'express';

export function initSentry(app?: Express): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.warn('SENTRY_DSN not configured, skipping Sentry initialization');
    return;
  }

  const environment = process.env.NODE_ENV || 'development';

  Sentry.init({
    dsn,
    environment,
    release: `snaptrade-backend@${process.env.npm_package_version}`,
    tracesSampler: (samplingContext) => {
      const transactionName = samplingContext.transactionContext?.name || '';
      const request = samplingContext.request;
      const path = request?.url || transactionName;

      // Admin routes get full monitoring
      if (path.includes('/admin')) {
        return 1.0;
      }

      // Webhook routes get 50% sampling
      if (path.includes('/webhook')) {
        return 0.5;
      }

      // All other routes get 10% sampling
      return 0.1;
    },
    beforeSend: (event, hint) => {
      // Filter out 404 errors
      if (event.exception?.values?.[0]?.value?.includes('404') ||
          event.contexts?.response?.status_code === 404 ||
          event.extra?.statusCode === 404 ||
          event.message?.includes('404') ||
          event.message?.toLowerCase().includes('not found')) {
        return null;
      }

      // Detect webhook verification failures - ALWAYS track as security events
      const originalError = hint?.originalException as Error;
      const originalErrorMessage = originalError?.message?.toLowerCase() || '';
      const requestUrl = event.request?.url || '';
      const isWebhookRequest = requestUrl.includes('/webhook');

      const isWebhookVerificationFailure = isWebhookRequest && (
        event.message?.toLowerCase().includes('invalid signature') ||
        event.message?.toLowerCase().includes('signature mismatch') ||
        originalErrorMessage.includes('invalid signature') ||
        originalErrorMessage.includes('signature mismatch')
      );

      // Track webhook verification failures as CRITICAL security events
      if (isWebhookVerificationFailure) {
        event.level = 'fatal';
        event.fingerprint = ['{{ default }}', 'webhook-verification-failure'];
        event.tags = {
          ...event.tags,
          security_event: 'webhook_verification_failure',
          severity: 'critical'
        };
        return event;
      }

      // Filter out normal auth failures (but not webhook verification)
      if (event.exception?.values?.[0]?.type?.includes('UnauthorizedError') ||
          event.exception?.values?.[0]?.type?.includes('AuthenticationError') ||
          event.message?.toLowerCase().includes('unauthorized') ||
          event.message?.toLowerCase().includes('authentication failed') ||
          originalErrorMessage.includes('unauthorized') ||
          originalErrorMessage.includes('authentication failed') ||
          originalErrorMessage.includes('invalid token')) {
        return null;
      }

      // Add fingerprinting for error grouping
      const exceptionType = event.exception?.values?.[0]?.type || '';
      const exceptionValue = event.exception?.values?.[0]?.value || '';
      const errorMessage = event.message || '';

      // Group database errors together
      if (exceptionType.includes('PrismaClientKnownRequestError') ||
          exceptionType.includes('PrismaClientUnknownRequestError') ||
          exceptionType.includes('PrismaClientValidationError') ||
          exceptionType.includes('DatabaseError') ||
          exceptionValue.match(/database|prisma|connection pool|query timeout|deadlock/i) ||
          errorMessage.match(/database|prisma|connection pool|query timeout|deadlock/i)) {
        event.fingerprint = ['{{ default }}', 'database-error'];
      }

      // Group rate limit errors together
      if (exceptionType.includes('RateLimitError') ||
          exceptionType.includes('TooManyRequestsError') ||
          exceptionValue.match(/rate limit|too many requests|429/i) ||
          errorMessage.match(/rate limit|too many requests|429/i) ||
          event.contexts?.response?.status_code === 429) {
        event.fingerprint = ['{{ default }}', 'rate-limit-error'];
      }

      // Group external API failures together by service
      if (exceptionType.includes('ApiError') ||
          exceptionType.includes('HTTPError') ||
          exceptionValue.match(/api request failed|external api|upstream/i) ||
          errorMessage.match(/api request failed|external api|upstream/i)) {
        // Try to extract the service name from the URL or error message
        const urlMatch = exceptionValue.match(/https?:\/\/([^\/\s]+)/) ||
                        errorMessage.match(/https?:\/\/([^\/\s]+)/);
        const serviceName = urlMatch ? urlMatch[1].split('.')[0] : 'unknown-service';
        event.fingerprint = ['{{ default }}', 'external-api-error', serviceName];
      }

      // Strip sensitive data from request body
      if (event.request?.data) {
        const sensitiveFields = ['password', 'token', 'access_token', 'refresh_token', 'api_key', 'apiKey', 'secret', 'creditCard', 'credit_card', 'cardNumber', 'cvv', 'ssn'];

        if (typeof event.request.data === 'string') {
          try {
            const parsed = JSON.parse(event.request.data);
            sensitiveFields.forEach(field => {
              if (parsed[field]) {
                parsed[field] = '[REDACTED]';
              }
            });
            event.request.data = JSON.stringify(parsed);
          } catch {
            // Not JSON, apply basic redaction
            sensitiveFields.forEach(field => {
              event.request!.data = event.request!.data.replace(
                new RegExp(`("${field}"\\s*:\\s*")[^"]*"`, 'gi'),
                '$1[REDACTED]"'
              );
            });
          }
        } else if (typeof event.request.data === 'object') {
          sensitiveFields.forEach(field => {
            if (event.request!.data[field]) {
              event.request!.data[field] = '[REDACTED]';
            }
          });
        }
      }

      // Strip sensitive data from extra context
      if (event.extra) {
        Object.keys(event.extra).forEach(key => {
          if (key.toLowerCase().includes('password') ||
              key.toLowerCase().includes('token') ||
              key.toLowerCase().includes('secret')) {
            event.extra![key] = '[REDACTED]';
          }
        });
      }

      return event;
    },
    beforeBreadcrumb: (breadcrumb, hint) => {
      // Categorize breadcrumbs
      if (breadcrumb.category?.includes('http') || breadcrumb.type === 'http') {
        breadcrumb.category = 'http';
      } else if (breadcrumb.message?.toLowerCase().includes('prisma') ||
                 breadcrumb.message?.toLowerCase().includes('query') ||
                 breadcrumb.category?.includes('db') ||
                 breadcrumb.category?.includes('database')) {
        breadcrumb.category = 'db';
      } else if (breadcrumb.message?.toLowerCase().includes('auth') ||
                 breadcrumb.message?.toLowerCase().includes('login') ||
                 breadcrumb.message?.toLowerCase().includes('logout') ||
                 breadcrumb.category?.includes('auth')) {
        breadcrumb.category = 'auth';
      }

      // Limit breadcrumb data to 1KB to avoid bloat
      if (breadcrumb.data) {
        const dataStr = JSON.stringify(breadcrumb.data);
        if (dataStr.length > 1024) {
          try {
            breadcrumb.data = JSON.parse(dataStr.substring(0, 1024));
          } catch {
            breadcrumb.data = { _truncated: true, _originalSize: dataStr.length };
          }
        }
      }

      return breadcrumb;
    },
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app }),
      new ProfilingIntegration(),
    ],
  });

  if (app) {
    // RequestHandler creates a separate execution context using domains
    app.use(Sentry.Handlers.requestHandler());
    // TracingHandler creates a trace for every incoming request
    app.use(Sentry.Handlers.tracingHandler());
  }

  console.log(`Sentry initialized for environment: ${environment}`);
}

export { Sentry };
