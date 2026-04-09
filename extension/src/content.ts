import * as Sentry from '@sentry/browser';
import { initSentry } from './config/sentry';

// Initialize Sentry for error tracking
initSentry();

console.log('[Content Script] Initializing...');

// DOM manipulation with error handling
function initializeContentScript(): void {
  try {
    // Add content script functionality here
    console.log('[Content Script] Ready');
  } catch (error) {
    console.error('[Content Script] Initialization error:', error);
    Sentry.captureException(error);
  }
}

// Message passing with error handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    console.log('[Content Script] Message received:', message);

    // Handle different message types
    switch (message.type) {
      case 'PING':
        sendResponse({ status: 'ok' });
        break;
      default:
        sendResponse({ status: 'unknown_message_type' });
    }

    return false;
  } catch (error) {
    console.error('[Content Script] Message handler error:', error);
    Sentry.captureException(error);
    sendResponse({ status: 'error', error: String(error) });
    return false;
  }
});

// DOM observer with error handling
function observeDOM(): void {
  try {
    const observer = new MutationObserver((mutations) => {
      try {
        mutations.forEach((mutation) => {
          // Handle DOM changes
          if (mutation.type === 'childList') {
            // Process DOM changes
          }
        });
      } catch (error) {
        console.error('[Content Script] DOM observation error:', error);
        Sentry.captureException(error);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  } catch (error) {
    console.error('[Content Script] Observer setup error:', error);
    Sentry.captureException(error);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      initializeContentScript();
      observeDOM();
    } catch (error) {
      console.error('[Content Script] DOMContentLoaded error:', error);
      Sentry.captureException(error);
    }
  });
} else {
  try {
    initializeContentScript();
    observeDOM();
  } catch (error) {
    console.error('[Content Script] Immediate initialization error:', error);
    Sentry.captureException(error);
  }
}
