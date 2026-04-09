// This replaces the init() function in content-script.ts

// PATCH: Replace from "async function init()" to end of file
const PATCH_INIT = `
async function init(): Promise<void> {
  console.log('[SnapTrade] Content script initializing...');

  const settings = await loadSettings();

  const isPocketOptionPage =
    window.location.hostname.includes('pocketoption') ||
    window.location.hostname.includes('po.trade') ||
    document.title.toLowerCase().includes('pocket option');

  if (!isPocketOptionPage) {
    console.log('[SnapTrade] Not a Pocket Option page, content script idle.');
    chrome.runtime.onMessage.addListener(handleMessage);
    return;
  }

  // Immediately notify background that we're on a PO page
  sendToBackground({ type: 'PO_READY', ready: true });
  console.log('[SnapTrade] On Pocket Option page - notified background');

  // Check if we're on the trading page
  const isTradingPage =
    window.location.pathname.includes('quick-high-low') ||
    window.location.pathname.includes('cabinet/demo-quick-high-low') ||
    window.location.pathname.includes('trading');

  if (!isTradingPage) {
    console.log('[SnapTrade] Not on trading page. Path:', window.location.pathname);
    // Show overlay with "Open Trading" button
    if (settings.showOverlay) {
      state.overlay.init();
      state.overlay.setConnectionStatus(true);
      state.overlay.showNavigatePrompt();
      setupOverlayCallbacks();
    }
    chrome.runtime.onMessage.addListener(handleMessage);
    return;
  }

  // On trading page - wait for UI to be ready
  const ready = await state.bridge.waitForReady(30000);

  if (!ready) {
    console.warn('[SnapTrade] Trading UI did not load within timeout.');
    if (settings.showOverlay) {
      state.overlay.init();
      state.overlay.setConnectionStatus(true);
      state.overlay.showMessage('Trading UI not detected. Try refreshing.');
      setupOverlayCallbacks();
    }
    chrome.runtime.onMessage.addListener(handleMessage);
    return;
  }

  console.log('[SnapTrade] Trading UI ready.');

  if (settings.showOverlay) {
    state.overlay.init();
    state.overlay.setExecutionMode(settings.executionMode);
    state.overlay.setConnectionStatus(true);
    setupOverlayCallbacks();
  }

  state.bridge.watchForResult(handleTradeResult);
  chrome.runtime.onMessage.addListener(handleMessage);

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.settings?.newValue) {
      const newSettings: ExtensionSettings = changes.settings.newValue;
      state.settings = newSettings;
      state.overlay.updateSettings(newSettings);
      if (newSettings.showOverlay && !state.overlay['host']) {
        state.overlay.init();
        state.overlay.setExecutionMode(newSettings.executionMode);
        setupOverlayCallbacks();
      } else if (!newSettings.showOverlay) {
        state.overlay.hide();
      }
    }
    if (changes.dailyState?.newValue) {
      state.overlay.updateDailyState(changes.dailyState.newValue);
    }
  });

  const balance = state.bridge.getBalance();
  const isDemo = state.bridge.isDemoAccount();
  console.log('[SnapTrade] Account:', isDemo ? 'DEMO' : 'REAL', '| Balance: $' + (balance?.toFixed(2) ?? 'N/A'));
}

init().catch(err => {
  console.error('[SnapTrade] Content script init error:', err);
});
`;
