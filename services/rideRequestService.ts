import { db } from '@/config/firebase';
import type { RideRequest } from '@/types/rideRequest';
import type { ScheduleBlock } from '@/types/scheduleBlock';
import type { User } from '@/types/user';
import { calculateDriveTime } from '@/utils/driveTime';
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    query,
    runTransaction,
    serverTimestamp,
    updateDoc,
    where,
} from 'firebase/firestore';
import { createNotification } from './notificationService';

export interface RideRequestWithId extends RideRequest {
  id: string;
}

type CreateRideRequestData = Omit<
  RideRequest,
  'requestedAt' | 'respondedAt' | 'pricingSnapshot' | 'status' | 'estimatedDriveTimeMinutes'
>;

/** Returns "YYYY-MM-DD" of the first repeatDay on or after the given date. */
function firstOccurrence(repeatDays: string[], fromDate: string): string {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const base = new Date(fromDate + 'T00:00:00');
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(base);
    d.setDate(base.getDate() + offset);
    const dayName = DAY_NAMES[d.getDay()];
    // Case-insensitive comparison to handle different formats
    if (repeatDays.some(day => day.toLowerCase().startsWith(dayName.toLowerCase().slice(0, 3)))) {
      return d.toISOString().slice(0, 10);
    }
  }
  // Should never reach here if repeatDays is non-empty
  throw new Error('No matching repeat day found within 7 days');
}

export async function getRideRequestById(
  requestId: string,
): Promise<RideRequestWithId | null> {
  const snap = await getDoc(doc(db, 'rideRequests', requestId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as RideRequest) };
}

export async function createRideRequest(
  data: CreateRideRequestData,
): Promise<string> {
  // If a real scheduleBlock document exists, validate the time window against it.
  // Otherwise (when using the users.schedule approach), skip block validation —
  // the UI already ensures the requested slot is within both users' availability.
  if (data.scheduleBlockId) {
    const blockSnap = await getDoc(
      doc(db, 'scheduleBlocks', data.scheduleBlockId),
    );
    if (blockSnap.exists()) {
      const block = blockSnap.data() as ScheduleBlock;
      if (data.requestedStart < block.startTime) {
        throw new Error(
          `requestedStart (${data.requestedStart}) is before block startTime (${block.startTime})`,
        );
      }
      if (data.requestedEnd > block.endTime) {
        throw new Error(
          `requestedEnd (${data.requestedEnd}) is after block endTime (${block.endTime})`,
        );
      }
    }
  }

  // Calculate estimated drive time from pickup to dropoff
  let estimatedDriveTimeMinutes: number | null = null;
  try {
    const pickup = {
      latitude: data.pickupLocation.latitude,
      longitude: data.pickupLocation.longitude,
    };
    const dropoff = {
      latitude: data.dropoffLocation.latitude,
      longitude: data.dropoffLocation.longitude,
    };
    estimatedDriveTimeMinutes = await calculateDriveTime(pickup, dropoff);
  } catch (error) {
    console.warn('Failed to calculate drive time during ride request creation:', error);
  }

  const ref = await addDoc(collection(db, 'rideRequests'), {
    ...data,
    status: 'pending',
    pricingSnapshot: null,
    estimatedDriveTimeMinutes,
    requestedAt: serverTimestamp(),
    respondedAt: null,
  });
  return ref.id;
}

export async function confirmRideRequest(requestId: string): Promise<void> {
  const requestRef = doc(db, 'rideRequests', requestId);
  const requestSnap = await getDoc(requestRef);
  if (!requestSnap.exists()) throw new Error(`RideRequest not found: ${requestId}`);
  const rideRequest = requestSnap.data() as RideRequest;

  // 1. Confirm the ride request
  await updateDoc(requestRef, {
    status: 'confirmed',
    respondedAt: serverTimestamp(),
  });

  // 2. Compute nextRideDate
  let nextRideDate: string;
  if (rideRequest.repeating && rideRequest.repeatDays?.length) {
    nextRideDate = firstOccurrence(rideRequest.repeatDays, rideRequest.date);
  } else {
    nextRideDate = rideRequest.date;
  }

  // 3. Create the rideConfirmation document
  await addDoc(collection(db, 'rideConfirmations'), {
    rideRequestId: requestId,
    driverId: rideRequest.driverId,
    riderId: rideRequest.riderId,
    active: false,
    riderReady: false,
    driverReady: false,
    bothConfirmedAt: null,
    pickupConfirmed: false,
    pickupConfirmedAt: null,
    reminderSent: false,
    status: 'waiting',
    nextRideDate,
    createdAt: serverTimestamp(),
  });
}

