const reverseCache = new Map<string, string>();
const forwardCache = new Map<string, { lat: number; lng: number } | null>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}

/**
 * Forward-geocodes an address string into lat/lng coordinates using Nominatim.
 * Returns null if the address cannot be resolved.
 */
export async function forwardGeocode(
  address: string,
): Promise<{ lat: number; lng: number } | null> {
  const key = address.trim().toLowerCase();
  if (forwardCache.has(key)) return forwardCache.get(key) ?? null;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'TandemApp/1.0' } },
    );
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      forwardCache.set(key, null);
      return null;
    }
    const result = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    forwardCache.set(key, result);
    return result;
  } catch {
    forwardCache.set(key, null);
    return null;
  }
}

/**
 * Reverse-geocodes a lat/lng pair into a short human-readable address
 * using the Nominatim API. Results are cached in memory to avoid
 * redundant lookups across re-renders.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string> {
  const key = cacheKey(lat, lng);
  const cached = reverseCache.get(key);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'TandemApp/1.0' } },
    );
    const data = await res.json();

    const addr = data.address ?? {};
    const parts = [
      addr.house_number,
      addr.road,
      addr.city || addr.town || addr.village,
      addr.state,
    ].filter(Boolean);

    const label = parts.length > 0 ? parts.join(', ') : data.display_name ?? `${lat}, ${lng}`;
    reverseCache.set(key, label);
    return label;
  } catch {
    const fallback = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    reverseCache.set(key, fallback);
    return fallback;
  }
}
