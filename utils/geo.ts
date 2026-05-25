export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Safely extract lat/lng from a Firestore GeoPoint, which may arrive
 * as a class instance (with .latitude/.longitude getters) or as a
 * plain object (with _lat/_long fields after serialization).
 */
export function geoPointToLatLng(gp: unknown): LatLng | null {
  if (!gp || typeof gp !== 'object') return null;
  const point = gp as Record<string, unknown>;
  const lat = point.latitude ?? point._lat;
  const lng = point.longitude ?? point._long ?? point._lng;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { latitude: lat, longitude: lng };
}

export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function getDistanceMeters(from: LatLng, to: LatLng): number {
  return haversineMeters(from.latitude, from.longitude, to.latitude, to.longitude);
}
