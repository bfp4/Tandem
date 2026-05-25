/** Format meters as "350 m" or "1.2 mi". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const miles = meters / 1609.34;
  return `${miles.toFixed(1)} mi`;
}

/** Format meters as "350 m" or "1.2 km", or em-dash for null. */
export function formatDistanceKm(meters: number | null): string {
  if (meters == null) return '—';
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** Format route step distance; returns empty string below 30 m. */
export function formatStepDistance(meters: number): string {
  if (meters < 30) return '';
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  const miles = meters / 1609.34;
  return `${miles.toFixed(1)} mi`;
}

/** Format duration from seconds as "5 min" or "1h 30m". */
export function formatDurationFromSeconds(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
