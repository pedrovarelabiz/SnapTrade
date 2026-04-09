export const OVERLAY_STYLES = `
:host {
  --st-bg: rgba(18, 20, 35, 0.97);
  --st-bg-card: rgba(25, 28, 45, 0.95);
  --st-bg-hover: rgba(35, 38, 55, 0.95);
  --st-border: rgba(55, 60, 85, 0.5);
  --st-border-light: rgba(55, 60, 85, 0.3);
  --st-text: #e8eaf0;
  --st-text-dim: #8890a8;
  --st-text-muted: #5a6080;
  --st-green: #00e676;
  --st-green-dim: rgba(0, 230, 118, 0.15);
  --st-red: #ff1744;
  --st-red-dim: rgba(255, 23, 68, 0.15);
  --st-blue: #2979ff;
  --st-purple: #7c4dff;
  --st-gold: #ffd740;
  --st-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  position: fixed;
  top: 52px;
  right: 12px;
  z-index: 999999;
  font-family: var(--st-font);
  font-size: 12px;
  line-height: 1.4;
  color: var(--st-text);
  pointer-events: none;
  width: fit-content;
  height: fit-content;
  overflow: visible;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
.st-panel { width: 340px; pointer-events: auto; background: var(--st-bg); border: 1px solid var(--st-border); border-radius: 10px; overflow: hidden; box-shadow: 0 8px 32px rgba(0,0,0,0.4); backdrop-filter: blur(12px); }
.st-header { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--st-border); cursor: grab; user-select: none; }
.st-header.dragging { cursor: grabbing; }
.st-header__left { display: flex; align-items: center; gap: 8px; }
.st-logo { font-weight: 700; font-size: 13px; color: var(--st-text); display: flex; align-items: center; gap: 4px; }
.st-logo__icon { width: 18px; height: 18px; background: var(--st-purple); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; }
.st-mode-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
.st-mode-badge--auto { background: var(--st-green-dim); color: var(--st-green); }
.st-mode-badge--semi-auto { background: rgba(255,215,64,0.15); color: var(--st-gold); }
.st-mode-badge--manual { background: rgba(41,121,255,0.15); color: var(--st-blue); }
.st-header__right { display: flex; align-items: center; gap: 4px; }
.st-dot { width: 6px; height: 6px; border-radius: 50%; }
.st-dot--on { background: var(--st-green); box-shadow: 0 0 6px var(--st-green); }
.st-dot--off { background: var(--st-red); box-shadow: 0 0 6px var(--st-red); }
.st-header__btn { width: 22px; height: 22px; border: none; background: transparent; color: var(--st-text-dim); cursor: pointer; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: all 0.15s; }
.st-header__btn:hover { background: var(--st-bg-hover); color: var(--st-text); }
.st-status { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; border-bottom: 1px solid var(--st-border-light); font-size: 11px; }
.st-status__account { display: flex; align-items: center; gap: 6px; }
.st-status__type { font-weight: 700; font-size: 10px; padding: 1px 5px; border-radius: 3px; }
.st-status__type--demo { background: var(--st-green-dim); color: var(--st-green); }
.st-status__type--real { background: var(--st-red-dim); color: var(--st-red); }
.st-status__balance { font-weight: 600; font-size: 13px; color: var(--st-text); }
.st-stats { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; border-bottom: 1px solid var(--st-border-light); }
.st-stats__progress { flex: 1; height: 4px; background: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden; margin-right: 10px; }
.st-stats__bar { height: 100%; border-radius: 2px; transition: width 0.3s ease; }
.st-stats__wl { font-size: 11px; color: var(--st-text-dim); white-space: nowrap; }
.st-stats__pnl { font-weight: 700; font-size: 13px; white-space: nowrap; margin-left: 10px; }
.st-stats__pnl--pos { color: var(--st-green); }
.st-stats__pnl--neg { color: var(--st-red); }
.st-signal-alert { margin: 8px; padding: 10px; background: var(--st-bg-card); border: 1px solid var(--st-purple); border-radius: 8px; animation: st-pulse 2s ease-in-out infinite; }
@keyframes st-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(124,77,255,0.3); } 50% { box-shadow: 0 0 12px 2px rgba(124,77,255,0.2); } }
.st-signal-alert__header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.st-signal-alert__pair { font-weight: 700; font-size: 13px; display: flex; align-items: center; gap: 6px; }
.st-signal-alert__body { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.st-signal-alert__dir { font-weight: 800; font-size: 14px; padding: 3px 10px; border-radius: 4px; }
.st-signal-alert__dir--call { background: var(--st-green-dim); color: var(--st-green); }
.st-signal-alert__dir--put { background: var(--st-red-dim); color: var(--st-red); }
.st-signal-alert__amount { font-size: 12px; color: var(--st-text-dim); }
.st-signal-alert__amount strong { color: var(--st-text); font-size: 14px; }
.st-signal-alert__actions { display: flex; gap: 6px; }
.st-signal-alert__btn { flex: 1; padding: 7px 0; border: none; border-radius: 6px; font-weight: 700; font-size: 12px; cursor: pointer; transition: all 0.15s; text-transform: uppercase; letter-spacing: 0.5px; }
.st-signal-alert__btn--execute { background: var(--st-green); color: #000; }
.st-signal-alert__btn--execute:hover { background: #00ff88; box-shadow: 0 0 12px rgba(0,230,118,0.3); }
.st-signal-alert__btn--skip { background: rgba(255,255,255,0.08); color: var(--st-text-dim); }
.st-signal-alert__btn--skip:hover { background: rgba(255,255,255,0.15); color: var(--st-text); }
.st-signal-alert__btn--auto { background: var(--st-purple); color: #fff; font-size: 11px; }
.st-section { border-bottom: 1px solid var(--st-border-light); }
.st-section__title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--st-text-muted); padding: 6px 12px 4px; }
.st-trade-row { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; padding: 6px 12px; border-bottom: 1px solid var(--st-border-light); transition: background 0.15s; }
.st-trade-row:last-child { border-bottom: none; }
.st-trade-row:hover { background: var(--st-bg-hover); }
.st-trade-row__top-left { display: flex; align-items: center; gap: 4px; }
.st-trade-row__pair { font-weight: 600; font-size: 12px; color: var(--st-text); }
.st-trade-row__payout { font-size: 10px; color: var(--st-green); font-weight: 600; }
.st-trade-row__dir { font-size: 10px; font-weight: 700; }
.st-trade-row__dir--call { color: var(--st-green); }
.st-trade-row__dir--put { color: var(--st-red); }
.st-trade-row__top-right { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
.st-trade-row__time { font-size: 11px; color: var(--st-text-dim); font-variant-numeric: tabular-nums; font-family: monospace; font-weight: 600; }
.st-trade-row__bottom-left { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--st-text-dim); }
.st-trade-row__bottom-right { display: flex; align-items: center; gap: 6px; justify-content: flex-end; }
.st-trade-row__profit { font-weight: 700; font-size: 12px; }
.st-trade-row__profit--win { color: var(--st-green); }
.st-trade-row__profit--loss { color: var(--st-red); }
.st-trade-row__profit--pending { color: var(--st-gold); }
.st-result-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 12px; font-size: 11px; animation: st-slide-in 0.3s ease; }
.st-result-row__left { display: flex; align-items: center; gap: 6px; }
.st-result-row__icon { font-size: 12px; }
.st-result-row__pair { font-weight: 600; color: var(--st-text); }
.st-result-row__dir { font-weight: 600; font-size: 10px; }
.st-result-row__dir--call { color: var(--st-green); }
.st-result-row__dir--put { color: var(--st-red); }
.st-result-row__pnl { font-weight: 700; }
.st-result-row__pnl--win { color: var(--st-green); }
.st-result-row__pnl--loss { color: var(--st-red); }
.st-result-row__payout { font-size: 10px; color: var(--st-text-muted); }
.st-footer { display: flex; align-items: center; justify-content: space-between; padding: 6px 12px; font-size: 11px; color: var(--st-text-dim); }
.st-footer__stake { font-weight: 600; color: var(--st-purple); }
.st-compact { display: flex; align-items: center; gap: 10px; padding: 6px 12px; background: var(--st-bg); pointer-events: auto; border: 1px solid var(--st-border); border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); cursor: pointer; transition: all 0.15s; white-space: nowrap; }
.st-compact:hover { background: var(--st-bg-hover); box-shadow: 0 4px 20px rgba(0,0,0,0.4); }
.st-compact__logo { font-weight: 700; font-size: 12px; display: flex; align-items: center; gap: 4px; }
.st-compact__dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.st-compact__sep { width: 1px; height: 16px; background: var(--st-border); }
.st-compact__stat { font-size: 11px; color: var(--st-text-dim); }
.st-compact__expand { font-size: 10px; color: var(--st-text-muted); }
.st-toast-container { position: fixed; bottom: 20px; right: 12px; display: flex; flex-direction: column; gap: 6px; z-index: 10; pointer-events: none; }
.st-toast { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; opacity: 0; transform: translateX(100px); transition: all 0.3s cubic-bezier(0.22,1,0.36,1); box-shadow: 0 8px 24px rgba(0,0,0,0.4); white-space: nowrap; }
.st-toast--visible { opacity: 1; transform: translateX(0); }
.st-toast--win { background: linear-gradient(135deg,rgba(0,230,118,0.2),rgba(0,230,118,0.05)); border: 1px solid var(--st-green); color: var(--st-green); }
.st-toast--loss { background: linear-gradient(135deg,rgba(255,23,68,0.2),rgba(255,23,68,0.05)); border: 1px solid var(--st-red); color: var(--st-red); }
.st-toast--trade { background: linear-gradient(135deg,rgba(124,77,255,0.2),rgba(124,77,255,0.05)); border: 1px solid var(--st-purple); color: var(--st-purple); }
.st-empty { padding: 16px 12px; text-align: center; color: var(--st-text-muted); font-size: 11px; }
.st-scrollable { max-height: 200px; overflow-y: auto; }
.st-scrollable::-webkit-scrollbar { width: 4px; }
.st-scrollable::-webkit-scrollbar-track { background: transparent; }
.st-scrollable::-webkit-scrollbar-thumb { background: var(--st-border); border-radius: 2px; }
@keyframes st-slide-in { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
.st-animate-in { animation: st-slide-in 0.3s cubic-bezier(0.22,1,0.36,1); }
`;
