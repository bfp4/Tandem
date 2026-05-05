import { db } from '@/config/firebase';
import type { RideRequest } from '@/types/rideRequest';
import type { RiderRide } from '@/types/riderRide';
import type { ScheduleBlock } from '@/types/scheduleBlock';
import type { User } from '@/types/user';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { distanceBetween } from 'geofire-common';
import { getUser } from './userService';

// ─── Constants ────────────────────────────────────────────────────────────────

const MILES_TO_KM = 1.60934;
const DEFAULT_MAX_DISTANCE_MILES = 25;

const DAY_NUM: Record<number, string> = {
  0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat',
};

// ─── Time helpers ─────────────────────────────────────────────────────────────

/** "HH:MM" → minutes since midnight */
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** minutes since midnight → "HH:MM" */
function minToHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Case-insensitive prefix comparison for day names ("Mon" == "Monday" == "MON") */
function daysMatch(a: string, b: string): boolean {
  return a.toLowerCase().slice(0, 3) === b.toLowerCase().slice(0, 3);
}

/** Check whether a repeatDays array contains a given day */
function listHasDay(list: string[] | null | undefined, day: string): boolean {
  return (list ?? []).some(d => daysMatch(d, day));
}

/**
 * Resolves the effective weekdays for a schedule item.
 * - Repeating items use their repeatDays list.
 * - One-off items derive the weekday from their date string.
 */
function effectiveDays(
  repeating: boolean,
  repeatDays: string[] | null | undefined,
  date: string | null | undefined,
): string[] {
  if (repeating && repeatDays && repeatDays.length > 0) return repeatDays;
  if (date) return [DAY_NUM[new Date(date + 'T00:00:00').getDay()]];
  return [];
}

// ─── Schedule matching helpers ────────────────────────────────────────────────

/**
 * Returns true if a driver availability block fully contains the ride window
 * [rideStartMin, rideEndMin] on the given day.
 *
 * "Fully contains" means:
 *   block.startTime <= rideStart  AND  rideEnd <= block.endTime
 *
 * Edge-case guarded: a ride at 1:45 PM that takes 20 min ends at 2:05 PM and
 * will NOT match a block ending at 2:00 PM.
 */
function blockCoversRide(
  block: ScheduleBlock,
  day: string,
  rideStartMin: number,
  rideEndMin: number,
): boolean {
  if (!effectiveDays(block.repeating, block.repeatDays, block.date).some(d => daysMatch(d, day))) {
    return false;
  }
  const blockStart = toMin(block.startTime);
  const blockEnd = toMin(block.endTime);
  return rideStartMin >= blockStart && rideEndMin <= blockEnd;
}

/**
 * Returns true if a confirmed ride request overlaps the proposed ride window
 * [rideStartMin, rideEndMin) on the given day.
 *
 * Two intervals [a, b) and [c, d) overlap iff a < d AND c < b.
 * This correctly handles back-to-back rides (e.g. one ends at 2:00, next starts
 * at 2:00 — they do NOT conflict).
 */
function requestConflicts(
  req: RideRequest,
  day: string,
  rideStartMin: number,
  rideEndMin: number,
): boolean {
  if (!effectiveDays(req.repeating, req.repeatDays, req.date).some(d => daysMatch(d, day))) {
    return false;
  }
  const reqStart = toMin(req.requestedStart);
  const reqEnd = toMin(req.requestedEnd);
  return rideStartMin < reqEnd && reqStart < rideEndMin;
}

// ─── Public types ─────────────────────────────────────────────────────────────

export interface RideMatchInfo {
  /** Short day name, e.g. "Mon" */
  day: string;
  /** "HH:MM" 24-h */
  departureTime: string;
  /** "HH:MM" 24-h — departure + estimatedDurationMinutes */
  arrivalTime: string;
  estimatedDurationMinutes: number | null;
  pickupAddress: string;
  dropoffAddress: string;
  /** Firestore doc ID of the source riderRide — needed to create a rideRequest */
  riderRideId: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
}

export interface MatchResult {
  user: User;
  /** 0–1 composite score */
  score: number;
  distanceMiles: number;
  /**
   * The specific rides that make this a match.
   * Each entry is one riderRide on one day where the driver is available and unbooked.
   */
  matchingRides: RideMatchInfo[];
}

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Returns ranked match candidates for the current user based on their
 * activeRole:
 *
 *   rider  → finds drivers whose availability covers at least one of the
 *             rider's scheduled rides and who are not already booked.
 *
 *   driver → finds riders who have at least one scheduled ride that fits
 *             fully inside one of the driver's open availability windows
 *             and does not conflict with the driver's confirmed bookings.
 */
