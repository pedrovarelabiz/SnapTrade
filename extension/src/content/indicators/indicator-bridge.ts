/**
 * Indicator Bridge v2 — MAIN world script.
 * Reads historical candle data from PO's React internals at startup
 * and seeds the candle collector. Also forwards live ticks.
 */
(function () {
  const SEED_INTERVAL = 5000; // retry every 5s until chart is found
  const REFRESH_INTERVAL = 30000; // refresh historical data every 30s
  let seeded = false;

  function getChartComponent(): any {
    try {
      const canvas = document.querySelector('#bar-chart canvas');
      if (!canvas) return null;
      const fiberKey = Object.keys(canvas).find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) return null;
      let current = (canvas as any)[fiberKey];
      let depth = 0;
      while (current && depth < 30) {
        if (current.stateNode?.plot?.pointsManager) return current.stateNode;
        current = current.return;
        depth++;
      }
    } catch { /* PO structure not ready */ }
    return null;
  }

  function readAndSeedCandles(): boolean {
    const comp = getChartComponent();
    if (!comp) return false;

    const pm = comp.plot?.pointsManager;
    if (!pm || !pm.candles || pm.candles.length < 5) return false;

    const interval = pm.interval || 60; // seconds per candle
    const symbol = comp.props?.symbol || '';

    // Convert PO candle format to our format
    const candles = pm.candles.map((c: any) => ({
      open: c.enterValue,
      high: c.maxValue,
      low: c.minValue,
      close: c.exitValue,
      time: c.time,
      volume: 1,
    }));

    // Map interval to timeframe string
    const tfMap: Record<number, string> = {
      5: 'S5', 10: 'S10', 15: 'S15', 30: 'S30',
      60: 'M1', 120: 'M2', 180: 'M3', 300: 'M5',
      600: 'M10', 900: 'M15', 1800: 'M30', 3600: 'H1',
    };
    const timeframe = tfMap[interval] || 'M1';

    // Send historical candles to content script
    window.postMessage({
      type: 'ST_HISTORICAL_CANDLES',
      symbol: symbol,
      timeframe: timeframe,
      interval: interval,
      candles: candles,
      currentPrice: pm.currentValue || candles[candles.length - 1]?.close || 0,
    }, '*');

    return true;
  }

  // Also forward live tick data from the updateStream binary events
  // The ws-interceptor already sends ST_WS_BINARY, but we also read
  // the current price directly for the active symbol
  function sendCurrentPrice(): void {
    const comp = getChartComponent();
    if (!comp) return;
    const pm = comp.plot?.pointsManager;
    if (!pm) return;

    const symbol = comp.props?.symbol || '';
    const price = pm.currentValue;
    if (symbol && price) {
      window.postMessage({
        type: 'ST_TICK_DATA',
        symbol: symbol,
        timestamp: Date.now() / 1000,
        price: price,
      }, '*');
    }
  }

  // Try to seed candles until successful
  const seedTimer = setInterval(() => {
    if (readAndSeedCandles()) {
      seeded = true;
      console.log('[SnapTrade] Historical candles seeded from chart');
      clearInterval(seedTimer);
    }
  }, SEED_INTERVAL);

  // Live price updates only — do NOT re-seed candles periodically.
  // Re-seeding gives the visible chart pair unfair advantage over WS-seeded pairs.
  // All pairs get equal candle data from WS history (300 candles each).
  setInterval(() => {
    sendCurrentPrice();
  }, REFRESH_INTERVAL);

  // More frequent price updates
  setInterval(sendCurrentPrice, 1000);

  // Respond to explicit requests
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'ST_REQUEST_CANDLES') {
      readAndSeedCandles();
    }
  });

  console.log('[SnapTrade] Indicator bridge v2 active (candle seeder)');
})();
