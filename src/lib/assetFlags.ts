const baseFlags: Record<string, string> = {
  'EUR/USD': '🇪🇺🇺🇸', 'GBP/JPY': '🇬🇧🇯🇵', 'USD/CHF': '🇺🇸🇨🇭', 'AUD/CAD': '🇦🇺🇨🇦',
  'USD/JPY': '🇺🇸🇯🇵', 'NZD/USD': '🇳🇿🇺🇸', 'EUR/GBP': '🇪🇺🇬🇧', 'GBP/USD': '🇬🇧🇺🇸',
  'EUR/JPY': '🇪🇺🇯🇵', 'AUD/USD': '🇦🇺🇺🇸', 'CHF/JPY': '🇨🇭🇯🇵', 'EUR/AUD': '🇪🇺🇦🇺',
  'GBP/CHF': '🇬🇧🇨🇭', 'NZD/JPY': '🇳🇿🇯🇵', 'EUR/NZD': '🇪🇺🇳🇿', 'AUD/JPY': '🇦🇺🇯🇵',
  'GBP/AUD': '🇬🇧🇦🇺', 'USD/CAD': '🇺🇸🇨🇦', 'AUD/NZD': '🇦🇺🇳🇿', 'AUD/CHF': '🇦🇺🇨🇭',
  'EUR/CHF': '🇪🇺🇨🇭', 'CAD/CHF': '🇨🇦🇨🇭', 'CHF/NOK': '🇨🇭🇳🇴', 'EUR/NZD': '🇪🇺🇳🇿',
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
  return assetFlags[asset] || '🌐';
}

export { assetFlags };