export function formatAssetName(raw: string): string {
  let name = raw.trim();
  if (name.includes('/')) {
    return name.replace(/_otc/i, ' OTC').replace(/\s+otc/i, ' OTC').trim();
  }
  const match = name.match(/^([A-Z]{3})([A-Z]{3})(?:[_\s-]?otc)?$/i);
  if (match) {
    const base = match[1].toUpperCase();
    const quote = match[2].toUpperCase();
    const isOtc = /otc/i.test(name);
    return `${base}/${quote}${isOtc ? ' OTC' : ''}`;
  }
  return name;
}
