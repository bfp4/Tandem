import { db } from '@/config/firebase';
import type { HistoryBlock } from '@/types/historyBlock';
import type { RideConfirmation } from '@/types/rideConfirmation';
import type { RideRequest } from '@/types/rideRequest';
import { FirebaseError } from 'firebase/app';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { createNotification } from './notificationService';

export interface RideConfirmationWithId extends RideConfirmation {
  id: string;
}

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** Confirmed ride lifecycle statuses shown on Home / Rides tabs (not historical `completed`). */
export const ACTIVE_RIDE_CONFIRMATION_STATUSES = [
  'waiting',
  'both_ready',
  'in_progress',
] as const satisfies readonly RideConfirmation['status'][];

const PER_ROLE_FETCH_LIMIT = 120;

function logRideConfirmations(
  message: string,
  payload?: Record<string, unknown>,
): void {
  if (!__DEV__) return;
  if (payload !== undefined) {
    console.log('[RideConfirmations]', message, payload);
  } else {
    console.log('[RideConfirmations]', message);
  }
}

function firestoreErrDetail(err: unknown): { code?: string; message: string } {
  if (err instanceof FirebaseError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof Error) {
    return { message: err.message };
  }
  return { message: String(err) };
}

/** True when confirmation should appear in active/upcoming ride lists */
export function isActiveConfirmationStatus(status: RideConfirmation['status']): boolean {
  return ACTIVE_RIDE_CONFIRMATION_STATUSES.some((s) => s === status);
}

/** Merge driver + rider query rows, dedupe by doc id */
function mergeDriverAndRiderDocs(
  driverDocs: RideConfirmationWithId[],
  riderDocs: RideConfirmationWithId[],
): RideConfirmationWithId[] {
  const map = new Map<string, RideConfirmationWithId>();
  for (const c of [...driverDocs, ...riderDocs]) {
    map.set(c.id, c);
  }
  return [...map.values()];
}

/**
 * Queries `rideConfirmations` by driverId and riderId only (no `status` filter).
 * Compound `status IN` indexes are easy to omit in deployment; equality on one field uses the default single-field index.
 */
function confirmationsForDriverQuery(userId: string) {
  return query(
    collection(db, 'rideConfirmations'),
    where('driverId', '==', userId),
    limit(PER_ROLE_FETCH_LIMIT),
  );
}

function confirmationsForRiderQuery(userId: string) {
  return query(
    collection(db, 'rideConfirmations'),
    where('riderId', '==', userId),
    limit(PER_ROLE_FETCH_LIMIT),
  );
}

function filterSubscriptionsRows(
  merged: RideConfirmationWithId[],
): RideConfirmationWithId[] {
  return merged.filter((c) => isActiveConfirmationStatus(c.status));
}

/**
 * Returns the next date matching one of `repeatDays` strictly after `afterDate`.
 * `repeatDays` entries are three-letter uppercase abbreviations e.g. "MON", "WED".
 */
function getNextOccurrence(repeatDays: string[], afterDate: string): string {
  const base = new Date(afterDate + 'T00:00:00');
  for (let offset = 1; offset <= 7; offset++) {
    const d = new Date(base);
    d.setDate(base.getDate() + offset);
    if (repeatDays.includes(DAY_NAMES[d.getDay()])) {
      return d.toISOString().slice(0, 10);
    }
  }
  throw new Error('No matching repeat day found within 7 days');
}

export async function markReady(
  confirmationId: string,
  role: 'driver' | 'rider',
): Promise<void> {
  let notifyUserId: string | null = null;
  let notifyRideRequestId: string | null = null;

  await runTransaction(db, async (tx) => {
    const confirmRef = doc(db, 'rideConfirmations', confirmationId);
    const confirmSnap = await tx.get(confirmRef);
    if (!confirmSnap.exists()) {
      throw new Error(`RideConfirmation not found: ${confirmationId}`);
    }
    const confirmation = confirmSnap.data() as RideConfirmation;

    const update: Record<string, unknown> = {};
    if (role === 'driver') update.driverReady = true;
    if (role === 'rider') update.riderReady = true;

    const driverReady = role === 'driver' ? true : confirmation.driverReady;
    const riderReady = role === 'rider' ? true : confirmation.riderReady;

    if (driverReady && riderReady) {
      update.bothConfirmedAt = serverTimestamp();
      update.status = 'both_ready';
    } else {
      // Capture who to notify — the write happens after the transaction
      notifyUserId = role === 'driver' ? confirmation.riderId : confirmation.driverId;
      notifyRideRequestId = confirmation.rideRequestId;
    }

    tx.update(confirmRef, update);
  });

  // Fire notification after the transaction has committed
  if (notifyUserId && notifyRideRequestId) {
    await createNotification(
      notifyUserId,
      'other_side_ready',
      notifyRideRequestId,
      `Your ${role} is ready — tap to confirm your pickup.`,
    );
  }
}

