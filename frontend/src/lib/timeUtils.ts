/**
 * Central time formatting. ALL times in user's local timezone, 24h format.
 */

export function formatTime(utcString: string | null | undefined): string {
  if (!utcString) return '--:--';
  const date = new Date(utcString);
  if (isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatTimeWithSeconds(utcString: string | null | undefined): string {
  if (!utcString) return '--:--:--';
  const date = new Date(utcString);
  if (isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function formatDateTime(utcString: string | null | undefined): string {
  if (!utcString) return '';
  const date = new Date(utcString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatDate(utcString: string | null | undefined): string {
  if (!utcString) return '';
  const date = new Date(utcString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatGaleTime(galeTimeStr: string, signalDateUtc: string): string {
  const datePart = signalDateUtc.split('T')[0];
  const utcDateTime = new Date(datePart + 'T' + galeTimeStr + ':00Z');
  if (isNaN(utcDateTime.getTime())) return galeTimeStr;
  return utcDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function getTimezoneAbbr(): string {
  const parts = new Date().toLocaleTimeString('en-US', { timeZoneName: 'short' }).split(' ');
  return parts[parts.length - 1] || '';
}
