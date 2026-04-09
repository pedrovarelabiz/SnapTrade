import { isLiveForexPair } from '../lib/market-hours';

describe('isLiveForexPair', () => {
  it('identifies OTC pairs as non-live', () => {
    expect(isLiveForexPair('EURUSD_otc')).toBe(false);
    expect(isLiveForexPair('GBPJPY_otc')).toBe(false);
  });

  it('identifies crypto with # prefix as non-live forex', () => {
    expect(isLiveForexPair('#Bitcoin')).toBe(false);
    expect(isLiveForexPair('#BTCUSD')).toBe(false);
  });

  it('treats 6-letter crypto pairs as live forex (known limitation)', () => {
    // BTCUSD matches XXXYYY regex — this is expected behavior
    expect(isLiveForexPair('BTCUSD')).toBe(true);
  });

  it('identifies standard forex pairs as live', () => {
    expect(isLiveForexPair('EURUSD')).toBe(true);
    expect(isLiveForexPair('GBPJPY')).toBe(true);
    expect(isLiveForexPair('USDJPY')).toBe(true);
  });
});
