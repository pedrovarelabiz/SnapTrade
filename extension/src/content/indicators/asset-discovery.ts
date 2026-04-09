/**
 * Asset Discovery — MAIN world script.
 * Discovers all available OTC pairs from PO's internal React/Redux state.
 * Sends discovered pairs to the content script via postMessage.
 */
(function () {
  const DISCOVERY_RETRY_INTERVAL = 3000;
  const MAX_RETRIES = 20;
  let discovered = false;
  let retryCount = 0;

  /**
   * Strategy 1: Find Redux store via React fiber traversal from root element.
   */
  function findReduxStore(): any {
    try {
      const rootEl = document.getElementById('root') || document.getElementById('app');
      if (!rootEl) return null;

      const fiberKey = Object.keys(rootEl).find(
        k => k.startsWith('__reactFiber') || k.startsWith('__reactContainer')
      );
      if (!fiberKey) return null;

      let fiber = (rootEl as any)[fiberKey];
      let depth = 0;
      while (fiber && depth < 50) {
        // Check for Redux store on stateNode or memoizedProps
        const store = fiber.stateNode?.store || fiber.memoizedProps?.store;
        if (store && typeof store.getState === 'function') return store;
        fiber = fiber.return;
        depth++;
      }
    } catch { /* PO not ready */ }
    return null;
  }

  /**
   * Strategy 2: Find assets from PO's sidebar asset list in the DOM.
   * PO renders all asset items with data attributes or class names.
   */
  function findAssetsFromDom(): string[] {
    try {
      // PO asset list items typically have the asset symbol in data attributes or text
      const assetItems = document.querySelectorAll(
        '.alist__item a.alist__link, [class*="assets-list"] [class*="item"]'
      );
      const pairs: string[] = [];
      for (const item of Array.from(assetItems)) {
        const text = (item.textContent || '').trim();
        // Look for OTC pairs: they contain "OTC" or have _otc format
        const match = text.match(/([A-Z]{3,}[\s/]*[A-Z]{3,})\s*(?:\(OTC\)|OTC)/i);
        if (match) {
          const normalized = match[1]!.replace(/[\s/]/g, '').toUpperCase() + '_otc';
          if (!pairs.includes(normalized)) pairs.push(normalized);
        }
      }
      return pairs;
    } catch { return []; }
  }

  /**
   * Strategy 3: Traverse React fiber tree from chart to find asset registry.
   */
  function findAssetsFromFiber(): string[] {
    try {
      const canvas = document.querySelector('#chart-1 canvas') || document.querySelector('#bar-chart canvas');
      if (!canvas) return [];
      const fiberKey = Object.keys(canvas).find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) return [];

      let fiber = (canvas as any)[fiberKey];
      let depth = 0;
      while (fiber && depth < 50) {
        const state = fiber.memoizedState;
        const props = fiber.memoizedProps;

        // Look for asset-related data in component props/state
        if (props?.assets && typeof props.assets === 'object') {
          return extractOtcPairs(props.assets);
        }
        if (state?.memoizedState?.assets) {
          return extractOtcPairs(state.memoizedState.assets);
        }

        // Check for assetBySymbol in any context
        const stateNode = fiber.stateNode;
        if (stateNode?.props?.store?.getState) {
          const reduxState = stateNode.props.store.getState();
          if (reduxState?.assets?.assetBySymbol) {
            return extractOtcPairs(reduxState.assets.assetBySymbol);
          }
        }

        fiber = fiber.return;
        depth++;
      }
    } catch { /* not ready */ }
    return [];
  }

  /**
   * Extract OTC pairs from an asset map/object.
   */
  function extractOtcPairs(assetMap: any): string[] {
    const pairs: string[] = [];
    if (!assetMap || typeof assetMap !== 'object') return pairs;

    const entries = assetMap instanceof Map
      ? Array.from(assetMap.entries())
      : Object.entries(assetMap);

    for (const [key, value] of entries) {
      const symbol = typeof key === 'string' ? key : String(key);
      const isOtc = symbol.includes('_otc') || symbol.toLowerCase().includes('otc');
      const isActive = value === true
        || (typeof value === 'object' && value !== null && (value as any).active !== false);

      if (isOtc && isActive) {
        const normalized = symbol.includes('_otc') ? symbol : symbol.replace(/OTC/i, '_otc');
        if (!pairs.includes(normalized)) pairs.push(normalized);
      }
    }
    return pairs;
  }

  /**
   * Strategy 4: Intercept PO's WebSocket messages that contain asset lists.
   * PO sends the full asset catalog on initial connection.
   */
  function listenForAssetListFromWs(): void {
    window.addEventListener('message', (event) => {
      if (event.source !== window || discovered) return;
      if (event.data?.type !== 'ST_WS_DEALS' && event.data?.type !== 'ST_WS_IN') return;

      try {
        const raw = String(event.data.data || '');
        // PO sends asset catalog as: 42["assets", {...}] or similar
        if (raw.includes('"assets"') || raw.includes('assetList') || raw.includes('asset_list')) {
          const jsonStart = raw.indexOf('[');
          if (jsonStart < 0) return;
          const parsed = JSON.parse(raw.substring(jsonStart));
          if (Array.isArray(parsed) && parsed.length >= 2) {
            const payload = parsed[1];
            if (payload && typeof payload === 'object') {
              const otcPairs = extractOtcPairs(payload);
              if (otcPairs.length > 10) {
                broadcastDiscovery(otcPairs, 'ws-message');
              }
            }
          }
        }
      } catch { /* not asset data */ }
    });
  }

  function broadcastDiscovery(pairs: string[], source: string): void {
    if (discovered) return;
    discovered = true;

    // Sort alphabetically for consistent ordering
    const sorted = [...pairs].sort();

    window.postMessage({
      type: 'ST_DISCOVERED_ASSETS',
      pairs: sorted,
      count: sorted.length,
      source: source,
    }, '*');

    console.log(`[SnapTrade] Discovered ${sorted.length} OTC pairs via ${source}`);
  }

  function attemptDiscovery(): void {
    if (discovered || retryCount >= MAX_RETRIES) return;
    retryCount++;

    // Strategy 1: Redux store
    const store = findReduxStore();
    if (store) {
      try {
        const reduxState = store.getState();
        if (reduxState?.assets?.assetBySymbol) {
          const pairs = extractOtcPairs(reduxState.assets.assetBySymbol);
          if (pairs.length > 5) {
            broadcastDiscovery(pairs, 'redux-store');
            return;
          }
        }
        // Try alternate state paths
        if (reduxState?.asset?.list || reduxState?.instruments?.bySymbol) {
          const assetObj = reduxState.asset?.list || reduxState.instruments?.bySymbol;
          const pairs = extractOtcPairs(assetObj);
          if (pairs.length > 5) {
            broadcastDiscovery(pairs, 'redux-alt');
            return;
          }
        }
      } catch { /* state access failed */ }
    }

    // Strategy 2: Fiber tree traversal
    const fiberPairs = findAssetsFromFiber();
    if (fiberPairs.length > 5) {
      broadcastDiscovery(fiberPairs, 'fiber');
      return;
    }

    // Strategy 3: DOM scraping (last resort, less reliable)
    const domPairs = findAssetsFromDom();
    if (domPairs.length > 5) {
      broadcastDiscovery(domPairs, 'dom');
      return;
    }
  }

  // Listen for explicit discovery requests from content script
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.type === 'ST_DISCOVER_ASSETS') {
      discovered = false; // Allow re-discovery
      retryCount = 0;
      attemptDiscovery();
    }
  });

  // Start WS listener for asset catalog messages
  listenForAssetListFromWs();

  // Retry discovery periodically until found
  const discoveryTimer = setInterval(() => {
    if (discovered) {
      clearInterval(discoveryTimer);
      return;
    }
    attemptDiscovery();
  }, DISCOVERY_RETRY_INTERVAL);

  // Initial attempt after short delay for PO to initialize
  setTimeout(attemptDiscovery, 2000);

  console.log('[SnapTrade] Asset discovery active');
})();
