const baseFlags: Record<string, string> = {
  'EUR/USD': '🇪🇺🇺🇸', 'GBP/JPY': '🇬🇧🇯🇵', 'USD/CHF': '🇺🇸🇨🇭', 'AUD/CAD': '🇦🇺🇨🇦',
  'USD/JPY': '🇺🇸🇯🇵', 'NZD/USD': '🇳🇿🇺🇸', 'EUR/GBP': '🇪🇺🇬🇧', 'GBP/USD': '🇬🇧🇺🇸',
  'EUR/JPY': '🇪🇺🇯🇵', 'AUD/USD': '🇦🇺🇺🇸', 'CHF/JPY': '🇨🇭🇯🇵', 'EUR/AUD': '🇪🇺🇦🇺',
  'GBP/CHF': '🇬🇧🇨🇭', 'NZD/JPY': '🇳🇿🇯🇵', 'EUR/NZD': '🇪🇺🇳🇿', 'AUD/JPY': '🇦🇺🇯🇵',
  'GBP/AUD': '🇬🇧🇦🇺', 'USD/CAD': '🇺🇸🇨🇦', 'AUD/NZD': '🇦🇺🇳🇿', 'AUD/CHF': '🇦🇺🇨🇭',
  'EUR/CHF': '🇪🇺🇨🇭', 'CAD/CHF': '🇨🇦🇨🇭', 'CHF/NOK': '🇨🇭🇳🇴',
  'CAD/JPY': '🇨🇦🇯🇵', 'NZD/CAD': '🇳🇿🇨🇦', 'GBP/NZD': '🇬🇧🇳🇿', 'GBP/CAD': '🇬🇧🇨🇦',
  'USD/SGD': '🇺🇸🇸🇬', 'CHF/SGD': '🇨🇭🇸🇬', 'AUD/SGD': '🇦🇺🇸🇬', 'USD/MXN': '🇺🇸🇲🇽',
  'EUR/HUF': '🇪🇺🇭🇺', 'EUR/PLN': '🇪🇺🇵🇱', 'GBP/SEK': '🇬🇧🇸🇪', 'GBP/ZAR': '🇬🇧🇿🇦',
  'NZD/CHF': '🇳🇿🇨🇭',
  'CRYPTO IDX': '₿',
};

// Build a complete map that includes OTC variants automatically
const assetFlags: Record<string, string> = { ...baseFlags };

Object.entries(baseFlags).forEach(([pair, flag]) => {
  if (!pair.includes('OTC') && pair !== 'CRYPTO IDX') {
    assetFlags[`${pair} OTC`] = flag;
  }
});

export function getAssetFlag(asset: string): string {
  // Direct lookup
  if (assetFlags[asset]) return assetFlags[asset];

  // Normalize: EURUSD_otc -> EUR/USD OTC, GBPJPY_otc -> GBP/JPY OTC
  let normalized = asset
    .replace(/_otc$/i, ' OTC')
    .replace(/([A-Z]{3})([A-Z]{3})/, '$1/$2');
  if (assetFlags[normalized]) return assetFlags[normalized];

  // Try without OTC
  normalized = normalized.replace(' OTC', '');
  if (assetFlags[normalized]) return assetFlags[normalized];

  // Try base currency flag
  const match = asset.match(/^([A-Z]{3})/);
  if (match) {
    const CURRENCY_FLAGS: Record<string, string> = {
      'EUR': '\u{1F1EA}\u{1F1FA}', 'USD': '\u{1F1FA}\u{1F1F8}', 'GBP': '\u{1F1EC}\u{1F1E7}',
      'JPY': '\u{1F1EF}\u{1F1F5}', 'AUD': '\u{1F1E6}\u{1F1FA}', 'CAD': '\u{1F1E8}\u{1F1E6}',
      'CHF': '\u{1F1E8}\u{1F1ED}', 'NZD': '\u{1F1F3}\u{1F1FF}', 'NOK': '\u{1F1F3}\u{1F1F4}',
      'SEK': '\u{1F1F8}\u{1F1EA}', 'BRL': '\u{1F1E7}\u{1F1F7}', 'MXN': '\u{1F1F2}\u{1F1FD}',
      'ZAR': '\u{1F1FF}\u{1F1E6}', 'SGD': '\u{1F1F8}\u{1F1EC}', 'HKD': '\u{1F1ED}\u{1F1F0}',
      'PLN': '\u{1F1F5}\u{1F1F1}', 'INR': '\u{1F1EE}\u{1F1F3}', 'MYR': '\u{1F1F2}\u{1F1FE}',
      'TRY': '\u{1F1F9}\u{1F1F7}', 'DKK': '\u{1F1E9}\u{1F1F0}', 'COP': '\u{1F1E8}\u{1F1F4}',
    };
    const base = match[1];
    const quoteMatch = asset.match(/[A-Z]{3}[\/]?([A-Z]{3})/);
    const baseFlag = CURRENCY_FLAGS[base] || '';
    const quoteFlag = quoteMatch ? (CURRENCY_FLAGS[quoteMatch[1]] || '') : '';
    if (baseFlag) return baseFlag + quoteFlag;
  }

  return '\u{1F310}';
}

export { assetFlags };