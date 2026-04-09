/**
 * Asset Subscriber — MAIN world script.
 * Subscribes to multiple asset tick streams via PO's wsObj.subscribeAsset().
 * Does NOT change the visible chart.
 * Requests M1 historical candles via loadHistoryPeriod.
 * Tracks seeding via ST_HISTORICAL_CANDLES responses.
 */
(function () {
  const RETRY_INTERVAL = 5000;
  const RESUBSCRIBE_INTERVAL = 120000;
  const HISTORY_BATCH_SIZE = 8;
  const HISTORY_ITEM_DELAY = 500;
  const HISTORY_BATCH_PAUSE = 3000;
  let wsObj: any = null;
  let subscribedAssets = new Set<string>();
  let seededAssets = new Set<string>();
  let requestedAssets = new Set<string>();
  let m5RequestedAssets = new Set<string>();
  let configuredAssets: string[] = [];
  let lastConfigHash = '';
  let lastWsReadyTime = 0;
  let lastWsUrl = ''; // Track URL to distinguish reconnect from re-announce
  const WS_READY_COOLDOWN = 10000; // 10s — ignore rapid WS reconnections
  let rotationDone = false;
  let rotationInProgress = false;
  const ROTATION_DELAY_PER_PAIR = 2500; // 2.5s per pair for chart to load
  const ROTATION_MAX_PAIRS = 200; // covers all groups: Currencies(78) + Crypto(23) + Commodities(16) + Stocks(40) + Indices(24)

  function hashAssets(assets: string[]): string {
    return [...assets].sort().join(',');
  }

  function findWsObj(): any {
    try {
      const canvas = document.querySelector('#chart-1 canvas') || document.querySelector('#bar-chart canvas');
      if (!canvas) return null;
      const fiberKey = Object.keys(canvas).find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) return null;
      let fiber = (canvas as any)[fiberKey];
      let depth = 0;
      while (fiber && depth < 30) {
        if (fiber.stateNode?.ws?.subscribeAsset) return fiber.stateNode.ws;
        fiber = fiber.return;
        depth++;
      }
    } catch { /* PO not ready */ }
    return null;
  }

  function getRawWs(): WebSocket | null {
    return (window as any).__stTradingWS as WebSocket | null;
  }

  // Track confirmed seeding via ST_HISTORICAL_CANDLES
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'ST_HISTORICAL_CANDLES') {
      const symbol = event.data.symbol as string;
      if (symbol) seededAssets.add(symbol);
    }
  });

  function requestHistoryForNewAssets(assets: string[]): void {
    const ws = getRawWs();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const unrequested = assets.filter(a => !requestedAssets.has(a));
    if (unrequested.length === 0) return;

    console.log(`[SnapTrade] Requesting M1 history for ${unrequested.length} pairs (${HISTORY_BATCH_SIZE}/batch)...`);

    for (let batch = 0; batch < Math.ceil(unrequested.length / HISTORY_BATCH_SIZE); batch++) {
      const batchAssets = unrequested.slice(batch * HISTORY_BATCH_SIZE, (batch + 1) * HISTORY_BATCH_SIZE);
      batchAssets.forEach((asset, i) => {
        const delay = batch * HISTORY_BATCH_PAUSE + i * HISTORY_ITEM_DELAY;
        setTimeout(() => {
          try {
            const rawWs = getRawWs();
            if (!rawWs || rawWs.readyState !== WebSocket.OPEN) return;
            const now = Math.floor(Date.now() / 1000);
            const index = now * 100;
            rawWs.send(`42["loadHistoryPeriod",{"asset":"${asset}","period":60,"time":${now},"index":${index},"offset":18000}]`);
            requestedAssets.add(asset);
          } catch { /* skip */ }
        }, delay);
      });
    }
  }

  /**
   * Request M5 candle history for assets (period:300 = 5min candles).
   * Fires after M1 seeding completes to avoid overwhelming the WS.
   * offset:18000 = 50 M5 candles (50 * 300s = 15000s, plus margin)
   */
  function requestM5HistoryForNewAssets(assets: string[]): void {
    const ws = getRawWs();
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    const unrequested = assets.filter(a => !m5RequestedAssets.has(a));
    if (unrequested.length === 0) return;

    console.log(`[SnapTrade] Requesting M5 history for ${unrequested.length} pairs...`);

    for (let batch = 0; batch < Math.ceil(unrequested.length / HISTORY_BATCH_SIZE); batch++) {
      const batchAssets = unrequested.slice(batch * HISTORY_BATCH_SIZE, (batch + 1) * HISTORY_BATCH_SIZE);
      batchAssets.forEach((asset, i) => {
        const delay = batch * HISTORY_BATCH_PAUSE + i * HISTORY_ITEM_DELAY;
        setTimeout(() => {
          try {
            const rawWs = getRawWs();
            if (!rawWs || rawWs.readyState !== WebSocket.OPEN) return;
            const now = Math.floor(Date.now() / 1000);
            const index = now * 100;
            rawWs.send(`42["loadHistoryPeriod",{"asset":"${asset}","period":300,"time":${now},"index":${index},"offset":18000}]`);
            m5RequestedAssets.add(asset);
          } catch { /* skip */ }
        }, delay);
      });
    }
  }

  function subscribeAll(): void {
    if (!wsObj) {
      wsObj = findWsObj();
      if (!wsObj) return;
    }

    let newCount = 0;
    const newlySubscribed: string[] = [];
    for (const asset of configuredAssets) {
      if (!subscribedAssets.has(asset)) {
        try {
          wsObj.subscribeAsset(asset);
          subscribedAssets.add(asset);
          newlySubscribed.push(asset);
          newCount++;
        } catch (err) {
          console.warn('[SnapTrade] Subscribe failed:', asset, err);
        }
      }
    }

    if (newCount > 0) {
      console.log(`[SnapTrade] Subscribed ${newCount} new assets (total: ${subscribedAssets.size}/${configuredAssets.length})`);
      requestHistoryForNewAssets(newlySubscribed);
      // Schedule M5 history after M1 completes (~15s delay per batch to avoid flooding)
      const m1TotalDelay = Math.ceil(newlySubscribed.length / HISTORY_BATCH_SIZE) * HISTORY_BATCH_PAUSE + newlySubscribed.length * HISTORY_ITEM_DELAY;
      setTimeout(() => requestM5HistoryForNewAssets(newlySubscribed), m1TotalDelay + 5000);
    }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data?.type === 'ST_SUBSCRIBE_ASSETS') {
      const assets: string[] = event.data.assets || [];
      const newHash = hashAssets(assets);

      if (newHash === lastConfigHash && subscribedAssets.size === assets.length) return;

      lastConfigHash = newHash;
      configuredAssets = assets;

      const newAssets = assets.filter(a => !subscribedAssets.has(a));
      const removedAssets = [...subscribedAssets].filter(a => !assets.includes(a));

      if (removedAssets.length > 0) subscribedAssets = new Set<string>();

      if (newAssets.length > 0 || removedAssets.length > 0) {
        console.log(`[SnapTrade] Asset config: ${assets.length} pairs (+${newAssets.length} new, -${removedAssets.length} removed)`);
        subscribeAll();
      }
    }

    if (event.data?.type === 'ST_WS_READY') {
      const wsUrl = event.data?.url || '';
      const now = Date.now();

      // If same URL, this is just a periodic re-announce — ignore
      if (wsUrl && wsUrl === lastWsUrl) return;

      // Debounce actual reconnections
      if (now - lastWsReadyTime < WS_READY_COOLDOWN) return;
      lastWsReadyTime = now;
      lastWsUrl = wsUrl;

      wsObj = null;
      subscribedAssets = new Set<string>();
      m5RequestedAssets = new Set<string>();
      lastConfigHash = '';
      setTimeout(() => subscribeAll(), 2000);
    }
  });

  setInterval(() => {
    if (configuredAssets.length > 0 && subscribedAssets.size < configuredAssets.length) {
      wsObj = findWsObj();
      subscribeAll();
    }
  }, RETRY_INTERVAL);

  setInterval(() => {
    if (configuredAssets.length > 0) {
      const missing = configuredAssets.filter(a => !subscribedAssets.has(a));
      if (missing.length > 0) {
        console.log(`[SnapTrade] Re-subscribing ${missing.length} missing assets`);
        wsObj = findWsObj();
        subscribeAll();
      }
    }
  }, RESUBSCRIBE_INTERVAL);

  // One retry after 60s for pairs that didn't get seeded
  setTimeout(() => {
    const unseeded = configuredAssets.filter(a => !seededAssets.has(a));
    if (unseeded.length > 0) {
      console.log(`[SnapTrade] History retry: ${unseeded.length} pairs without candles (seeded: ${seededAssets.size}/${configuredAssets.length})`);
      for (const a of unseeded) requestedAssets.delete(a);
      requestHistoryForNewAssets(unseeded);
    }
  }, 60000);

  /**
   * Chart Rotation Seeder — simulates human browsing through pairs.
   * Opens PO's pair dropdown and clicks each pair to load its chart,
   * so indicator-bridge can extract 300 candles from the React component.
   * Eliminates the bias where only the initially-visible pair gets full data.
   */
  function startChartRotation(_assets: string[]): void {
    if (rotationInProgress || rotationDone) return;
    rotationInProgress = true;

    // Step 1: Open the pair dropdown
    const currentSymbolBtn = document.querySelector('.current-symbol') as HTMLElement | null;
    if (!currentSymbolBtn) {
      console.log('[SnapTrade] Chart rotation: .current-symbol not found, skipping');
      rotationInProgress = false;
      rotationDone = true;
      window.postMessage({ type: 'ST_ROTATION_COMPLETE', seeded: seededAssets.size }, '*');
      return;
    }

    // Remember original symbol to restore later
    const originalLabel = currentSymbolBtn.textContent?.trim() ?? '';
    currentSymbolBtn.click();

    setTimeout(() => {
      // Step 2: Find category nav tabs (Currencies, Crypto, Commodities, Stocks, Indices)
      const navItems = Array.from(document.querySelectorAll('.assets-block__nav-item')) as HTMLElement[];
      // Rotate through ALL trading groups, skip Favorites/Schedule
      const groupNames = ['Currencies', 'Cryptocurrencies', 'Commodities', 'Stocks', 'Indices'];
      const groupTabs = navItems.filter(el => {
        const txt = el.textContent?.trim() ?? '';
        return groupNames.some(g => txt.startsWith(g));
      });

      if (groupTabs.length === 0) {
        console.log('[SnapTrade] Chart rotation: no group tabs found');
        currentSymbolBtn.click();
        rotationInProgress = false;
        rotationDone = true;
        window.postMessage({ type: 'ST_ROTATION_COMPLETE', seeded: seededAssets.size }, '*');
        return;
      }

      let totalVisited = 0;
      let groupIdx = 0;

      function processGroup(): void {
        if (groupIdx >= groupTabs.length || totalVisited >= ROTATION_MAX_PAIRS) {
          // All groups done — restore original pair
          finishRotation();
          return;
        }

        const tab = groupTabs[groupIdx++];
        const groupName = tab.textContent?.trim()?.split('\n')[0] ?? 'unknown';
        tab.click(); // switch to this category
        console.log(`[SnapTrade] Chart rotation: switching to group "${groupName}"`);

        setTimeout(() => {
          // Collect pairs in this group
          const links = Array.from(document.querySelectorAll('.alist__link')) as HTMLElement[];
          const pairLinks: Array<{ el: HTMLElement; label: string }> = [];
          for (const link of links) {
            const labelEl = link.querySelector('.alist__label');
            if (labelEl) pairLinks.push({ el: link, label: labelEl.textContent?.trim() ?? '' });
          }

          const limit = ROTATION_MAX_PAIRS - totalVisited;
          const toClick = pairLinks.slice(0, limit);
          console.log(`[SnapTrade] Chart rotation: ${toClick.length} pairs in "${groupName}"`);

          let pairIdx = 0;
          function clickNextPair(): void {
            if (pairIdx >= toClick.length) {
              // Reopen dropdown for next group
              const btn = document.querySelector('.current-symbol') as HTMLElement | null;
              if (btn) btn.click();
              setTimeout(processGroup, 1000);
              return;
            }

            const pair = toClick[pairIdx++];
            totalVisited++;
            pair.el.scrollIntoView({ block: 'center' });
            pair.el.click();

            // Wait for chart, extract candles, then reopen dropdown
            setTimeout(() => {
              window.postMessage({ type: 'ST_REQUEST_CANDLES' }, '*');
              setTimeout(() => {
                const btn = document.querySelector('.current-symbol') as HTMLElement | null;
                if (btn) btn.click();
                setTimeout(clickNextPair, 800);
              }, 500);
            }, ROTATION_DELAY_PER_PAIR - 1300);
          }

          clickNextPair();
        }, 1000); // wait for group to load
      }

      function finishRotation(): void {
        setTimeout(() => {
          const btn = document.querySelector('.current-symbol') as HTMLElement | null;
          if (btn) {
            btn.click();
            // Find first tab (Currencies) and click it, then restore original pair
            setTimeout(() => {
              if (groupTabs[0]) groupTabs[0].click();
              setTimeout(() => {
                const links = document.querySelectorAll('.alist__link');
                for (const link of Array.from(links)) {
                  const lbl = link.querySelector('.alist__label');
                  if (lbl && lbl.textContent?.trim() === originalLabel) {
                    (link as HTMLElement).click();
                    break;
                  }
                }
              }, 800);
            }, 500);
          }
        }, 500);

        rotationDone = true;
        rotationInProgress = false;
        console.log(`[SnapTrade] Chart rotation complete: ${totalVisited} pairs across ${groupIdx} groups (seeded: ${seededAssets.size}/${configuredAssets.length})`);
        window.postMessage({ type: 'ST_ROTATION_COMPLETE', seeded: seededAssets.size }, '*');
      }

      processGroup();
    }, 1500); // wait for dropdown to populate
  }

  // Listen for rotation trigger from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'ST_START_ROTATION') {
      const assets: string[] = event.data.assets || configuredAssets;
      startChartRotation(assets);
    }
  });

  console.log('[SnapTrade] Asset subscriber active');
})();
