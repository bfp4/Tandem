import type { User } from '@/types/user';
import { distanceBetween } from 'geofire-common';
import { getAllDrivers, getAllRiders } from './userService';

const MILES_TO_KM = 1.60934;
const DEFAULT_MAX_DISTANCE_MILES = 25;

export interface MatchResult {
  user: User;
  score: number;
  distanceMiles: number;
  scheduleOverlapPercent: number;
}

interface TimeSlot {
  day: string;
  time: string;
  available: boolean;
}

/**
 * Computes the fraction of overlapping available time slots between two schedules.
 * Returns 0-1: 1 means full overlap, 0 means no overlap.
 */
function computeScheduleOverlap(
  scheduleA: TimeSlot[],
  scheduleB: TimeSlot[],
): number {
  const availableA = new Set(
    scheduleA.filter(s => s.available).map(s => `${s.day}-${s.time}`),
  );
  const availableB = new Set(
    scheduleB.filter(s => s.available).map(s => `${s.day}-${s.time}`),
  );

  if (availableA.size === 0 || availableB.size === 0) return 0;

  let overlap = 0;
  for (const key of availableA) {
    if (availableB.has(key)) overlap++;
  }

  // Normalize against the smaller of the two sets so a user with few available
  // slots isn't penalized for not having a huge schedule.
  const minSize = Math.min(availableA.size, availableB.size);
  return overlap / minSize;
}

/**
 * Composite match score for a candidate against the current user.
 *
 * Components:
 *   - Star rating:        40%  (candidate.starRating / 5)
 *   - Schedule overlap:   40%  (fraction of overlapping available slots)
 *   - Distance (inverse): 20%  (1 - distanceMiles / maxDistanceMiles)
 */
function computeMatchScore(
  currentUserSchedule: TimeSlot[],
  candidate: User,
  distanceMiles: number,
  maxDistanceMiles: number,
): number {
  const ratingScore = (candidate.starRating / 5.0) * 0.4;

  const candidateSchedule: TimeSlot[] = Array.isArray((candidate as any).schedule)
    ? (candidate as any).schedule
    : [];
  const overlapScore = computeScheduleOverlap(currentUserSchedule, candidateSchedule) * 0.4;

  const distanceScore = (1 - Math.min(distanceMiles, maxDistanceMiles) / maxDistanceMiles) * 0.2;

  return ratingScore + overlapScore + distanceScore;
}

/**
 * Returns ranked match results for the current user.
 *
 * @param currentUser    The user performing the search (needs schedule on the object).
 * @param refLat         Latitude of the search reference point, or null if unavailable.
 * @param refLng         Longitude of the search reference point, or null if unavailable.
 * @param role           'driver' | 'rider' — which role to search for.
 * @param maxDistanceMiles  Hard cutoff when location is available. Default 25.
 */
export async function getMatchedUsers(
  currentUser: User & { schedule?: TimeSlot[] },
  refLat: number | null,
  refLng: number | null,
  role: 'driver' | 'rider',
  maxDistanceMiles: number = DEFAULT_MAX_DISTANCE_MILES,
): Promise<MatchResult[]> {
  const locationFilter =
    refLat !== null && refLng !== null
      ? { latitude: refLat, longitude: refLng, radiusMiles: maxDistanceMiles }
      : undefined;

  // Try geohash-filtered query first; fall back to unfiltered if it returns nothing
  // (e.g. users created before geohash was stored won't appear in the geohash query).
  let candidates = role === 'driver'
    ? await getAllDrivers(locationFilter ? { location: locationFilter } : undefined)
    : await getAllRiders(locationFilter ? { location: locationFilter } : undefined);

  const currentSchedule: TimeSlot[] = Array.isArray(currentUser.schedule)
    ? currentUser.schedule
    : [];

  const results: MatchResult[] = [];

  for (const candidate of candidates) {
    if (candidate.uid === currentUser.uid) continue;

    let distanceMiles = 0;
    if (refLat !== null && refLng !== null && candidate.lat !== undefined && candidate.lng !== undefined) {
      const distKm = distanceBetween(
        [refLat, refLng],
        [candidate.lat, candidate.lng],
      );
      distanceMiles = distKm / MILES_TO_KM;

      // Only apply the distance cutoff when we have real coordinates for the candidate
      if (distanceMiles > maxDistanceMiles) continue;
    }

    const score = computeMatchScore(
      currentSchedule,
      candidate,
      distanceMiles,
      maxDistanceMiles,
    );

    const candidateSchedule: TimeSlot[] = Array.isArray((candidate as any).schedule)
      ? (candidate as any).schedule
      : [];
    const overlapFraction = computeScheduleOverlap(currentSchedule, candidateSchedule);

    results.push({
      user: candidate,
      score,
      distanceMiles,
      scheduleOverlapPercent: Math.round(overlapFraction * 100),
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