export async function confirmPickup(confirmationId: string): Promise<void> {
  const confirmRef = doc(db, 'rideConfirmations', confirmationId);
  const confirmSnap = await getDoc(confirmRef);
  if (!confirmSnap.exists()) {
    throw new Error(`RideConfirmation not found: ${confirmationId}`);
  }
  const confirmation = confirmSnap.data() as RideConfirmation;

  if (confirmation.status !== 'both_ready') {
    throw new Error(
      `Cannot confirm pickup: status is "${confirmation.status}", expected "both_ready".`,
    );
  }

  await updateDoc(confirmRef, {
    pickupConfirmed: true,
    pickupConfirmedAt: serverTimestamp(),
    status: 'in_progress',
  });
}

export async function completeRide(confirmationId: string): Promise<void> {
  const confirmRef = doc(db, 'rideConfirmations', confirmationId);
  const confirmSnap = await getDoc(confirmRef);
  if (!confirmSnap.exists()) {
    throw new Error(`RideConfirmation not found: ${confirmationId}`);
  }
  const confirmation = confirmSnap.data() as RideConfirmation;

  if (confirmation.status !== 'in_progress') {
    throw new Error(
      `Cannot complete ride: status is "${confirmation.status}", expected "in_progress".`,
    );
  }

  const requestSnap = await getDoc(
    doc(db, 'rideRequests', confirmation.rideRequestId),
  );
  if (!requestSnap.exists()) {
    throw new Error(`RideRequest not found: ${confirmation.rideRequestId}`);
  }
  const rideRequest = requestSnap.data() as RideRequest;

  const amountPaid = rideRequest.pricingSnapshot?.totalPrice ?? 0;
  const today = confirmation.nextRideDate;

  // Write HistoryBlocks for both parties
  const driverHistoryBlock: Omit<HistoryBlock, 'createdAt'> & { createdAt: unknown } = {
    rideRequestId: confirmation.rideRequestId,
    otherUserId: confirmation.riderId,
    role: 'driver',
    date: today,
    pickupLocation: rideRequest.pickupLocation,
    dropoffLocation: rideRequest.dropoffLocation,
    pickupTime: rideRequest.requestedStart,
    amountPaid,
    createdAt: serverTimestamp(),
  };
  const riderHistoryBlock: Omit<HistoryBlock, 'createdAt'> & { createdAt: unknown } = {
    rideRequestId: confirmation.rideRequestId,
    otherUserId: confirmation.driverId,
    role: 'rider',
    date: today,
    pickupLocation: rideRequest.pickupLocation,
    dropoffLocation: rideRequest.dropoffLocation,
    pickupTime: rideRequest.requestedStart,
    amountPaid,
    createdAt: serverTimestamp(),
  };

  await Promise.all([
    addDoc(
      collection(db, 'users', confirmation.driverId, 'historyBlocks'),
      driverHistoryBlock,
    ),
    addDoc(
      collection(db, 'users', confirmation.riderId, 'historyBlocks'),
      riderHistoryBlock,
    ),
    createNotification(
      confirmation.driverId,
      'rate_your_ride',
      confirmation.rideRequestId,
      'Your ride is complete — rate your rider.',
    ),
    createNotification(
      confirmation.riderId,
      'rate_your_ride',
      confirmation.rideRequestId,
      'Your ride is complete — rate your driver.',
    ),
  ]);

  if (!rideRequest.repeating) {
    await updateDoc(confirmRef, { status: 'completed' });
  } else {
    // Reset the confirmation document in place for the next occurrence
    const nextRideDate = getNextOccurrence(
      rideRequest.repeatDays ?? [],
      confirmation.nextRideDate,
    );
    await updateDoc(confirmRef, {
      riderReady: false,
      driverReady: false,
      bothConfirmedAt: null,
      pickupConfirmed: false,
      pickupConfirmedAt: null,
      active: false,
      reminderSent: false,
      status: 'waiting',
      nextRideDate,
    });
  }
}

export async function getConfirmationById(
  confirmationId: string,
): Promise<RideConfirmationWithId | null> {
  const snap = await getDoc(doc(db, 'rideConfirmations', confirmationId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as RideConfirmation) };
}

/**
 * One-time fetch: same logic as subscription merge + lifecycle filter (for backup refresh).
 */
