const CURRENCY_FLAGS: Record<string, string> = {
  EUR: '\ud83c\uddea\ud83c\uddfa', USD: '\ud83c\uddfa\ud83c\uddf8', GBP: '\ud83c\uddec\ud83c\udde7', JPY: '\ud83c\uddef\ud83c\uddf5',
  AUD: '\ud83c\udde6\ud83c\uddfa', CAD: '\ud83c\udde8\ud83c\udde6', CHF: '\ud83c\udde8\ud83c\udded', NZD: '\ud83c\uddf3\ud83c\uddff',
  NOK: '\ud83c\uddf3\ud83c\uddf4', MYR: '\ud83c\uddf2\ud83c\uddfe', INR: '\ud83c\uddee\ud83c\uddf3', MXN: '\ud83c\uddf2\ud83c\uddfd',
  COP: '\ud83c\udde8\ud83c\uddf4', BRL: '\ud83c\udde7\ud83c\uddf7', SGD: '\ud83c\uddf8\ud83c\uddec', HKD: '\ud83c\udded\ud83c\uddf0',
  SEK: '\ud83c\uddf8\ud83c\uddea', DKK: '\ud83c\udde9\ud83c\uddf0', PLN: '\ud83c\uddf5\ud83c\uddf1', ZAR: '\ud83c\uddff\ud83c\udde6',
  TRY: '\ud83c\uddf9\ud83c\uddf7', RUB: '\ud83c\uddf7\ud83c\uddfa', CNY: '\ud83c\udde8\ud83c\uddf3', AED: '\ud83c\udde6\ud83c\uddea',
  THB: '\ud83c\uddf9\ud83c\udded', VND: '\ud83c\uddfb\ud83c\uddf3', IDR: '\ud83c\uddee\ud83c\udde9', PKR: '\ud83c\uddf5\ud83c\uddf0',
  EGP: '\ud83c\uddea\ud83c\uddec', ARS: '\ud83c\udde6\ud83c\uddf7', HUF: '\ud83c\udded\ud83c\uddfa', QAR: '\ud83c\uddf6\ud83c\udde6',
  SAR: '\ud83c\uddf8\ud83c\udde6', BHD: '\ud83c\udde7\ud83c\udded', LBP: '\ud83c\uddf1\ud83c\udde7', MAD: '\ud83c\uddf2\ud83c\udde6',
  NGN: '\ud83c\uddf3\ud83c\uddec', UAH: '\ud83c\uddfa\ud83c\udde6', PHP: '\ud83c\uddf5\ud83c\udded', CNH: '\ud83c\udde8\ud83c\uddf3',
  CRYPTO: '\u20bf',
};

export function getPairFlags(asset: string): { base: string; quote: string } {
  const cleaned = asset.replace(/[_\s]?[Oo][Tt][Cc]/g, '').replace(/_/g, '/').trim();
  const match = cleaned.match(/^([A-Z]{3,6})\/([A-Z]{3,6})/i) || cleaned.match(/^([A-Z]{3})([A-Z]{3})/i);
  if (!match) {
    if (asset.toUpperCase().includes('CRYPTO')) return { base: '\u20bf', quote: '' };
    return { base: '\ud83c\udf10', quote: '' };
  }
  return {
    base: CURRENCY_FLAGS[match[1].toUpperCase()] || '\ud83c\udf10',
    quote: CURRENCY_FLAGS[match[2].toUpperCase()] || '\ud83c\udf10',
  };
}
