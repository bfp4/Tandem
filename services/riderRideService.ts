import { db } from '@/config/firebase';
import type { RiderRide } from '@/types/riderRide';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore';

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
  await deleteDoc(doc(db, 'riderRides', rideId));
}
