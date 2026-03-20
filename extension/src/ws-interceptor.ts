/**
 * WebSocket interceptor — MAIN world, document_start.
 * Captures trading WS, enables trade execution, tracks open trades.
 */
(function() {
  const _OrigWS = (window as any).WebSocket;
  const WS_TRADE_TIMEOUT = 15000;

  (window as any).WebSocket = function(this: WebSocket, ...args: any[]) {
    const ws: WebSocket = new _OrigWS(...args);
    const url = String(args[0] || '');

    if (url.includes('api-') && url.includes('.po.market')) {
      (window as any).__stTradingWS = ws;

      ws.addEventListener('open', () => {
        window.postMessage({ type: 'ST_WS_READY', url }, '*');
      });

      ws.addEventListener('message', (e: MessageEvent) => {
        if (typeof e.data === 'string') {
          const str = e.data;
          if (str.includes('successopenOrder') || str.includes('failopenOrder') ||
              str.includes('successcloseOrder')) {
            window.postMessage({ type: 'ST_WS_TRADE', data: str.substring(0, 2000), ts: Date.now() }, '*');
          }
          if (str.includes('updateOpenedDeals') || str.includes('updateClosedDeals')) {
            window.postMessage({ type: 'ST_WS_DEALS', data: str.substring(0, 5000), ts: Date.now() }, '*');
          }
        }
        if (e.data instanceof ArrayBuffer) {
          try {
            const text = new TextDecoder().decode(e.data);
            if (text.length > 10) {
              window.postMessage({ type: 'ST_WS_BINARY', data: text.substring(0, 5000), ts: Date.now() }, '*');
            }
          } catch { /* skip */ }
        }
        if (e.data instanceof Blob) {
          e.data.arrayBuffer().then(buf => {
            try {
              const text = new TextDecoder().decode(buf);
              if (text.length > 10) {
                window.postMessage({ type: 'ST_WS_BINARY', data: text.substring(0, 5000), ts: Date.now() }, '*');
              }
            } catch { /* skip */ }
          }).catch(() => {});
        }
      });

      ws.addEventListener('close', () => {
        window.postMessage({ type: 'ST_WS_CLOSED' }, '*');
      });
    }

    return ws;
  } as any;
  (window as any).WebSocket.prototype = _OrigWS.prototype;
  (window as any).WebSocket.CONNECTING = _OrigWS.CONNECTING;
  (window as any).WebSocket.OPEN = _OrigWS.OPEN;
  (window as any).WebSocket.CLOSING = _OrigWS.CLOSING;
  (window as any).WebSocket.CLOSED = _OrigWS.CLOSED;

  // Trade execution via postMessage
  window.addEventListener('message', (event) => {
    if (event.data?.type !== 'ST_EXECUTE_TRADE') return;
    const { asset, amount, action, isDemo, time } = event.data;
    const ws = (window as any).__stTradingWS as WebSocket | null;

    if (!ws || ws.readyState !== _OrigWS.OPEN) {
      window.postMessage({ type: 'ST_TRADE_RESULT', success: false, error: 'WS not connected' }, '*');
      return;
    }

    const requestId = Date.now();
    const msg = '42["openOrder",' + JSON.stringify({
      asset, amount, action: String(action).toLowerCase(),
      isDemo: isDemo ? 1 : 0, requestId, optionType: 100, time: time * 60,
    }) + ']';

    ws.send(msg);
    window.postMessage({ type: 'ST_WS_OUT', data: msg.substring(0, 500), ts: Date.now() }, '*');

    // FIX: Track listener reference for proper cleanup on WS close
    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      ws.removeEventListener('message', onResp);
      ws.removeEventListener('close', onClose);
      clearTimeout(timer);
    };

    const onResp = (e: MessageEvent): void => {
      const s = typeof e.data === 'string' ? e.data : '';
      if (s.includes('successopenOrder')) {
        window.postMessage({ type: 'ST_TRADE_RESULT', success: true, requestId }, '*');
        cleanup();
      } else if (s.includes('failopenOrder')) {
        window.postMessage({ type: 'ST_TRADE_RESULT', success: false, error: 'Rejected', requestId }, '*');
        cleanup();
      }
    };

    // FIX: Clean up on WS close to prevent memory leak
    const onClose = (): void => {
      window.postMessage({ type: 'ST_TRADE_RESULT', success: false, error: 'WS closed' }, '*');
      cleanup();
    };

    ws.addEventListener('message', onResp);
    ws.addEventListener('close', onClose);
    const timer = setTimeout(() => {
      if (!cleaned) {
        window.postMessage({ type: 'ST_TRADE_RESULT', success: false, error: 'Timeout' }, '*');
        cleanup();
      }
    }, WS_TRADE_TIMEOUT);
  });

  // Intercept outgoing openOrder for logging
  const _origSend = _OrigWS.prototype.send;
  _OrigWS.prototype.send = function(data: any) {
    if (typeof data === 'string' && data.includes('openOrder')) {
      window.postMessage({ type: 'ST_WS_OUT', data: String(data).substring(0, 500), ts: Date.now() }, '*');
    }
    return _origSend.call(this, data);
  };

  console.log('[SnapTrade] WS interceptor active');
})();
