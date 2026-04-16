import { fetchRouteWithSteps } from './routing';

interface Coordinate {
  latitude: number;
  longitude: number;
}

/**
 * Calculates the estimated drive time between two GPS coordinates
 * using the OSRM routing service (similar to how Uber estimates drive times).
 * 
 * This uses actual road networks, speed limits, and turn-by-turn directions
 * to provide realistic drive time estimates rather than simple straight-line calculations.
 * 
 * @param pickup - Pickup location coordinates
 * @param dropoff - Drop-off location coordinates
 * @returns Estimated drive time in minutes, or null if calculation fails
 */
export async function calculateDriveTime(
  pickup: Coordinate,
  dropoff: Coordinate
): Promise<number | null> {
  try {
    const result = await fetchRouteWithSteps(pickup, dropoff);
    
    if (!result.totalDuration || result.totalDuration <= 0) {
      return null;
    }
    
    // OSRM returns duration in seconds, accounting for:
    // - Actual road network (not straight-line)
    // - Road types and speed limits
    // - Turns and intersections
    // - One-way streets and route restrictions
    
    // Convert seconds to minutes and round to nearest minute
    const minutes = Math.round(result.totalDuration / 60);
    
    // Apply a small buffer (5-10%) for real-world conditions like:
    // - Traffic signals and stop signs
    // - Finding parking/exact pickup location
    // - Minor delays
    // This makes estimates more realistic, similar to Uber's approach
    const bufferedMinutes = Math.ceil(minutes * 1.08);
    
    return bufferedMinutes;
  } catch (error) {
    console.warn('Failed to calculate drive time:', error);
    return null;
  }
}

/**
 * Calculates drive time and also returns the route distance.
 * Useful when you need both metrics together.
 * 
 * @param pickup - Pickup location coordinates
 * @param dropoff - Drop-off location coordinates
 * @returns Object with drive time (minutes) and distance (meters), or null if calculation fails
 */
export async function calculateDriveTimeAndDistance(
  pickup: Coordinate,
  dropoff: Coordinate
): Promise<{ timeMinutes: number; distanceMeters: number } | null> {
  try {
    const result = await fetchRouteWithSteps(pickup, dropoff);
    
    if (!result.totalDuration || result.totalDuration <= 0 || !result.totalDistance) {
      return null;
    }
    
    const minutes = Math.round(result.totalDuration / 60);
    const bufferedMinutes = Math.ceil(minutes * 1.08);
    
    return {
      timeMinutes: bufferedMinutes,
      distanceMeters: result.totalDistance,
    };
  } catch (error) {
    console.warn('Failed to calculate drive time and distance:', error);
    return null;
  }
}

/**
 * Formats drive time in minutes to a human-readable string
 * 
 * @param minutes - Drive time in minutes
 * @returns Formatted string like "25 min" or "1 hr 15 min"
 */
export function formatDriveTime(minutes: number | null): string {
  if (minutes == null || minutes <= 0) {
    return '—';
  }
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  if (hours > 0 && mins > 0) {
    return `${hours} hr ${mins} min`;
  }
  if (hours > 0) {
    return `${hours} hr`;
  }
  return `${mins} min`;
}