export async function denyRideRequest(requestId: string): Promise<void> {
  const requestSnap = await getDoc(doc(db, 'rideRequests', requestId));
  if (!requestSnap.exists()) throw new Error(`RideRequest not found: ${requestId}`);
  const rideRequest = requestSnap.data() as RideRequest;

  await updateDoc(doc(db, 'rideRequests', requestId), {
    status: 'denied',
    respondedAt: serverTimestamp(),
  });

  // Reset the schedule block back to open if it exists
  const blockSnap = await getDoc(doc(db, 'scheduleBlocks', rideRequest.scheduleBlockId));
  if (blockSnap.exists()) {
    await updateDoc(doc(db, 'scheduleBlocks', rideRequest.scheduleBlockId), {
      status: 'open',
    });
  }
}

export async function cancelRideRequest(
  requestId: string,
  cancelledByUserId?: string,
): Promise<void> {
  const confirmationsSnap = await getDocs(
    query(
      collection(db, 'rideConfirmations'),
      where('rideRequestId', '==', requestId),
    ),
  );
  const confirmationRefs = confirmationsSnap.docs.map((d) => d.ref);

  await runTransaction(db, async (tx) => {
    // ── Phase 1: All reads first ──
    const requestRef = doc(db, 'rideRequests', requestId);
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists()) throw new Error(`RideRequest not found: ${requestId}`);
    const rideRequest = requestSnap.data() as RideRequest;

    // Read schedule block if it exists
    let blockSnap = null;
    let blockRef = null;
    if (rideRequest.scheduleBlockId && rideRequest.scheduleBlockId.trim() !== '') {
      blockRef = doc(db, 'scheduleBlocks', rideRequest.scheduleBlockId);
      blockSnap = await tx.get(blockRef);
    }

    // Read all confirmation documents
    const confirmationSnaps = await Promise.all(
      confirmationRefs.map(ref => tx.get(ref))
    );

    // ── Phase 2: All writes ──
    tx.update(requestRef, { status: 'cancelled' });

    // Update schedule block if needed
    if (blockRef && blockSnap && blockSnap.exists() && blockSnap.data()?.status === 'booked') {
      tx.update(blockRef, { status: 'open' });
    }

    // Delete all existing confirmations
    confirmationSnaps.forEach((snap, i) => {
      if (snap.exists()) {
        tx.delete(confirmationRefs[i]);
      }
    });
  });

  if (confirmationRefs.length > 0) {
    const requestSnap = await getDoc(doc(db, 'rideRequests', requestId));
    if (requestSnap.exists()) {
      const rideRequest = requestSnap.data() as RideRequest;
      const otherUserId =
        cancelledByUserId === rideRequest.driverId
          ? rideRequest.riderId
          : rideRequest.driverId;
      await createNotification(
        otherUserId,
        'ride_cancelled',
        requestId,
        'Your ride has been cancelled.',
      );
    }
  }
}

export async function getRideRequestsForDriver(
  driverId: string,
  status?: RideRequest['status'],
): Promise<RideRequest[]> {
  const constraints = [where('driverId', '==', driverId)];
  if (status) constraints.push(where('status', '==', status));
  const snap = await getDocs(
    query(collection(db, 'rideRequests'), ...constraints),
  );
  return snap.docs.map((d) => d.data() as RideRequest);
}

export async function getRideRequestsForRider(
  riderId: string,
  status?: RideRequest['status'],
): Promise<RideRequest[]> {
  const constraints = [where('riderId', '==', riderId)];
  if (status) constraints.push(where('status', '==', status));
  const snap = await getDocs(
    query(collection(db, 'rideRequests'), ...constraints),
  );
  return snap.docs.map((d) => d.data() as RideRequest);
}

export async function getAssociatedDriversForRider(riderId: string): Promise<User[]> {
  const snap = await getDocs(
    query(
      collection(db, 'rideRequests'),
      where('riderId', '==', riderId),
      where('status', '==', 'confirmed'),
    ),
  );
  const driverIds = [...new Set(snap.docs.map((d) => (d.data() as RideRequest).driverId))];
  const results = await Promise.all(
    driverIds.map((id) => getDoc(doc(db, 'users', id))),
  );
  return results.filter((s) => s.exists()).map((s) => s.data() as User);
}

export async function getAssociatedRidersForDriver(driverId: string): Promise<User[]> {
  const snap = await getDocs(
    query(
      collection(db, 'rideRequests'),
      where('driverId', '==', driverId),
      where('status', '==', 'confirmed'),
    ),
  );
  const riderIds = [...new Set(snap.docs.map((d) => (d.data() as RideRequest).riderId))];
  const results = await Promise.all(
    riderIds.map((id) => getDoc(doc(db, 'users', id))),
  );
  return results.filter((s) => s.exists()).map((s) => s.data() as User);
}
