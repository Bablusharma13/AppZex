import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

/** Parses an API timestamp, tolerating null/undefined/invalid input. */
export function toDate(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? date : null;
}

/** `12 Mar 2026` style date used throughout tables. */
export function formatDate(value?: string | Date | null): string {
  const date = toDate(value);
  return date ? format(date, 'd MMM yyyy') : '—';
}

/** Date plus time, for meetings and audit trails. */
export function formatDateTime(value?: string | Date | null): string {
  const date = toDate(value);
  return date ? format(date, 'd MMM yyyy, HH:mm') : '—';
}

/** `3 days ago` / `in 2 days` relative to now. */
export function formatRelative(value?: string | Date | null): string {
  const date = toDate(value);
  if (!date) return '—';
  const diff = date.getTime() - Date.now();
  const distance = formatDistanceToNowStrict(date);
  return diff < 0 ? `${distance} ago` : `in ${distance}`;
}

/** True when a date is in the past. */
export function isPast(value?: string | Date | null): boolean {
  const date = toDate(value);
  return date ? date.getTime() < Date.now() : false;
}

/** Whole days between now and a future date (negative when overdue). */
export function daysUntil(value?: string | Date | null): number | null {
  const date = toDate(value);
  if (!date) return null;
  return Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

/** Human file size. */
export function formatBytes(bytes?: number): string {
  if (!bytes || bytes < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/** Initials for avatar placeholders. */
export function initials(name?: string): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** `snake.case` or `SCREAMING_CASE` event type -> `Sentence case`. */
export function humanizeEvent(eventType: string): string {
  const [entity, action] = eventType.split('.');
  const words = (action ?? entity ?? '').replace(/_/g, ' ');
  const label = words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
  return entity ? `${label} ${entity}` : label;
}