export async function getMatchedUsers(
  currentUser: User,
  refLat: number | null,
  refLng: number | null,
  maxDistanceMiles: number = DEFAULT_MAX_DISTANCE_MILES,
): Promise<MatchResult[]> {
  if (currentUser.activeRole === 'rider') {
    return findDriversForRider(currentUser, refLat, refLng, maxDistanceMiles);
  }
  return findRidersForDriver(currentUser, refLat, refLng, maxDistanceMiles);
}

// ─── Rider → find drivers ─────────────────────────────────────────────────────

async function findDriversForRider(
  rider: User,
  refLat: number | null,
  refLng: number | null,
  maxDistanceMiles: number,
): Promise<MatchResult[]> {
  // 1. Fetch the rider's active scheduled rides (single-field query, no composite index).
  const riderRidesSnap = await getDocs(
    query(collection(db, 'riderRides'), where('userId', '==', rider.uid)),
  );
  const riderRides = riderRidesSnap.docs
    .map(d => ({ ...(d.data() as RiderRide), id: d.id }))
    .filter(r => r.status === 'active' && r.repeatDays.length > 0);
  // Note: we continue even if riderRides is empty — the rider should still see
  // available drivers so they know who to request once they add rides.

  // 2. Fetch all open driver schedule blocks (single-field query, no composite index).
  const blocksSnap = await getDocs(
    query(collection(db, 'scheduleBlocks'), where('role', '==', 'driver')),
  );
  const allBlocks = blocksSnap.docs
    .map(d => d.data() as ScheduleBlock)
    .filter(b => b.status === 'open');

  if (allBlocks.length === 0) return [];

  // 3. Fetch confirmed ride requests to check which driver windows are already booked.
  const confirmedSnap = await getDocs(
    query(collection(db, 'rideRequests'), where('status', '==', 'confirmed')),
  );
  const confirmedRides = confirmedSnap.docs.map(d => d.data() as RideRequest);

  // 4. Group blocks and confirmations by driver (exclude the current user).
  const blocksByDriver = new Map<string, ScheduleBlock[]>();
  for (const block of allBlocks) {
    if (block.userId === rider.uid) continue;
    const list = blocksByDriver.get(block.userId) ?? [];
    list.push(block);
    blocksByDriver.set(block.userId, list);
  }

  const confirmedByDriver = new Map<string, RideRequest[]>();
  for (const req of confirmedRides) {
    const list = confirmedByDriver.get(req.driverId) ?? [];
    list.push(req);
    confirmedByDriver.set(req.driverId, list);
  }

  // 5. Every driver with at least one open block is a candidate.
  //    Compatible rides (may be empty) determine the sort score.
  const candidates: { driverId: string; matchingRides: RideMatchInfo[] }[] = [];

  for (const [driverId, blocks] of blocksByDriver) {
    const bookedRides = confirmedByDriver.get(driverId) ?? [];
    const matchingRides = computeMatchingRides(riderRides, blocks, bookedRides);
    candidates.push({ driverId, matchingRides });
  }

  // 6. Fetch driver profiles and build results (drivers with more compatible rides rank higher).
  const results = await buildResults(candidates, 'driverId', refLat, refLng, maxDistanceMiles, rider.uid);
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ─── Driver → find riders ─────────────────────────────────────────────────────

async function findRidersForDriver(
  driver: User,
  refLat: number | null,
  refLng: number | null,
  maxDistanceMiles: number,
): Promise<MatchResult[]> {
  // 1. Fetch the driver's own availability blocks.
  //    Single-field filter (userId only) — no composite index needed.
  const blocksSnap = await getDocs(
    query(collection(db, 'scheduleBlocks'), where('userId', '==', driver.uid)),
  );
  const driverBlocks = blocksSnap.docs
    .map(d => d.data() as ScheduleBlock)
    .filter(b => b.role === 'driver' && b.status === 'open');
  if (driverBlocks.length === 0) return [];

  // 2. Fetch the driver's confirmed rides.
  //    Single-field filter (driverId only) — no composite index needed.
  const confirmedSnap = await getDocs(
    query(collection(db, 'rideRequests'), where('driverId', '==', driver.uid)),
  );
  const driverConfirmed = confirmedSnap.docs
    .map(d => d.data() as RideRequest)
    .filter(r => r.status === 'confirmed');

  // 3. Fetch all active rider rides.
  //    Single-field filter (status only) — uses Firestore's automatic index.
  const riderRidesSnap = await getDocs(
    query(collection(db, 'riderRides'), where('status', '==', 'active')),
  );
  const allRiderRides = riderRidesSnap.docs
    .map(d => ({ ...(d.data() as RiderRide), id: d.id }))
    .filter(r => r.userId !== driver.uid && r.repeatDays.length > 0);
  // Rides with null estimatedDurationMinutes are kept — treated as 0-minute duration.

  // 4. Group by rider userId
  const ridesByRider = new Map<string, (RiderRide & { id: string })[]>();
  for (const ride of allRiderRides) {
    const list = ridesByRider.get(ride.userId) ?? [];
    list.push(ride);
    ridesByRider.set(ride.userId, list);
  }

  // 5. Every rider with at least one active ride is a candidate.
  //    Compatible rides (may be empty) determine the sort score.
  const candidates: { riderId: string; matchingRides: RideMatchInfo[] }[] = [];

  for (const [riderId, rides] of ridesByRider) {
    const matchingRides = computeMatchingRides(rides, driverBlocks, driverConfirmed);
    candidates.push({ riderId, matchingRides });
  }

  // 6. Fetch rider profiles in parallel and build results
  const mappedCandidates = candidates.map(c => ({ driverId: c.riderId, matchingRides: c.matchingRides }));
  const results = await buildResults(mappedCandidates, 'riderId', refLat, refLng, maxDistanceMiles, driver.uid);
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ─── Core matching logic ──────────────────────────────────────────────────────

/**
 * For each riderRide × each repeatDay, checks whether at least one driver block
 * fully contains the ride time AND no confirmed ride conflicts with it.
 *
 * Returns one RideMatchInfo per (ride, day) pair that passes — de-duplicated so
 * each ride is counted once per unique (day, departureTime, pickup, dropoff).
 */
function computeMatchingRides(
  riderRides: (RiderRide & { id: string })[],
  driverBlocks: ScheduleBlock[],
  driverConfirmedRides: RideRequest[],
): RideMatchInfo[] {
  const seen = new Set<string>();
  const matches: RideMatchInfo[] = [];

  for (const ride of riderRides) {
    const startMin = toMin(ride.departureTime);
    const endMin = startMin + (ride.estimatedDurationMinutes ?? 0);

    for (const day of ride.repeatDays) {
      const key = `${ride.id}|${day}`;
      if (seen.has(key)) continue;

      // Must have a block that fully contains [startMin, endMin]
      const covered = driverBlocks.some(b => blockCoversRide(b, day, startMin, endMin));
      if (!covered) continue;

      // Must not conflict with any confirmed driver booking on that day
      const conflicts = driverConfirmedRides.some(r => requestConflicts(r, day, startMin, endMin));
      if (conflicts) continue;

      seen.add(key);
      matches.push({
        day,
        departureTime: ride.departureTime,
        arrivalTime: minToHHMM(endMin),
        estimatedDurationMinutes: ride.estimatedDurationMinutes,
        pickupAddress: ride.pickupAddress,
        dropoffAddress: ride.dropoffAddress,
        riderRideId: ride.id,
        pickupLat: ride.pickupLat,
        pickupLng: ride.pickupLng,
        dropoffLat: ride.dropoffLat,
        dropoffLng: ride.dropoffLng,
      });
    }
  }

  return matches;
}

// ─── Result builder ───────────────────────────────────────────────────────────

async function buildResults(
  candidates: { driverId: string; matchingRides: RideMatchInfo[] }[],
  _role: string,
  refLat: number | null,
  refLng: number | null,
  maxDistanceMiles: number,
  excludeUid: string,
): Promise<MatchResult[]> {
  const settled = await Promise.all(
    candidates.map(async ({ driverId, matchingRides }) => {
      if (driverId === excludeUid) return null;
      let profileUser: User;
      try {
        profileUser = await getUser(driverId);
      } catch {
        return null;
      }

      let distanceMiles = 0;
      if (
        refLat !== null && refLng !== null &&
        profileUser.lat !== undefined && profileUser.lng !== undefined
      ) {
        const distKm = distanceBetween(
          [refLat, refLng],
          [profileUser.lat, profileUser.lng],
        );
        distanceMiles = distKm / MILES_TO_KM;
        if (distanceMiles > maxDistanceMiles) return null;
      }

      const score = computeScore(profileUser, matchingRides.length, distanceMiles, maxDistanceMiles);
      return { user: profileUser, score, distanceMiles, matchingRides } satisfies MatchResult;
    }),
  );

  return settled.filter((r): r is MatchResult => r !== null);
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/**
 * Composite match score (0–1):
 *   30% — star rating
 *   40% — number of matching rides (capped at 5 for normalization)
 *   30% — proximity (inverse distance)
 */
function computeScore(
  user: User,
  matchingRidesCount: number,
  distanceMiles: number,
  maxDistanceMiles: number,
): number {
  const ratingScore = (user.starRating / 5.0) * 0.3;
  const ridesScore = (Math.min(matchingRidesCount, 5) / 5) * 0.4;
  const distanceScore = (1 - Math.min(distanceMiles, maxDistanceMiles) / maxDistanceMiles) * 0.3;
  return ratingScore + ridesScore + distanceScore;
}
