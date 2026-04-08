interface Coordinate {
  latitude: number;
  longitude: number;
}

/**
 * Fetches a driving route between two points using the free OSRM demo server.
 * Returns an array of coordinates tracing the road-following path.
 * Falls back to a straight line between origin and destination on failure.
 */
export async function fetchRoute(
  origin: Coordinate,
  destination: Coordinate,
): Promise<Coordinate[]> {
  const straight = [origin, destination];
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}` +
      `?overview=full&geometries=geojson`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn('OSRM route fetch failed:', res.status);
      return straight;
    }

    const data = await res.json();
    const coords: [number, number][] | undefined =
      data.routes?.[0]?.geometry?.coordinates;

    if (!coords || coords.length < 2) {
      console.warn('OSRM returned no coordinates, using straight line');
      return straight;
    }

    return coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  } catch (e) {
    console.warn('fetchRoute error, using straight line:', e);
    return straight;
  }
}
