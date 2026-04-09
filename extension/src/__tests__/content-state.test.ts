// Mock browser globals before importing content-state
const mockAddEventListener = jest.fn();
const mockSendMessage = jest.fn().mockResolvedValue(undefined);
(global as any).window = { addEventListener: mockAddEventListener, postMessage: jest.fn(), location: { hostname: 'test' } };
(global as any).chrome = { runtime: { sendMessage: mockSendMessage }, storage: { local: { get: jest.fn(), set: jest.fn() }, session: { get: jest.fn(), set: jest.fn() }, onChanged: { addListener: jest.fn() } } };
(global as any).document = { title: 'test', querySelector: jest.fn(), querySelectorAll: jest.fn(() => []) };

import { normalizeAssetForGuard, getTradeSource, enrichTradesWithSource, generateExecutionId, tradeSourceMap } from '../content/content-state';

describe('normalizeAssetForGuard', () => {
  it('lowercases and removes spaces, underscores, slashes', () => {
    expect(normalizeAssetForGuard('EUR/USD')).toBe('eurusd');
    expect(normalizeAssetForGuard('CADJPY OTC')).toBe('cadjpyotc');
    expect(normalizeAssetForGuard('CADJPY_otc')).toBe('cadjpyotc');
    expect(normalizeAssetForGuard('BTC/USD')).toBe('btcusd');
  });

  it('handles empty string', () => {
    expect(normalizeAssetForGuard('')).toBe('');
  });
});

describe('getTradeSource', () => {
  it('returns backend for backend_ prefix', () => {
    expect(getTradeSource('backend_123')).toBe('backend');
  });

  it('returns ai for llm_ prefix', () => {
    expect(getTradeSource('llm_EURUSD_123')).toBe('ai');
  });

  it('returns indicators for auto_ prefix', () => {
    expect(getTradeSource('auto_signal')).toBe('indicators');
  });

  it('returns ai for ai_analyst channel', () => {
    expect(getTradeSource('some_id', 'ai_analyst')).toBe('ai');
  });

  it('returns indicators for st_indicators channel', () => {
    expect(getTradeSource('some_id', 'st_indicators')).toBe('indicators');
  });

  it('returns telegram for other channels', () => {
    expect(getTradeSource('some_id', 'tyl_trading')).toBe('telegram');
  });

  it('returns manual when no channel', () => {
    expect(getTradeSource('some_id')).toBe('manual');
  });
});

describe('enrichTradesWithSource', () => {
  it('enriches trades with source from tradeSourceMap', () => {
    tradeSourceMap.set('eurusd', 'ai');
    const trades = [{ asset: 'EUR/USD', amount: 10 }];
    const enriched = enrichTradesWithSource(trades);
    expect(enriched[0]).toEqual({ asset: 'EUR/USD', amount: 10, source: 'ai' });
    tradeSourceMap.delete('eurusd');
  });

  it('returns trade unchanged if no source found', () => {
    const trades = [{ asset: 'UNKNOWN', amount: 5 }];
    const enriched = enrichTradesWithSource(trades);
    expect(enriched[0]).toEqual({ asset: 'UNKNOWN', amount: 5 });
  });

  it('does not mutate original trades', () => {
    tradeSourceMap.set('gbpusd', 'telegram');
    const original = [{ asset: 'GBP/USD', amount: 20 }];
    const enriched = enrichTradesWithSource(original);
    expect(original[0]).toEqual({ asset: 'GBP/USD', amount: 20 });
    expect(enriched[0]).toHaveProperty('source', 'telegram');
    tradeSourceMap.delete('gbpusd');
  });
});

describe('generateExecutionId', () => {
  it('returns unique ids', () => {
    const id1 = generateExecutionId();
    const id2 = generateExecutionId();
    expect(id1).not.toBe(id2);
  });

  it('starts with exec_ prefix', () => {
    expect(generateExecutionId()).toMatch(/^exec_/);
  });
});
