import { initSentry } from './config/sentry';
import * as Sentry from '@sentry/browser';

// Initialize Sentry before any event listeners
initSentry();

// Global error handler for uncaught errors
window.addEventListener('error', (event) => {
  Sentry.captureException(event.error || new Error(event.message));
});

// Global handler for unhandled promise rejections
window.addEventListener('unhandledrejection', (event) => {
  Sentry.captureException(event.reason);
});

// WebSocket interception for monitoring
(function() {
  const OriginalWebSocket = (window as any).WebSocket;
  const MAX_QUEUE_SIZE = 5;
  let tradeQueue: any[] = [];

  function flushTradeQueue(ws: any): void {
    while (tradeQueue.length > 0 && ws.readyState === OriginalWebSocket.OPEN) {
      const trade = tradeQueue.shift();
      Sentry.addBreadcrumb({
        category: 'trade-queue',
        message: 'Trade dequeued after WebSocket reconnection',
        level: 'info',
        data: { queueSize: tradeQueue.length, trade: JSON.stringify(trade).substring(0, 200) }
      });
    }
  }

  (window as any).WebSocket = function(...args: any[]) {
    try {
      const ws = new OriginalWebSocket(...args);
      const url = String(args[0] || '');

      // Add breadcrumb when WebSocket connection is detected
      Sentry.addBreadcrumb({
        category: 'websocket',
        message: 'WebSocket connection detected',
        level: 'info',
        data: { url: url.substring(0, 100) }
      });

      // Wrap event listeners in try/catch
      ws.addEventListener('open', () => {
        try {
          Sentry.addBreadcrumb({
            category: 'websocket',
            message: 'WebSocket opened',
            level: 'info',
            data: { url: url.substring(0, 100) }
          });
          flushTradeQueue(ws);
        } catch (err) {
          Sentry.captureException(err, {
            tags: { component: 'background', event: 'ws-open' }
          });
        }
      });

      ws.addEventListener('error', (event: Event) => {
        try {
          Sentry.captureException(new Error('WebSocket error'), {
            tags: { component: 'background', event: 'ws-error' },
            extra: { url: url.substring(0, 100), event }
          });
        } catch (err) {
          Sentry.captureException(err);
        }
      });

      ws.addEventListener('close', () => {
        try {
          Sentry.addBreadcrumb({
            category: 'websocket',
            message: 'WebSocket closed',
            level: 'info',
            data: { url: url.substring(0, 100) }
          });
        } catch (err) {
          Sentry.captureException(err, {
            tags: { component: 'background', event: 'ws-close' }
          });
        }
      });

      // Intercept send to monitor trade queuing
      const originalSend = ws.send.bind(ws);
      ws.send = function(data: any) {
        if (ws.readyState === OriginalWebSocket.CONNECTING) {
          if (tradeQueue.length >= MAX_QUEUE_SIZE) {
            Sentry.captureMessage('Trade queue overflow: queue limit exceeded', {
              level: 'warning',
              tags: { component: 'background' },
              extra: { queueSize: tradeQueue.length, maxSize: MAX_QUEUE_SIZE, droppedTrade: String(data).substring(0, 200) }
            });
          } else {
            Sentry.addBreadcrumb({
              category: 'trade-queue',
              message: 'Trade queued during WebSocket reconnection',
              level: 'info',
              data: { queueSize: tradeQueue.length + 1, trade: String(data).substring(0, 200) }
            });
            tradeQueue.push(data);
          }
        } else {
          return originalSend(data);
        }
      };

      return ws;
    } catch (err) {
      Sentry.captureException(err, {
        tags: { component: 'background', event: 'ws-constructor' },
        extra: { url: String(args[0] || '').substring(0, 100) }
      });
      throw err;
    }
  };

  (window as any).WebSocket.prototype = OriginalWebSocket.prototype;
  (window as any).WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
  (window as any).WebSocket.OPEN = OriginalWebSocket.OPEN;
  (window as any).WebSocket.CLOSING = OriginalWebSocket.CLOSING;
  (window as any).WebSocket.CLOSED = OriginalWebSocket.CLOSED;
})();
