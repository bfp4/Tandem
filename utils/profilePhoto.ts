/** Non-empty HTTPS (or http) URL from a user document's `profilePhoto` field. */
export function normalizeProfilePhotoUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const u = value.trim();
  return u.length > 0 ? u : '';
}
