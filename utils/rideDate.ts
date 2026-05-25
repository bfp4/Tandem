/**
 * Calendar date (YYYY-MM-DD) + clock time (HH:MM) in the device's local timezone.
 * Avoids `Date.parse` ambiguity where `YYYY-MM-DD` alone is UTC midnight.
 */
export function parseLocalRideStart(
  ymd: string,
  requestedStart: string | undefined,
): Date {
  const parts = (ymd || '').split('-').map((p) => parseInt(p, 10));
  const y = parts[0];
  const mo = parts[1];
  const d = parts[2];
  if (!y || !mo || !d) return new Date(NaN);
  const start = requestedStart ?? '00:00';
  const [hRaw, mRaw] = start.split(':');
  const h = parseInt(hRaw ?? '0', 10) || 0;
  const mi = parseInt(mRaw ?? '0', 10) || 0;
  return new Date(y, mo - 1, d, h, mi, 0, 0);
}

/** Format a YYYY-MM-DD date as "Mon, Jan 1". */
export function formatRideDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = parseLocalRideStart(dateStr, '00:00');
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Returns the duration in minutes between two "HH:MM" strings. */
export function getRideDurationMinutes(start: string, end: string): number {
  if (!start || !end || !start.includes(':') || !end.includes(':')) return 0;

  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);

  let minutes = eh * 60 + em - (sh * 60 + sm);

  if (minutes < 0) minutes += 24 * 60;

  return minutes;
}

/** Formats a minute count as "X hr Y min" or just "Y min". */
export function formatDurationMinutes(minutes: number): string {
  if (minutes <= 0) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} hr ${m} min`;
  if (h > 0) return `${h} hr`;
  return `${m} min`;
}
