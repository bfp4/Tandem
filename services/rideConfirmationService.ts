import {
  doc,
  getDoc,
  updateDoc,
  collection,
  addDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { RideConfirmation } from '@/types/rideConfirmation';
import type { RideRequest } from '@/types/rideRequest';
import type { HistoryBlock } from '@/types/historyBlock';
import { createNotification } from './notificationService';

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

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
  await runTransaction(db, async (tx) => {
    const confirmRef = doc(db, 'rideConfirmations', confirmationId);
    const confirmSnap = await tx.get(confirmRef);
    if (!confirmSnap.exists()) {
      throw new Error(`RideConfirmation not found: ${confirmationId}`);
    }
    const confirmation = confirmSnap.data() as RideConfirmation;

    if (!confirmation.active) {
      throw new Error(
        'Cannot mark ready: the 30-minute window has not opened yet.',
      );
    }

    const update: Record<string, unknown> = {};
    if (role === 'driver') update.driverReady = true;
    if (role === 'rider') update.riderReady = true;

    const driverReady =
      role === 'driver' ? true : confirmation.driverReady;
    const riderReady =
      role === 'rider' ? true : confirmation.riderReady;

    if (driverReady && riderReady) {
      update.bothConfirmedAt = serverTimestamp();
      update.status = 'both_ready';
    }

    tx.update(confirmRef, update);

    // Notify the other party if only one side is ready
    if (!(driverReady && riderReady)) {
      const otherUserId =
        role === 'driver' ? confirmation.riderId : confirmation.driverId;
      await createNotification(
        otherUserId,
        'other_side_ready',
        confirmation.rideRequestId,
        `Your ${role} is ready — tap to confirm your pickup.`,
      );
    }
  });
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
