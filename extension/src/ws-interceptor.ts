/**
 * WebSocket interceptor — MAIN world, document_start.
 * Captures ALL PO trading WebSockets, identifies the primary one by
 * detecting which WS receives trading events (successopenOrder, etc.).
 * Handles Socket.IO binary attachments (451-[event,{_placeholder}] + binary frame).
 */
import * as Sentry from '@sentry/browser';

(function() {
  /** Narrowed window type so we can read/write WebSocket and the sentinel property. */
  interface WebSocketConstructorType {
    new(url: string | URL, protocols?: string | string[]): WebSocket;
    prototype: WebSocket;
    CONNECTING: number;
    OPEN: number;
    CLOSING: number;
    CLOSED: number;
  }
  type WebSocketWindow = Window & {
    WebSocket: WebSocketConstructorType;
    __stTradingWS?: WebSocket;
  };
  const win = window as WebSocketWindow;
  const _OrigWS = win.WebSocket;
  const WS_TRADE_TIMEOUT = 15000;

  // === Socket.IO client capture ===
  // Trap window.io to capture PO's socket.io client instance before their bundle loads.
  // ws-interceptor runs at document_start, so this defineProperty fires before PO sets io.
  try {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let realIo: any = (win as any).io;
    Object.defineProperty(win, 'io', {
      configurable: true,
      enumerable: true,
      get() { return realIo; },
      set(val: any) {
        if (typeof val === 'function' && !val.__stWrapped) {
          const origIo = val;
          const wrappedIo = function(this: any, ...args: any[]): any {
            const socket = origIo.apply(this, args);
            if (socket && typeof socket.emit === 'function') {
              (win as any).__poSocketIO = socket;
              console.log('[SnapTrade] Socket.IO client captured via io()');
              // Also capture on reconnect
              if (typeof socket.on === 'function') {
                socket.on('connect', () => {
                  (win as any).__poSocketIO = socket;
                  console.log('[SnapTrade] Socket.IO client reconnected');
                });
              }
            }
            return socket;
          };
          // Copy static properties (connect, Manager, etc.)
          Object.keys(origIo).forEach((k: string) => { (wrappedIo as any)[k] = origIo[k]; });
          if (origIo.prototype) wrappedIo.prototype = origIo.prototype;
          // Wrap io.connect() too
          if (typeof origIo.connect === 'function') {
            (wrappedIo as any).connect = function(this: any, ...args: any[]): any {
              const socket = origIo.connect.apply(origIo, args);
              if (socket && typeof socket.emit === 'function') {
                (win as any).__poSocketIO = socket;
                console.log('[SnapTrade] Socket.IO client captured via io.connect()');
              }
              return socket;
            };
          }
          (wrappedIo as any).__stWrapped = true;
          realIo = wrappedIo;
        } else {
          realIo = val;
        }
      },
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */
  } catch (err) {
    console.log('[SnapTrade] Socket.IO capture setup failed (non-critical):', err);
  }

  // === Multi-WS tracking ===
  const allTradingWs = new Map<string, WebSocket>(); // url → ws
  let primaryWs: WebSocket | null = null;

  function markAsPrimary(ws: WebSocket): void {
    if (primaryWs !== ws) {
      primaryWs = ws;
      win.__stTradingWS = ws;
      console.log('[SnapTrade] Primary trading WS:', ws.url?.substring(0, 60));
      window.postMessage({ type: 'ST_WS_READY', url: ws.url }, '*');
    }
  }

  function getBestWs(): WebSocket | null {
    if (primaryWs && primaryWs.readyState === _OrigWS.OPEN) return primaryWs;
    // Fallback: any open WS
    for (const ws of allTradingWs.values()) {
      if (ws.readyState === _OrigWS.OPEN) return ws;
    }
    // Any connecting WS (for queuing)
    for (const ws of allTradingWs.values()) {
      if (ws.readyState === _OrigWS.CONNECTING) return ws;
    }
    return null;
  }

  // === Socket.IO binary event buffering (queue-based for concurrent responses) ===
  interface PendingBinaryEvent {
    eventName: string;
    attachmentCount: number;
    buffers: ArrayBuffer[];
    timestamp: number;
  }
  const pendingBinaryQueue: PendingBinaryEvent[] = [];
  const BINARY_EVENT_TIMEOUT = 10000; // 10s timeout for incomplete events

  // === Trade execution queue ===
  let pendingTradePayload: string | null = null;
  let pendingTradeTimer: ReturnType<typeof setTimeout> | null = null;

  function flushPendingTrade(ws: WebSocket): void {
    if (pendingTradePayload && ws.readyState === _OrigWS.OPEN) {
      console.log('[SnapTrade] Flushing queued trade after reconnect');
      Sentry.addBreadcrumb({
        category: 'trade-queue',
        message: 'Trade dequeued and sent after reconnect',
        level: 'info',
        data: { payload: pendingTradePayload.substring(0, 200) }
      });
      ws.send(pendingTradePayload);
      window.postMessage({ type: 'ST_WS_OUT', data: pendingTradePayload.substring(0, 500), ts: Date.now() }, '*');
      pendingTradePayload = null;
      if (pendingTradeTimer) { clearTimeout(pendingTradeTimer); pendingTradeTimer = null; }
    }
  }

  // === Binary decode helpers ===
  function dispatchDecodedEvent(eventName: string, data: unknown): void {
    // ST_WS_DEALS: all deal-related events (open, close, update)
    if (eventName === 'successcloseOrder' || eventName === 'updateClosedDeals' ||
        eventName === 'updateOpenedDeals' || eventName === 'successopenOrder') {
      window.postMessage({ type: 'ST_WS_DEALS', data: JSON.stringify([eventName, data]), ts: Date.now() }, '*');
    }
    // ST_WS_TRADE: order status events (for trade execution response)
    if (eventName === 'successopenOrder' || eventName === 'failopenOrder' ||
        eventName === 'successcloseOrder') {
      window.postMessage({ type: 'ST_WS_TRADE', data: JSON.stringify([eventName, data]), ts: Date.now() }, '*');
    }
    // ST_PENDING_ORDER_DECODED: pending order status events (success/fail/update)
    if (eventName === 'successopenPendingOrder' || eventName === 'failopenPendingOrder' ||
        eventName === 'successPendingOrderCreated' || eventName === 'failPendingOrderCreated' ||
        eventName === 'successPendingOrderCreate' || eventName === 'failPendingOrderCreate' ||
        eventName === 'updatePending' || eventName === 'cancelPendingOrder') {
      console.log('[SnapTrade] PENDING ORDER binary decoded:', eventName, JSON.stringify(data).substring(0, 500));
      window.postMessage({ type: 'ST_PENDING_ORDER_DECODED', event: eventName, data: JSON.stringify(data), ts: Date.now() }, '*');
    }
    // ST_WS_ASSETS: asset updates with payout rates
    if (eventName === 'updateAssets' || eventName === 'assets') {
      try {
        // PO sends asset data with payout info — forward to content script
        console.log('[SnapTrade] WS asset update event:', eventName, 'items:', Array.isArray(data) ? (data as unknown[]).length : 'obj');
        window.postMessage({ type: 'ST_WS_ASSETS', data: JSON.stringify(data), ts: Date.now() }, '*');
      } catch { /* ignore */ }
    }
    // Per-symbol payout from changeSymbolSuccess
    if (eventName === 'changeSymbolSuccess') {
      try {
        const assetData = Array.isArray(data) ? data : [data];
        console.log('[SnapTrade] WS changeSymbolSuccess payout capture');
        window.postMessage({ type: 'ST_WS_ASSETS', data: JSON.stringify(assetData), ts: Date.now() }, '*');
      } catch { /* ignore */ }
    }
    // ST_HISTORICAL_CANDLES: history responses for candle seeding
    if (eventName.includes('HistoryPeriod') || eventName.includes('HistoryNew')) {
      try {
        const payload = data as Record<string, unknown>;
        const asset = payload?.asset as string;
        const period = (payload?.period as number) || 60;
        const history = payload?.history as number[][] | undefined;
        // Try alternative field names for history data
        const historyData = history || (payload as any)?.data || (payload as any)?.candles || (payload as any)?.points;
        if (asset && Array.isArray(historyData) && historyData.length > 0) {
          const tfMap: Record<number, string> = {
            5: 'S5', 10: 'S10', 15: 'S15', 30: 'S30',
            60: 'M1', 120: 'M2', 180: 'M3', 300: 'M5',
          };
          const tf = tfMap[period] || 'M1';
          // PO binary history format: [[time, open, close, high, low], ...]
          const candles = historyData.map((c: number[]) => ({
            open: c[1], high: c[3], low: c[4], close: c[2],
            time: c[0], volume: 1,
          }));
          window.postMessage({
            type: 'ST_HISTORICAL_CANDLES',
            symbol: asset,
            timeframe: tf,
            candles: candles,
          }, '*');
        }
      } catch { /* malformed history payload */ }
    }
  }

  function processBinaryAttachments(eventName: string, buffers: ArrayBuffer[]): void {
    try {
      if (buffers.length === 0) return;
      const bytes = new Uint8Array(buffers[0]!);
      // Try JSON
      try {
        const text = new TextDecoder().decode(bytes);
        const data = JSON.parse(text);
        dispatchDecodedEvent(eventName, data);
        return;
      } catch { /* not JSON */ }
      // Try msgpack
      try {
        const decoded = decodeMsgpack(bytes);
        if (decoded !== undefined) { dispatchDecodedEvent(eventName, decoded); return; }
      } catch { /* not msgpack */ }
      // Fallback
      try {
        const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        if (text.length > 10) {
          window.postMessage({ type: 'ST_WS_BINARY', data: text.substring(0, 5000), ts: Date.now() }, '*');
        }
      } catch { /* skip */ }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { component: 'ws-interceptor', event: 'binary-attachment-parsing' },
        extra: { eventName, bufferCount: buffers.length, bufferSize: buffers[0]?.byteLength }
      });
    }
  }

  function decodeMsgpack(data: Uint8Array): unknown {
    let offset = 0;
    function read(): unknown {
      if (offset >= data.length) return undefined;
      const b = data[offset++]!;
      if (b <= 0x7f) return b;
      if (b >= 0xe0) return b - 256;
      if ((b & 0xe0) === 0xa0) return readStr(b & 0x1f);
      if ((b & 0xf0) === 0x80) return readMap(b & 0x0f);
      if ((b & 0xf0) === 0x90) return readArray(b & 0x0f);
      const dv = new DataView(data.buffer, data.byteOffset);
      switch (b) {
        case 0xc0: return null; case 0xc2: return false; case 0xc3: return true;
        case 0xcc: return data[offset++];
        case 0xcd: { const v = (data[offset]! << 8) | data[offset+1]!; offset += 2; return v; }
        case 0xce: { const v = dv.getUint32(offset); offset += 4; return v; }
        case 0xd0: { const v = (data[offset]! << 24) >> 24; offset += 1; return v; }
        case 0xd1: { const v = dv.getInt16(offset); offset += 2; return v; }
        case 0xd2: { const v = dv.getInt32(offset); offset += 4; return v; }
        case 0xca: { const v = dv.getFloat32(offset); offset += 4; return v; }
        case 0xcb: { const v = dv.getFloat64(offset); offset += 8; return v; }
        case 0xd9: { const len = data[offset++]!; return readStr(len); }
        case 0xda: { const len = (data[offset]! << 8) | data[offset+1]!; offset += 2; return readStr(len); }
        case 0xdb: { const len = dv.getUint32(offset); offset += 4; return readStr(len); }
        case 0xdc: { const len = (data[offset]! << 8) | data[offset+1]!; offset += 2; return readArray(len); }
        case 0xdd: { const len = dv.getUint32(offset); offset += 4; return readArray(len); }
        case 0xde: { const len = (data[offset]! << 8) | data[offset+1]!; offset += 2; return readMap(len); }
        case 0xdf: { const len = dv.getUint32(offset); offset += 4; return readMap(len); }
        case 0xcf: { const hi = dv.getUint32(offset); const lo = dv.getUint32(offset+4); offset += 8; return hi * 0x100000000 + lo; }
        case 0xd3: { const hi = dv.getInt32(offset); const lo = dv.getUint32(offset+4); offset += 8; return hi * 0x100000000 + lo; }
        default: return undefined;
      }
    }
    function readStr(len: number): string { const s = data.subarray(offset, offset + len); offset += len; return new TextDecoder().decode(s); }
    function readMap(len: number): Record<string, unknown> { const o: Record<string, unknown> = {}; for (let i = 0; i < len; i++) { o[String(read())] = read(); } return o; }
    function readArray(len: number): unknown[] { const a: unknown[] = []; for (let i = 0; i < len; i++) a.push(read()); return a; }
    return read();
  }

  // === WebSocket constructor override ===
  win.WebSocket = function(this: WebSocket, rawUrl: string | URL, protocols?: string | string[]) {
    try {
      const ws: WebSocket = new _OrigWS(rawUrl, protocols);
      const url = String(rawUrl);

      // Match PO trading WebSocket URLs
      if ((url.includes('api-') && url.includes('.po.market')) ||
          (url.includes('pocketoption') && url.includes('ws')) ||
          (url.includes('po.trade') && url.includes('ws'))) {

        Sentry.addBreadcrumb({
          category: 'websocket',
          message: 'WebSocket connection detected',
          level: 'info',
          data: { url: url.substring(0, 100), totalConnections: allTradingWs.size + 1 }
        });

        // Only track after successful open — avoid accumulating dead WS objects during reconnection storms
        ws.addEventListener('open', () => {
        try {
          allTradingWs.set(url, ws);
          win.__stTradingWS = ws;
          Sentry.addBreadcrumb({
            category: 'websocket',
            message: 'WebSocket opened',
            level: 'info',
            data: { url: url.substring(0, 100) }
          });
          console.log('[SnapTrade] WS opened:', url.substring(0, 60));
          if (!primaryWs || primaryWs.readyState !== _OrigWS.OPEN) {
            markAsPrimary(ws);
          }
          flushPendingTrade(ws);
        } catch (err) {
          Sentry.captureException(err, {
            tags: { component: 'ws-interceptor', event: 'open' },
            extra: { url: url.substring(0, 100) }
          });
          throw err;
        }
      });

      // Attach heavyweight listeners only after open — failed WSes get no listeners
      ws.addEventListener('open', () => {

      ws.addEventListener('message', (e: MessageEvent) => {
        try {
          // === Binary frames (queue-based) ===
          function handleBinaryBuffer(buf: ArrayBuffer): void {
            if (pendingBinaryQueue.length > 0) {
              const pending = pendingBinaryQueue[0]!;
              pending.buffers.push(buf);
              if (pending.buffers.length >= pending.attachmentCount) {
                processBinaryAttachments(pending.eventName, pending.buffers);
                pendingBinaryQueue.shift();
              }
            } else {
              // No pending event — try to decode as tick data
              try {
                const text = new TextDecoder().decode(buf);
                if (text.length > 10) window.postMessage({ type: 'ST_WS_BINARY', data: text.substring(0, 5000), ts: Date.now() }, '*');
              } catch { /* skip */ }
            }
          }

          if (e.data instanceof ArrayBuffer) {
            try {
              handleBinaryBuffer(e.data);
            } catch (err) {
              Sentry.captureException(err, {
                tags: { component: 'ws-interceptor', event: 'binary-arraybuffer' },
                extra: { queueLength: pendingBinaryQueue.length, bufferSize: e.data?.byteLength }
              });
            }
            return;
          }
          if (e.data instanceof Blob) {
            e.data.arrayBuffer().then(buf => {
              try {
                handleBinaryBuffer(buf);
              } catch (err) {
                Sentry.captureException(err, {
                  tags: { component: 'ws-interceptor', event: 'binary-blob' },
                  extra: { queueLength: pendingBinaryQueue.length, bufferSize: buf?.byteLength }
                });
              }
            }).catch((err) => {
              Sentry.captureException(err, {
                tags: { component: 'ws-interceptor', event: 'binary-blob-conversion' },
                extra: { blobSize: e.data?.size }
              });
            });
            return;
          }

        // === Text frames ===
        if (typeof e.data === 'string') {
          const str = e.data;

          // Detect trading events → mark this WS as primary
          if (str.includes('successopenOrder') || str.includes('updateClosedDeals') ||
              str.includes('successcloseOrder') || str.includes('updateOpenedDeals')) {
            markAsPrimary(ws);
          }

          // Socket.IO binary event header
          const binaryMatch = str.match(/^45(\d+)-(\[.+)$/s);
          if (binaryMatch) {
            try {
              const attachmentCount = parseInt(binaryMatch[1]!, 10);
              const parsed = JSON.parse(binaryMatch[2]!);
              if (Array.isArray(parsed) && parsed.length >= 1) {
                const evName = String(parsed[0]);
                const isTradingEvent = evName.includes('closeOrder') || evName.includes('openOrder') ||
                    evName.includes('Deals') || evName.includes('Order');
                const isHistoryEvent = evName.includes('HistoryPeriod') || evName.includes('HistoryNew');
                const isAssetEvent = evName === 'updateAssets' || evName === 'assets' || evName === 'changeSymbolSuccess';

                if (isTradingEvent || isHistoryEvent || isAssetEvent) {
                  // Clean up stale pending events (>10s old)
                  const now = Date.now();
                  while (pendingBinaryQueue.length > 0 && now - pendingBinaryQueue[0]!.timestamp > BINARY_EVENT_TIMEOUT) {
                    pendingBinaryQueue.shift();
                  }
                  pendingBinaryQueue.push({ eventName: evName, attachmentCount, buffers: [], timestamp: now });
                  // Only trading events mark as primary (not history requests)
                  if (isTradingEvent) markAsPrimary(ws);
                }
              }
            } catch (err) {
              Sentry.captureException(err, {
                tags: { component: 'ws-interceptor', event: 'socket-io-binary-header-parsing' },
                extra: { rawMatch: binaryMatch[0]?.substring(0, 200), rawHeader: binaryMatch[2]?.substring(0, 200) }
              });
            }
            return;
          }

          // Regular text events — dispatch to both channels as needed
          if (str.includes('successopenOrder') || str.includes('failopenOrder') ||
              str.includes('successcloseOrder')) {
            window.postMessage({ type: 'ST_WS_TRADE', data: str.substring(0, 2000), ts: Date.now() }, '*');
          }
          // ST_WS_DEALS: all deal data events (including successopenOrder for open trade tracking)
          if (str.includes('updateOpenedDeals') || str.includes('updateClosedDeals') ||
              str.includes('successopenOrder') || str.includes('successcloseOrder')) {
            window.postMessage({ type: 'ST_WS_DEALS', data: str.substring(0, 5000), ts: Date.now() }, '*');
          }
          // Text-based history responses (42["loadHistoryPeriod", {...}])
          if (str.includes('HistoryPeriod') || str.includes('HistoryNew')) {
            try {
              const jsonStart = str.indexOf('[');
              if (jsonStart >= 0) {
                const parsed = JSON.parse(str.substring(jsonStart));
                if (Array.isArray(parsed) && parsed.length >= 2) {
                  const evName = String(parsed[0]);
                  const payload = parsed[1] as Record<string, unknown>;
                  dispatchDecodedEvent(evName, payload);
                }
              }
            } catch { /* not valid JSON history */ }
          }
          // Asset updates with payout data (42["updateAssets", [...]] or 42["changeSymbolSuccess", {...}])
          if (str.includes('updateAssets') || str.includes('"assets"') || str.includes('changeSymbolSuccess')) {
            try {
              const jsonStart = str.indexOf('[');
              if (jsonStart >= 0) {
                const parsed = JSON.parse(str.substring(jsonStart));
                if (Array.isArray(parsed) && parsed.length >= 2) {
                  dispatchDecodedEvent(String(parsed[0]), parsed[1]);
                }
              }
            } catch { /* not valid JSON assets */ }
          }
        }
        } catch (err) {
          Sentry.captureException(err, {
            tags: { component: 'ws-interceptor', event: 'message' },
            extra: { url: url.substring(0, 100), dataType: typeof e.data }
          });
        }
      });

      ws.addEventListener('close', () => {
        try {
          Sentry.addBreadcrumb({
            category: 'websocket',
            message: 'WebSocket closed',
            level: 'info',
            data: { url: url.substring(0, 100), remainingConnections: allTradingWs.size - 1 }
          });
          allTradingWs.delete(url);
          console.log('[SnapTrade] WS closed:', url.substring(0, 60), '(remaining:', allTradingWs.size + ')');
          if (primaryWs === ws) {
            primaryWs = null;
            pendingBinaryQueue.length = 0;
            const fallback = getBestWs();
            if (fallback && fallback.readyState === _OrigWS.OPEN) {
              markAsPrimary(fallback);
            } else {
              window.postMessage({ type: 'ST_WS_CLOSED' }, '*');
            }
          }
        } catch (err) {
          Sentry.captureException(err, {
            tags: { component: 'ws-interceptor', event: 'close' },
            extra: { url: url.substring(0, 100) }
          });
        }
      });

      }); // end of second 'open' listener (heavyweight handlers)
      }

      return ws;
    } catch (err) {
      Sentry.captureException(err, {
        tags: { component: 'ws-interceptor', event: 'constructor' },
        extra: { url: String(rawUrl || '').substring(0, 100) }
      });
      throw err;
    }
  } as unknown as WebSocketConstructorType;
  win.WebSocket.prototype = _OrigWS.prototype;
  win.WebSocket.CONNECTING = _OrigWS.CONNECTING;
  win.WebSocket.OPEN = _OrigWS.OPEN;
  win.WebSocket.CLOSING = _OrigWS.CLOSING;
  win.WebSocket.CLOSED = _OrigWS.CLOSED;

  // === Trade execution ===
  window.addEventListener('message', (event) => {
    try {
      if (event.source !== window) return;
      if (event.data?.type !== 'ST_EXECUTE_TRADE') return;
      const { asset, amount, action, isDemo, time } = event.data;

      Sentry.addBreadcrumb({
        category: 'trade',
        message: 'Trade execution requested',
        level: 'info',
        data: { asset, amount, action, isDemo }
      });

    const requestId = Date.now();
    const msg = '42["openOrder",' + JSON.stringify({
      asset, amount, action: String(action).toLowerCase(),
      isDemo: isDemo ? 1 : 0, requestId, optionType: 100, time: time * 60,
    }) + ']';

    const ws = getBestWs();

    if (!ws) {
      window.postMessage({ type: 'ST_TRADE_RESULT', success: false, error: 'No WebSocket' }, '*');
      return;
    }

    if (ws.readyState === _OrigWS.CONNECTING) {
      console.log('[SnapTrade] WS connecting, queuing trade...');
      // Detect queue overflow
      if (pendingTradePayload) {
        Sentry.captureMessage('Trade queue overflow: new trade replacing pending trade', {
          level: 'warning',
          tags: { component: 'ws-interceptor' },
          extra: {
            existingTrade: pendingTradePayload.substring(0, 200),
            newTrade: msg.substring(0, 200)
          }
        });
      }
      Sentry.addBreadcrumb({
        category: 'trade-queue',
        message: 'Trade queued during WebSocket reconnection',
        level: 'info',
        data: { asset, amount, action, isDemo }
      });
      pendingTradePayload = msg;
      if (pendingTradeTimer) clearTimeout(pendingTradeTimer);
      pendingTradeTimer = setTimeout(() => {
        if (pendingTradePayload) {
          pendingTradePayload = null;
          window.postMessage({ type: 'ST_TRADE_RESULT', success: false, error: 'Reconnect timeout' }, '*');
        }
      }, 10000);
      return;
    }

    if (ws.readyState !== _OrigWS.OPEN) {
      window.postMessage({ type: 'ST_TRADE_RESULT', success: false, error: 'WS not connected' }, '*');
      return;
    }

    // Send trade
    ws.send(msg);
    window.postMessage({ type: 'ST_WS_OUT', data: msg.substring(0, 500), ts: Date.now() }, '*');

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
    const onClose = (): void => {
      window.postMessage({ type: 'ST_TRADE_RESULT', success: false, error: 'WS closed' }, '*');
      cleanup();
    };
    ws.addEventListener('message', onResp);
    ws.addEventListener('close', onClose);
    const timer = setTimeout(() => {
      if (!cleaned) {
        Sentry.captureMessage('Trade execution timeout', {
          level: 'warning',
          tags: { trade_issue: 'timeout' },
          extra: { asset, amount, action, isDemo, requestId, time }
        });
        window.postMessage({ type: 'ST_TRADE_RESULT', success: false, error: 'Timeout' }, '*');
        cleanup();
      }
    }, WS_TRADE_TIMEOUT);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { component: 'ws-interceptor', event: 'trade-execution' },
        extra: { eventData: event.data }
      });
      window.postMessage({ type: 'ST_TRADE_RESULT', success: false, error: 'Exception: ' + String(err) }, '*');
    }
  });

  // === Pending order execution (opens at exact server time) ===
  // Socket.IO ack counter for manual ack ID format (high base to avoid PO counter collision)
  let stAckCounter = 9000000;

  window.addEventListener('message', (event) => {
    try {
      if (event.source !== window) return;
      if (event.data?.type !== 'ST_EXECUTE_PENDING_TRADE') return;
      const { asset, amount, action, isDemo, timeframeSec, openTime, minPayout } = event.data;

      // command: 0 = call/buy (up), 1 = put/sell (down)
      const command = String(action).toLowerCase() === 'call' ? 0 : 1;
      const pendingPayload = {
        openType: 0, // BY_TIME
        amount, asset, openTime, openPrice: 0,
        timeframe: timeframeSec, minPayout: minPayout || 50, command,
      };

      const ws = getBestWs();
      if (!ws || ws.readyState !== _OrigWS.OPEN) {
        window.postMessage({ type: 'ST_PENDING_TRADE_RESULT', success: false, error: 'No WS' }, '*');
        return;
      }

      let cleaned = false;
      const cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;
        ws.removeEventListener('message', onResp);
        window.removeEventListener('message', onDecoded);
        clearTimeout(timer);
      };

      // Handler 1: Raw WS text frames (for non-binary responses)
      const onResp = (e: MessageEvent): void => {
        const s = typeof e.data === 'string' ? e.data : '';
        // Skip binary headers (45N-[...]) — let the binary pipeline decode them
        if (s.match(/^45\d+-/)) {
          if (s.includes('PendingOrder')) {
            console.log(`[SnapTrade] PENDING ORDER binary header detected, waiting for binary decode: ${s.substring(0, 200)}`);
          }
          return;
        }
        // Check for ack response (43<id>[...]) from manual ack ID
        if (currentAckId > 0 && s.startsWith(`43${currentAckId}`)) {
          const jsonPart = s.substring(String(`43${currentAckId}`).length);
          console.log(`[SnapTrade] PENDING ORDER ack response: ${jsonPart.substring(0, 300)}`);
          try {
            const ackData = JSON.parse(jsonPart);
            const result = Array.isArray(ackData) ? ackData[0] : ackData;
            if (result?.ticket || result?.success) {
              window.postMessage({ type: 'ST_PENDING_TRADE_RESULT', success: true, ticket: result.ticket ?? null }, '*');
            } else {
              window.postMessage({ type: 'ST_PENDING_TRADE_RESULT', success: false, error: result?.error ?? JSON.stringify(result) }, '*');
            }
          } catch {
            window.postMessage({ type: 'ST_PENDING_TRADE_RESULT', success: false, error: 'Ack parse error: ' + jsonPart.substring(0, 100) }, '*');
          }
          cleanup();
          return;
        }
        // Text-based success (42["successopenPendingOrder",...])
        if (s.includes('successopenPendingOrder') || s.includes('successPendingOrderCreate')) {
          let ticket: string | null = null;
          try { const parsed = JSON.parse(s.replace(/^\d+[-]?/, '')); ticket = parsed?.[1]?.ticket ?? null; } catch {}
          console.log(`[SnapTrade] PENDING ORDER created (text): ticket=${ticket}`);
          window.postMessage({ type: 'ST_PENDING_TRADE_RESULT', success: true, ticket }, '*');
          cleanup();
        } else if (s.includes('failopenPendingOrder') || s.includes('failPendingOrderCreate')) {
          let error = 'Rejected';
          try { const parsed = JSON.parse(s.replace(/^\d+[-]?/, '')); error = parsed?.[1]?.error ?? String(parsed?.[1]) ?? 'Rejected'; } catch {}
          console.log(`[SnapTrade] PENDING ORDER failed (text): ${error} | raw: ${s.substring(0, 200)}`);
          window.postMessage({ type: 'ST_PENDING_TRADE_RESULT', success: false, error }, '*');
          cleanup();
        }
      };

      // Handler 2: Decoded binary events (from dispatchDecodedEvent -> ST_PENDING_ORDER_DECODED)
      const onDecoded = (e: MessageEvent): void => {
        if (e.data?.type !== 'ST_PENDING_ORDER_DECODED') return;
        const evName = e.data.event as string;
        if (evName.includes('success') || evName === 'updatePending') {
          let ticket: string | null = null;
          try {
            const d = JSON.parse(e.data.data);
            // Ticket can be nested: d.data.ticket, d.data.data.ticket, or d.ticket
            ticket = d?.data?.ticket ?? d?.data?.data?.ticket ?? d?.ticket ?? d?.data?.id ?? d?.id ?? null;
          } catch { /* */ }
          console.log(`[SnapTrade] PENDING ORDER created (binary decoded): ticket=${ticket} event=${evName}`);
          window.postMessage({ type: 'ST_PENDING_TRADE_RESULT', success: true, ticket }, '*');
          cleanup();
        } else if (evName.includes('fail')) {
          let error = 'Rejected';
          try {
            const d = JSON.parse(e.data.data);
            // Error can be nested: d.data.error, d.data.data.error, d.error
            error = d?.data?.error ?? d?.data?.data?.error ?? d?.error ?? d?.message ?? JSON.stringify(d);
          } catch { /* */ }
          console.log(`[SnapTrade] PENDING ORDER failed (binary decoded): ${error} event=${evName}`);
          window.postMessage({ type: 'ST_PENDING_TRADE_RESULT', success: false, error }, '*');
          cleanup();
        }
      };

      // Decide send method: socket.io emit > manual ack > raw send
      let currentAckId = 0;
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const capturedSock = (win as any).__poSocketIO;
      if (capturedSock && typeof capturedSock.emit === 'function' && capturedSock.connected) {
        // Primary: native socket.io emit with ack callback
        console.log(`[SnapTrade] PENDING ORDER via socket.io emit: ${action} ${asset} at ${openTime}`);
        capturedSock.emit('openPendingOrder', pendingPayload, (ackResponse: any) => {
          console.log('[SnapTrade] PENDING ORDER socket.io ack:', JSON.stringify(ackResponse).substring(0, 500));
          if (ackResponse?.ticket || ackResponse?.success) {
            window.postMessage({ type: 'ST_PENDING_TRADE_RESULT', success: true, ticket: ackResponse.ticket ?? null }, '*');
          } else {
            window.postMessage({ type: 'ST_PENDING_TRADE_RESULT', success: false, error: ackResponse?.error ?? JSON.stringify(ackResponse) }, '*');
          }
          cleanup();
        });
      } else {
        // Secondary: manual ack ID format (42<id>["openPendingOrder",{...}])
        currentAckId = stAckCounter++;
        const msgWithAck = `42${currentAckId}["openPendingOrder",${JSON.stringify(pendingPayload)}]`;
        ws.send(msgWithAck);
        console.log(`[SnapTrade] PENDING ORDER sent (ack ${currentAckId}): ${action} ${asset} at ${openTime} | ${msgWithAck.substring(0, 200)}`);
        window.postMessage({ type: 'ST_WS_OUT', data: msgWithAck.substring(0, 500), ts: Date.now() }, '*');
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */

      ws.addEventListener('message', onResp);
      window.addEventListener('message', onDecoded);
      const timer = setTimeout(() => {
        if (!cleaned) {
          console.log('[SnapTrade] PENDING ORDER timeout');
          window.postMessage({ type: 'ST_PENDING_TRADE_RESULT', success: false, error: 'Timeout' }, '*');
          cleanup();
        }
      }, WS_TRADE_TIMEOUT);
    } catch (err) {
      window.postMessage({ type: 'ST_PENDING_TRADE_RESULT', success: false, error: String(err) }, '*');
    }
  });

  // Intercept outgoing openOrder for logging
  const _origSend = _OrigWS.prototype.send;
  _OrigWS.prototype.send = function(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    try {
      if (typeof data === 'string') {
        if (data.includes('openOrder')) {
          window.postMessage({ type: 'ST_WS_OUT', data: String(data).substring(0, 500), ts: Date.now() }, '*');
        }
      }
      return _origSend.call(this, data);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { component: 'ws-interceptor', event: 'send' },
        extra: { dataType: typeof data }
      });
      throw err;
    }
  };

  // Re-announce ST_WS_READY every 3s so late-loading content scripts can detect it
  setInterval(() => {
    const ws = getBestWs();
    if (ws && ws.readyState === _OrigWS.OPEN) {
      window.postMessage({ type: 'ST_WS_READY', url: ws.url }, '*');
    }
  }, 3000);

  console.log('[SnapTrade] WS interceptor active (multi-WS + binary)');
})();
