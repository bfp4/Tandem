const cache = new Map<string, string>();

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
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
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'HuberApp/1.0' } },
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
    cache.set(key, label);
    return label;
  } catch {
    const fallback = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    cache.set(key, fallback);
    return fallback;
  }
}