export async function fetchUserConfirmationsOnce(
  userId: string,
): Promise<RideConfirmationWithId[]> {
  logRideConfirmations('fetchUserConfirmationsOnce start', {
    uid: userId,
    collection: 'rideConfirmations',
    queries: ['driverId == uid', 'riderId == uid'],
    lifecycleFilter: [...ACTIVE_RIDE_CONFIRMATION_STATUSES],
  });

  try {
    const driverQ = confirmationsForDriverQuery(userId);
    const riderQ = confirmationsForRiderQuery(userId);
    const [driverSnap, riderSnap] = await Promise.all([
      getDocs(driverQ),
      getDocs(riderQ),
    ]);

    logRideConfirmations('fetchUserConfirmationsOnce snapshots', {
      driverDocCount: driverSnap.size,
      riderDocCount: riderSnap.size,
      driverFromCache: driverSnap.metadata.fromCache,
      riderFromCache: riderSnap.metadata.fromCache,
    });

    const driverResults = driverSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as RideConfirmation),
    }));
    const riderResults = riderSnap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as RideConfirmation),
    }));
    const merged = mergeDriverAndRiderDocs(driverResults, riderResults);
    const uniqueStatuses = [...new Set(merged.map((m) => m.status))];

    logRideConfirmations('fetchUserConfirmationsOnce merged', {
      mergedCount: merged.length,
      statusesPresent: uniqueStatuses,
      lifecycleMatchCount: filterSubscriptionsRows(merged).length,
    });

    return filterSubscriptionsRows(merged);
  } catch (e) {
    const detail = firestoreErrDetail(e);
    logRideConfirmations('fetchUserConfirmationsOnce error', detail);
    throw e instanceof Error ? e : new Error(detail.message);
  }
}

/**
 * Real-time listener for ride confirmations involving a user (driver or rider).
 *
 * Queries only `driverId` / `riderId` (plus limit) — no compound `status` filter — so Firebase’s
 * default single-field indexes suffice. Rows are filtered to waiting / both_ready / in_progress client-side.
 */
export function subscribeToUserConfirmations(
  userId: string,
  onUpdate: (confirmations: RideConfirmationWithId[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  let driverResults: RideConfirmationWithId[] = [];
  let riderResults: RideConfirmationWithId[] = [];

  function merge(): void {
    const mergedRaw = mergeDriverAndRiderDocs(driverResults, riderResults);
    const activeOnly = filterSubscriptionsRows(mergedRaw);
    const uniqueStatuses = [...new Set(mergedRaw.map((m) => m.status))];

    logRideConfirmations('subscribe snapshot merge', {
      uid: userId,
      rawDriverDocs: driverResults.length,
      rawRiderDocs: riderResults.length,
      mergedBeforeFilter: mergedRaw.length,
      afterLifecycleFilter: activeOnly.length,
      mergedStatusesSample: uniqueStatuses.slice(0, 12),
    });

    onUpdate(activeOnly);
  }

  logRideConfirmations('subscribe attach', {
    uid: userId,
    collection: 'rideConfirmations',
    driverQueryFields: ['driverId', '__name__'],
    riderQueryFields: ['riderId', '__name__'],
    perQueryLimit: PER_ROLE_FETCH_LIMIT,
    lifecycleStatuses: [...ACTIVE_RIDE_CONFIRMATION_STATUSES],
  });

  const driverQuery = confirmationsForDriverQuery(userId);
  const riderQuery = confirmationsForRiderQuery(userId);

  function reportListenerError(side: 'driver' | 'rider', raw: unknown): void {
    const detail = firestoreErrDetail(raw);
    console.error('[RideConfirmations] subscribe listener error', side, detail);
    onError?.(raw instanceof Error ? raw : new Error(detail.message));
  }

  const unsubDriver = onSnapshot(
    driverQuery,
    (snap) => {
      driverResults = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as RideConfirmation),
      }));
      logRideConfirmations('subscribe driver snapshot', {
        uid: userId,
        size: snap.size,
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      });
      merge();
    },
    (error) => {
      reportListenerError('driver', error);
      logRideConfirmations('subscribe driver FAILED — fallback fetch recommended', firestoreErrDetail(error));
      // Preserve last driver snapshot after error (offline / rules / index transient failure).
      merge();
    },
  );

  const unsubRider = onSnapshot(
    riderQuery,
    (snap) => {
      riderResults = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as RideConfirmation),
      }));
      logRideConfirmations('subscribe rider snapshot', {
        uid: userId,
        size: snap.size,
        fromCache: snap.metadata.fromCache,
        hasPendingWrites: snap.metadata.hasPendingWrites,
      });
      merge();
    },
    (error) => {
      reportListenerError('rider', error);
      logRideConfirmations('subscribe rider FAILED — fallback fetch recommended', firestoreErrDetail(error));
      merge();
    },
  );

  return () => {
    unsubDriver();
    unsubRider();
  };
}
export async function cancelReady(
  confirmationId: string,
  role: 'driver' | 'rider',
): Promise<void> {
  const field = role === 'driver' ? 'driverReady' : 'riderReady';
  await updateDoc(doc(db, 'rideConfirmations', confirmationId), {
    [field]: false,
    status: 'waiting',
  });
}