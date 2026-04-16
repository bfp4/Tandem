import { db } from '@/config/firebase';
import type { HistoryBlock } from '@/types/historyBlock';
import type { User } from '@/types/user';
import {
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    updateDoc,
    where,
} from 'firebase/firestore';
import { distanceBetween, geohashQueryBounds } from 'geofire-common';

export interface UserFilters {
  minRating?: number;
  location?: {
    latitude: number;
    longitude: number;
    radiusMiles: number;
  };
  availableOn?: {
    date: string;
    startTime: string;
    endTime: string;
  };
}

export async function getUser(userId: string): Promise<User> {
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) throw new Error(`User not found: ${userId}`);
  return { ...snap.data(), uid: snap.id } as User;
}

export async function updateUser(
  userId: string,
  data: Partial<User>,
): Promise<void> {
  // Guard: these fields are Cloud Function–managed and must never be written from the client.
  const forbidden: (keyof User)[] = [
    'starRating',
    'rideCount',
    'profileComplete',
    'missingFields',
  ];
  for (const field of forbidden) {
    if (field in data) {
      throw new Error(`Field "${String(field)}" is read-only and cannot be written from the client.`);
    }
  }
  await updateDoc(doc(db, 'users', userId), data as Record<string, unknown>);
}

export async function updateUserPreferences(
  userId: string,
  preferences: NonNullable<User['preferences']>,
): Promise<void> {
  await updateUser(userId, { preferences });
}

export async function updateFcmToken(
  userId: string,
  token: string,
): Promise<void> {
  await updateDoc(doc(db, 'users', userId), { fcmToken: token });
}

export async function getUserHistoryBlocks(
  userId: string,
): Promise<HistoryBlock[]> {
  const snap = await getDocs(
    collection(db, 'users', userId, 'historyBlocks'),
  );
  return snap.docs.map((d) => d.data() as HistoryBlock);
}

const MILES_TO_KM = 1.60934;

/**
 * Applies minRating and availableOn in-memory after the base Firestore query.
 * location is always handled at the query level in getUsersByRole, never here.
 */
async function applyPostQueryFilters(
  users: { id: string; data: User }[],
  filters?: Pick<UserFilters, 'minRating' | 'availableOn'>,
): Promise<{ id: string; data: User }[]> {
  let results = users;

  if (filters?.minRating !== undefined) {
    results = results.filter((u) => u.data.starRating >= filters.minRating!);
  }

  if (filters?.availableOn) {
    const { date, startTime, endTime } = filters.availableOn;
    const available = await Promise.all(
      results.map(async (u) => {
        const blockSnap = await getDocs(
          query(
            collection(db, 'scheduleBlocks'),
            where('userId', '==', u.id),
            where('status', '==', 'open'),
            where('date', '==', date),
            where('startTime', '<=', startTime),
            where('endTime', '>=', endTime),
          ),
        );
        return blockSnap.empty ? null : u;
      }),
    );
    results = available.filter((u): u is { id: string; data: User } => u !== null);
  }

  return results;
}

async function getUsersByRole(
  role: 'driver' | 'rider',
  filters?: UserFilters,
): Promise<{ id: string; data: User }[]> {
  let candidates: { id: string; data: User }[];

  if (filters?.location) {
    // Geohash bounding-box query — Firestore can't do native radius queries.
    // The bounds over-approximate; distanceBetween trims results to the exact radius.
    const { latitude, longitude, radiusMiles } = filters.location;
    const radiusKm = radiusMiles * MILES_TO_KM;
    const center: [number, number] = [latitude, longitude];
    const bounds = geohashQueryBounds(center, radiusKm * 1000);

    const geoSnaps = await Promise.all(
      bounds.map(([start, end]) =>
        getDocs(
          query(
            collection(db, 'users'),
            where('roles', 'array-contains', role),
            where('geohash', '>=', start),
            where('geohash', '<=', end),
          ),
        ),
      ),
    );

    const seen = new Set<string>();
    candidates = [];
    for (const snap of geoSnaps) {
      for (const d of snap.docs) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        const user = d.data() as User & { lat?: number; lng?: number };
        // Precise distance check using stored lat/lng to trim the bounding-box over-approximation
        if (user.lat !== undefined && user.lng !== undefined) {
          const distKm = distanceBetween([user.lat, user.lng], center);
          if (distKm > radiusKm) continue;
        }
        candidates.push({ id: d.id, data: user });
      }
    }
  } else {
    const snap = await getDocs(
      query(collection(db, 'users'), where('roles', 'array-contains', role)),
    );
    candidates = snap.docs.map((d) => ({ id: d.id, data: d.data() as User }));
  }

  return applyPostQueryFilters(candidates, {
    minRating: filters?.minRating,
    availableOn: filters?.availableOn,
  });
}

export async function getAllDrivers(filters?: UserFilters): Promise<User[]> {
  const rows = await getUsersByRole('driver', filters);
  return rows.map((r) => ({ ...r.data, uid: r.id }));
}

/** Same as getAllDrivers but keeps Firestore document id (Auth uid). */
export async function getAllDriversWithIds(
  filters?: UserFilters,
): Promise<{ id: string; data: User }[]> {
  return getUsersByRole('driver', filters);
}

export async function getAllRiders(filters?: UserFilters): Promise<User[]> {
  const rows = await getUsersByRole('rider', filters);
  return rows.map((r) => ({ ...r.data, uid: r.id }));
}
