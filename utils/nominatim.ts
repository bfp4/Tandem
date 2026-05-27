export interface NominatimResult {
  place_id?: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  address?: Record<string, string>;
}

export function formatNominatimShortLabel(item: NominatimResult): string {
  const addr = item.address ?? {};
  const street = [addr.house_number, addr.road].filter(Boolean).join(' ');
  const city = addr.city || addr.town || addr.village || addr.suburb || '';
  const state = addr.state || '';
  const parts = [street, city, state].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : item.display_name;
}

const STREET_TYPES = new Set([
  'house',
  'building',
  'residential',
  'road',
  'street',
  'place',
]);

export interface NominatimSearchOptions {
  limit?: number;
  streetLevelOnly?: boolean;
  featuretype?: string;
}

export async function searchNominatim(
  query: string,
  options: NominatimSearchOptions = {},
): Promise<NominatimResult[]> {
  const { limit = 5, streetLevelOnly = false, featuretype } = options;
  const encoded = encodeURIComponent(query.trim());
  const featureParam = featuretype ? `&featuretype=${featuretype}` : '';
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&addressdetails=1&limit=${limit}${featureParam}`,
    { headers: { 'Accept-Language': 'en', 'User-Agent': 'TandemApp/1.0' } },
  );
  const data: NominatimResult[] = await res.json();
  if (!Array.isArray(data)) return [];

  if (!streetLevelOnly) return data;

  const filtered = data.filter(
    (r) =>
      STREET_TYPES.has(r.type ?? '') ||
      r.class === 'building' ||
      r.class === 'highway',
  );
  return filtered.length > 0 ? filtered : data.slice(0, 5);
}
