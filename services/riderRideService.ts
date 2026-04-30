import { db } from '@/config/firebase';
import type { RideRequest } from '@/types/rideRequest';
import type { RiderRide } from '@/types/riderRide';
import {
    addDoc,
    collection,
    doc,
    getDocs,
    query,
    runTransaction,
    serverTimestamp,
    where
} from 'firebase/firestore';
import { createNotification } from './notificationService';

export async function createRiderRide(
  data: Omit<RiderRide, 'createdAt' | 'status'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'riderRides'), {
    ...data,
    status: 'active',
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getRiderRides(
  userId: string,
): Promise<(RiderRide & { id: string })[]> {
  const snap = await getDocs(
    query(
      collection(db, 'riderRides'),
      where('userId', '==', userId),
      where('status', '==', 'active'),
    ),
  );
  return snap.docs.map(d => ({ ...(d.data() as RiderRide), id: d.id }));
}

export async function deleteRiderRide(rideId: string): Promise<void> {
  console.log('🟡 deleteRiderRide called with rideId:', rideId);
  
  try {
    const rideRequestsSnap = await getDocs(
      query(
        collection(db, 'rideRequests'),
        where('riderRideId', '==', rideId),
      ),
    );
    console.log('🟡 Found', rideRequestsSnap.docs.length, 'ride requests for this ride');

    const requestsToCancel = rideRequestsSnap.docs.filter(
      d => ['pending', 'confirmed'].includes((d.data() as RideRequest).status),
    );
    console.log('🟡 Found', requestsToCancel.length, 'requests to cancel');

    const confirmationsToDelete: string[] = [];
    for (const requestDoc of requestsToCancel) {
      const confirmationsSnap = await getDocs(
        query(
          collection(db, 'rideConfirmations'),
          where('rideRequestId', '==', requestDoc.id),
        ),
      );
      confirmationsSnap.docs.forEach(c => confirmationsToDelete.push(c.id));
    }
    console.log('🟡 Found', confirmationsToDelete.length, 'confirmations to delete');

    console.log('🟡 Starting transaction...');
    await runTransaction(db, async (tx) => {
      // ── Phase 1: All reads first ──
      const blockSnapsToUpdate: Array<{ ref: any; snap: any; blockId: string }> = [];
      
      for (const requestDoc of requestsToCancel) {
        const rideRequest = requestDoc.data() as RideRequest;
        if (rideRequest.scheduleBlockId) {
          const blockRef = doc(db, 'scheduleBlocks', rideRequest.scheduleBlockId);
          const blockSnap = await tx.get(blockRef);
          if (blockSnap.exists() && blockSnap.data()?.status === 'booked') {
            blockSnapsToUpdate.push({ 
              ref: blockRef, 
              snap: blockSnap, 
              blockId: rideRequest.scheduleBlockId 
            });
          }
        }
      }

      // ── Phase 2: All writes ──
      console.log('🟡 Deleting riderRide:', rideId);
      tx.delete(doc(db, 'riderRides', rideId));

      for (const requestDoc of requestsToCancel) {
        console.log('🟡 Cancelling request:', requestDoc.id);
        tx.update(doc(db, 'rideRequests', requestDoc.id), {
          status: 'cancelled',
        });
      }

      for (const { ref, blockId } of blockSnapsToUpdate) {
        console.log('🟡 Opening schedule block:', blockId);
        tx.update(ref, { status: 'open' });
      }

      for (const confirmationId of confirmationsToDelete) {
        console.log('🟡 Deleting confirmation:', confirmationId);
        tx.delete(doc(db, 'rideConfirmations', confirmationId));
      }
    });
    console.log('✅ Transaction complete');

    for (const requestDoc of requestsToCancel) {
      const rideRequest = requestDoc.data() as RideRequest;
      console.log('🟡 Sending notification to driver:', rideRequest.driverId);
      await createNotification(
        rideRequest.driverId,
        'ride_cancelled',
        requestDoc.id,
        'The rider has cancelled this ride request.',
      );
    }
    console.log('✅ deleteRiderRide complete');
  } catch (error) {
    console.error('❌ Error in deleteRiderRide:', error);
    throw error;
  }
}
