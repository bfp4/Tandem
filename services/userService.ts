import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { User } from '@/types/user';
import type { HistoryBlock } from '@/types/historyBlock';

export async function getUser(userId: string): Promise<User> {
  const snap = await getDoc(doc(db, 'users', userId));
  if (!snap.exists()) throw new Error(`User not found: ${userId}`);
  return snap.data() as User;
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
