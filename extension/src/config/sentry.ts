import * as Sentry from '@sentry/browser';

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN_EXTENSION || '';
  // Skip init if DSN is placeholder or empty — avoids noisy console errors
  if (!dsn || dsn.includes('REPLACE_WITH')) {
    console.log('[SnapTrade] Sentry disabled (no DSN configured)');
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.1,
    beforeSend(event, hint) {
      // Filter Chrome extension internal errors
      if (event.exception?.values) {
        const hasExtensionInternalError = event.exception.values.some(exception =>
          exception.stacktrace?.frames?.some(frame =>
            frame.filename?.startsWith('chrome-extension://') &&
            !frame.filename?.includes('/src/')
          )
        );
        if (hasExtensionInternalError) {
          return null; // Drop the event
        }
      }

      // Strip WebSocket message payloads (may contain trading data)
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
          if (breadcrumb.category === 'websocket' || breadcrumb.type === 'websocket') {
            if (breadcrumb.data) {
              // Strip message payload but keep metadata
              delete breadcrumb.data.message;
              delete breadcrumb.data.payload;
              delete breadcrumb.data.data;
            }
          }
          return breadcrumb;
        });
      }

      // Redact user tokens/balances from request data
      if (event.request?.data) {
        const sensitiveFields = ['apiKey', 'secret', 'password', 'token', 'accessToken', 'refreshToken', 'authToken', 'privateKey', 'balance', 'balances', 'wallet', 'walletBalance', 'address', 'accountBalance'];
        const data = event.request.data;
        if (typeof data === 'object') {
          sensitiveFields.forEach(field => {
            if (field in data) {
              data[field] = '[REDACTED]';
            }
          });
        }
      }

      // Redact user tokens/balances from breadcrumbs
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
          if (breadcrumb.data) {
            const sensitiveFields = ['apiKey', 'secret', 'password', 'token', 'accessToken', 'refreshToken', 'authToken', 'privateKey', 'balance', 'balances', 'wallet', 'walletBalance', 'address', 'accountBalance'];
            sensitiveFields.forEach(field => {
              if (breadcrumb.data && field in breadcrumb.data) {
                breadcrumb.data[field] = '[REDACTED]';
              }
            });
          }
          return breadcrumb;
        });
      }

      // Redact user tokens/balances from extra data
      if (event.extra) {
        const sensitiveFields = ['apiKey', 'secret', 'password', 'token', 'accessToken', 'refreshToken', 'authToken', 'privateKey', 'balance', 'balances', 'wallet', 'walletBalance', 'address', 'accountBalance'];
        Object.keys(event.extra).forEach(key => {
          if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
            event.extra![key] = '[REDACTED]';
          }
        });
      }

      return event;
    },
    integrations: [
      new Sentry.BrowserTracing(),
      new Sentry.Replay(),
    ],
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 0.5,
    // Chrome extension metadata
    release: `chrome-extension@${chrome.runtime.getManifest().version}`,
    initialScope: {
      tags: {
        'extension.id': chrome.runtime.id,
        'extension.type': 'chrome-extension',
      },
    },
  });
}

