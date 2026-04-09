## v2.1.5 — Architecture Consolidation

### Architecture
- Consolidated duplicate extension directory: canonical source moved to `extension/` at repo root; `frontend/extension/` removed as redundant copy
- All build tooling, manifests, and CI references updated to point at the single canonical `extension/` directory
- Eliminated divergence risk between the two previously parallel extension trees

### Chore
- Version bumped to 2.1.5 in manifest.json and constants.ts

---

## v2.0.3 — Bug Fix Release

### Critical Fixes
- **E0.2** tradesExecuted: removed double-count — only incremented in TRADE_EXECUTED handler after content script confirms
- **E0.5** tradesExecuted: no longer incremented when trade execution fails (WS reject, button not found, etc.)
- **E2.2** masanielloRecordTrade: fixed targetProfit calculation drift by accepting actualStake parameter
- **FIX** content-script: fixed executeTrade -> executeFullTrade call (wrong bridge method caused all trades to fail)

### Security Fixes
- **E1.1** postMessage: added event.source === window check to reject cross-origin messages
- **E1.2** minBalanceProtection: now enforced in service-worker checkRiskLimits (previously only in content-script)
- Added Authorization header to signal polling API requests (was sending unauthenticated)

### Architecture
- **E2.1** executedTradeIds: persisted to chrome.storage.session (survives page reload)
- **E2.3** Semi-auto mode: gale now queues as pending signal requiring user confirmation, cleans up activeGales properly
- Added TRADE_RESULT handler in service-worker (was missing — content-script results were lost)
- Balance tracking in service-worker via PO_READY and TRADE_EXECUTED messages
- Fixed GET_STATUS response format for popup useStatus hook
- Added pollingInterval cleanup in disconnectSSE
- Added state mutation serialization (withStateLock) to prevent read-modify-write races on concurrent messages
- Fixed watchForResult MutationObserver firing repeatedly for same trade result (dedup via element reference)
- Added multi-gale warning when result attribution may be ambiguous
- Added missing OverlayManager stubs (updateOpenTrades, addOpenTrade, setAccountInfo, showMessage, showNavigatePrompt)
- Marked processResult as deprecated (replaced by TRADE_RESULT handler)

### UX
- **E3.1** StatusPanel: added "Open Pocket Option" actionable banner when PO tab not detected
- **E3.3** Popup: added collapsible activity log viewer

### Chore
- Version bumped to 2.0.3 in manifest.json and constants.ts
