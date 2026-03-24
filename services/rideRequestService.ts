import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { RideRequest } from '@/types/rideRequest';
import type { ScheduleBlock } from '@/types/scheduleBlock';
import type { RideConfirmation } from '@/types/rideConfirmation';
import type { User } from '@/types/user';
import { splitBlock } from './scheduleBlockService';
import { createNotification } from './notificationService';

type CreateRideRequestData = Omit<
  RideRequest,
  'requestedAt' | 'respondedAt' | 'pricingSnapshot' | 'status'
>;

/** Returns "YYYY-MM-DD" of the first repeatDay on or after the given date. */
function firstOccurrence(repeatDays: string[], fromDate: string): string {
  const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const base = new Date(fromDate + 'T00:00:00');
  for (let offset = 0; offset < 7; offset++) {
    const d = new Date(base);
    d.setDate(base.getDate() + offset);
    if (repeatDays.includes(DAY_NAMES[d.getDay()])) {
      return d.toISOString().slice(0, 10);
    }
  }
  // Should never reach here if repeatDays is non-empty
  throw new Error('No matching repeat day found within 7 days');
}

export async function createRideRequest(
  data: CreateRideRequestData,
): Promise<string> {
  // Validate the requested window fits inside the schedule block
  const blockSnap = await getDoc(
    doc(db, 'scheduleBlocks', data.scheduleBlockId),
  );
  if (!blockSnap.exists()) {
    throw new Error(`ScheduleBlock not found: ${data.scheduleBlockId}`);
  }
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

  const ref = await addDoc(collection(db, 'rideRequests'), {
    ...data,
    status: 'pending',
    pricingSnapshot: null,
    requestedAt: serverTimestamp(),
    respondedAt: null,
  });
  return ref.id;
}

export async function confirmRideRequest(requestId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const requestRef = doc(db, 'rideRequests', requestId);
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists()) throw new Error(`RideRequest not found: ${requestId}`);
    const rideRequest = requestSnap.data() as RideRequest;

    // 1. Confirm the ride request
    tx.update(requestRef, {
      status: 'confirmed',
      respondedAt: serverTimestamp(),
    });

    // 2 & 3. Split the schedule block (marks original 'booked', creates remainder)
    await splitBlock(tx, rideRequest.scheduleBlockId, rideRequest.requestedEnd);

    // 4. Compute nextRideDate
    let nextRideDate: string;
    if (rideRequest.repeating && rideRequest.repeatDays?.length) {
      nextRideDate = firstOccurrence(rideRequest.repeatDays, rideRequest.date);
    } else {
      nextRideDate = rideRequest.date;
    }

    // 4. Create the rideConfirmation document
    const confirmationRef = doc(collection(db, 'rideConfirmations'));
    const confirmation: Omit<RideConfirmation, 'createdAt'> & { createdAt: unknown } = {
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
    };
    tx.set(confirmationRef, confirmation);
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

  // Reset the schedule block back to open
  await updateDoc(doc(db, 'scheduleBlocks', rideRequest.scheduleBlockId), {
    status: 'open',
  });
}

export async function cancelRideRequest(requestId: string): Promise<void> {
  await runTransaction(db, async (tx) => {
    const requestRef = doc(db, 'rideRequests', requestId);
    const requestSnap = await tx.get(requestRef);
    if (!requestSnap.exists()) throw new Error(`RideRequest not found: ${requestId}`);
    const rideRequest = requestSnap.data() as RideRequest;

    // 1. Cancel the ride request
    tx.update(requestRef, { status: 'cancelled' });

    // 2. Reset schedule block to open if it was booked
    const blockRef = doc(db, 'scheduleBlocks', rideRequest.scheduleBlockId);
    const blockSnap = await tx.get(blockRef);
    if (blockSnap.exists() && blockSnap.data()?.status === 'booked') {
      tx.update(blockRef, { status: 'open' });
    }

    // 3. Delete the rideConfirmation if one exists
    const confirmationsSnap = await getDocs(
      query(
        collection(db, 'rideConfirmations'),
        where('rideRequestId', '==', requestId),
      ),
    );
    for (const confirmDoc of confirmationsSnap.docs) {
      const confirmation = confirmDoc.data() as RideConfirmation;

      // Notify the other party before deleting if the window is already active
      if (confirmation.active) {
        const cancelledBy = rideRequest.riderId; // caller context unknown here; notify other party
        const otherUserId =
          cancelledBy === rideRequest.riderId
            ? rideRequest.driverId
            : rideRequest.riderId;
        // Notification is written outside the transaction to avoid mixing getDocs + writes
        // The deletion happens in the transaction; notification is best-effort after.
        await createNotification(
          otherUserId,
          'ride_cancelled',
          requestId,
          'Your ride has been cancelled.',
        );
      }

      tx.delete(confirmDoc.ref);
    }
  });
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
