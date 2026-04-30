import { db } from '@/config/firebase';
import type { HistoryBlock } from '@/types/historyBlock';
import type { User } from '@/types/user';
import {
  collection,
    collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
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

export type FavoriteTargetUser = Pick<User, 'name' | 'activeRole'> & {
  uid?: string;
  id?: string;
};

export type SavedAccountRef = {
  targetUid: string;
  name: string;
  activeRole: string | null;
  createdAt?: unknown;
};

export async function addFavorite(
  currentUid: string,
  targetUser: FavoriteTargetUser,
): Promise<void> {
  const targetUid = targetUser.uid ?? targetUser.id;
  if (!targetUid) throw new Error('Missing targetUid');

  try {
    await setDoc(
      doc(db, 'users', currentUid, 'favorites', targetUid),
      {
        targetUid,
        name: targetUser.name,
        activeRole: targetUser.activeRole ?? null,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    const anyErr = error as any;
    const code = typeof anyErr?.code === 'string' ? anyErr.code : undefined;
    const message = error instanceof Error ? error.message : 'Unknown error';
    const projectId = (db as any)?.app?.options?.projectId;

    const suffix = `${code ? ` (${code})` : ''}${projectId ? ` [projectId:${projectId}]` : ''}`;
    throw new Error(`${message}${suffix}`);
  }
}

export async function addBlockedAccount(
  currentUid: string,
  targetUser: FavoriteTargetUser,
): Promise<void> {
  const targetUid = targetUser.uid ?? targetUser.id;
  if (!targetUid) throw new Error('Missing targetUid');

  try {
    await setDoc(
      doc(db, 'users', currentUid, 'blockedAccounts', targetUid),
      {
        targetUid,
        name: targetUser.name,
        activeRole: targetUser.activeRole ?? null,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    const anyErr = error as any;
    const code = typeof anyErr?.code === 'string' ? anyErr.code : undefined;
    const message = error instanceof Error ? error.message : 'Unknown error';
    const projectId = (db as any)?.app?.options?.projectId;

    const suffix = `${code ? ` (${code})` : ''}${projectId ? ` [projectId:${projectId}]` : ''}`;
    throw new Error(`${message}${suffix}`);
  }
}

export async function getFavorites(currentUid: string): Promise<SavedAccountRef[]> {
  const snap = await getDocs(collection(db, 'users', currentUid, 'favorites'));
  const rows = snap.docs.map((d) => d.data() as Partial<SavedAccountRef>);
  return rows
    .filter((r): r is SavedAccountRef => typeof r.targetUid === 'string' && typeof r.name === 'string')
    .sort((a, b) => {
      const ta = (a.createdAt as any)?.toMillis?.() ?? 0;
      const tb = (b.createdAt as any)?.toMillis?.() ?? 0;
      return tb - ta;
    });
}

export async function removeFavorite(currentUid: string, targetUid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', currentUid, 'favorites', targetUid));
}

export async function isFavorited(currentUid: string, targetUid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', currentUid, 'favorites', targetUid));
  return snap.exists();
}

export async function getBlockedAccounts(currentUid: string): Promise<SavedAccountRef[]> {
  const snap = await getDocs(collection(db, 'users', currentUid, 'blockedAccounts'));
  const rows = snap.docs.map((d) => d.data() as Partial<SavedAccountRef>);
  return rows
    .filter((r): r is SavedAccountRef => typeof r.targetUid === 'string' && typeof r.name === 'string')
    .sort((a, b) => {
      const ta = (a.createdAt as any)?.toMillis?.() ?? 0;
      const tb = (b.createdAt as any)?.toMillis?.() ?? 0;
      return tb - ta;
    });
}

export async function getBlockedAccountIds(currentUid: string): Promise<string[]> {
  const snap = await getDocs(collection(db, 'users', currentUid, 'blockedAccounts'));
  const ids = new Set<string>();
  for (const d of snap.docs) {
    ids.add(d.id);
    const data = d.data() as any;
    if (typeof data?.targetUid === 'string') ids.add(data.targetUid);
  }
  return [...ids];
}

export async function removeBlockedAccount(currentUid: string, targetUid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', currentUid, 'blockedAccounts', targetUid));
}

export async function isBlockedAccount(currentUid: string, targetUid: string): Promise<boolean> {
  const snap = await getDoc(doc(db, 'users', currentUid, 'blockedAccounts', targetUid));
  return snap.exists();
}

export async function hasEitherUserBlocked(userAUid: string, userBUid: string): Promise<boolean> {
  const [aBlocksB, bBlocksA] = await Promise.all([
    isBlockedAccount(userAUid, userBUid),
    isBlockedAccount(userBUid, userAUid),
  ]);
  return aBlocksB || bBlocksA;
}

export async function getUsersWhoBlockedCurrentUser(currentUid: string): Promise<string[]> {
  try {
    const snap = await getDocs(
      query(collectionGroup(db, 'blockedAccounts'), where('targetUid', '==', currentUid)),
    );
    const blockers = new Set<string>();
    for (const d of snap.docs) {
      const parentUserId = d.ref.parent.parent?.id;
      if (parentUserId) blockers.add(parentUserId);
    }
    return [...blockers];
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // #region agent log
    fetch('http://127.0.0.1:7298/ingest/97313dd6-65fa-4454-bb22-201405ef2283',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'c36d6c'},body:JSON.stringify({sessionId:'c36d6c',runId:'pre-fix',hypothesisId:'H_rev_query_fail',location:'services/userService.ts:getUsersWhoBlockedCurrentUser',message:'reverse block query failed',data:{errorMessage:message.slice(0,200)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion agent log
    throw error;
  }
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
