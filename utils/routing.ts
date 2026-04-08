interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  name: string;
  maneuverType: string;
  maneuverModifier: string | null;
  location: Coordinate;
}

export interface RouteResult {
  coordinates: Coordinate[];
  steps: RouteStep[];
  totalDistance: number;
  totalDuration: number;
}

const MANEUVER_ICONS: Record<string, string> = {
  'turn-left': 'arrow-back',
  'turn-right': 'arrow-forward',
  'turn-sharp left': 'return-down-back',
  'turn-sharp right': 'return-down-forward',
  'turn-slight left': 'arrow-back',
  'turn-slight right': 'arrow-forward',
  'turn-uturn': 'arrow-undo',
  'fork-left': 'git-branch-outline',
  'fork-right': 'git-branch-outline',
  'merge-left': 'git-merge-outline',
  'merge-right': 'git-merge-outline',
  'ramp-left': 'arrow-back',
  'ramp-right': 'arrow-forward',
  'roundabout': 'sync-outline',
  'rotary': 'sync-outline',
  'depart': 'navigate',
  'arrive': 'flag',
};

export function getManeuverIcon(type: string, modifier: string | null): string {
  if (type === 'arrive') return 'flag';
  if (type === 'depart') return 'navigate';
  const key = modifier ? `${type}-${modifier}` : type;
  return MANEUVER_ICONS[key] ?? 'arrow-up';
}

function buildInstruction(type: string, modifier: string | null, name: string): string {
  const road = name || 'the road';
  switch (type) {
    case 'depart':
      return `Head out on ${road}`;
    case 'arrive':
      return 'Arrive at your destination';
    case 'turn':
      return `Turn ${modifier ?? 'ahead'} onto ${road}`;
    case 'merge':
      return `Merge ${modifier ?? ''} onto ${road}`.trim();
    case 'fork':
      return `Take the ${modifier ?? ''} fork onto ${road}`.trim();
    case 'ramp':
      return `Take the ramp ${modifier ? `to the ${modifier}` : ''} onto ${road}`.trim();
    case 'roundabout':
    case 'rotary':
      return `At the roundabout, take the exit onto ${road}`;
    case 'end of road':
      return `At the end of the road, turn ${modifier ?? 'ahead'} onto ${road}`;
    case 'new name':
    case 'continue':
      return modifier && modifier !== 'straight'
        ? `Continue ${modifier} onto ${road}`
        : `Continue on ${road}`;
    default:
      return modifier ? `${modifier.charAt(0).toUpperCase() + modifier.slice(1)} on ${road}` : `Continue on ${road}`;
  }
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
  const result = await fetchRouteWithSteps(origin, destination);
  return result.coordinates;
}

export async function fetchRouteWithSteps(
  origin: Coordinate,
  destination: Coordinate,
): Promise<RouteResult> {
  const straight: RouteResult = {
    coordinates: [origin, destination],
    steps: [],
    totalDistance: 0,
    totalDuration: 0,
  };

  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}` +
      `?overview=full&geometries=geojson&steps=true`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn('OSRM route fetch failed:', res.status);
      return straight;
    }

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) {
      console.warn('OSRM returned no route');
      return straight;
    }

    const coords: [number, number][] | undefined = route.geometry?.coordinates;
    if (!coords || coords.length < 2) {
      console.warn('OSRM returned no coordinates, using straight line');
      return straight;
    }

    const coordinates = coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

    const steps: RouteStep[] = [];
    const legs = route.legs ?? [];
    for (const leg of legs) {
      for (const step of leg.steps ?? []) {
        const m = step.maneuver;
        if (!m) continue;
        const type: string = m.type ?? 'continue';
        const modifier: string | null = m.modifier ?? null;
        steps.push({
          instruction: buildInstruction(type, modifier, step.name ?? ''),
          distance: step.distance ?? 0,
          duration: step.duration ?? 0,
          name: step.name ?? '',
          maneuverType: type,
          maneuverModifier: modifier,
          location: {
            latitude: m.location?.[1] ?? origin.latitude,
            longitude: m.location?.[0] ?? origin.longitude,
          },
        });
      }
    }

    return {
      coordinates,
      steps,
      totalDistance: route.distance ?? 0,
      totalDuration: route.duration ?? 0,
    };
  } catch (e) {
    console.warn('fetchRouteWithSteps error, using straight line:', e);
    return straight;
  }
}
