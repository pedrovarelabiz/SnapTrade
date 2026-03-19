/**
 * Central time formatting. ALL components must use these functions.
 * Database stores UTC. API returns UTC ISO strings.
 * These functions convert to user's local timezone automatically.
 */

export function formatTime(utcString: string | null | undefined): string {
  if (!utcString) return '--:--';
  const date = new Date(utcString);
  if (isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatTimeWithSeconds(utcString: string | null | undefined): string {
  if (!utcString) return '--:--:--';
  const date = new Date(utcString);
  if (isNaN(date.getTime())) return '--:--:--';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(utcString: string | null | undefined): string {
  if (!utcString) return '';
  const date = new Date(utcString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(utcString: string | null | undefined): string {
  if (!utcString) return '';
  const date = new Date(utcString);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatGaleTime(galeTimeStr: string, signalDateUtc: string): string {
  // galeTimeStr = "09:35" (UTC, already converted by backend)
  // signalDateUtc = "2026-03-19T09:28:00Z"
  const datePart = signalDateUtc.split('T')[0];
  const utcDateTime = new Date(datePart + 'T' + galeTimeStr + ':00Z');
  if (isNaN(utcDateTime.getTime())) return galeTimeStr;
  return utcDateTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function getUserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function getTimezoneAbbr(): string {
  const parts = new Date().toLocaleTimeString([], { timeZoneName: 'short' }).split(' ');
  return parts[parts.length - 1] || '';
}
