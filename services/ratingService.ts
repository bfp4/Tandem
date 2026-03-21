import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';

function ratingDocId(rideRequestId: string, fromUserId: string): string {
  return `${rideRequestId}_${fromUserId}`;
}

export async function submitRating(
  rideRequestId: string,
  fromUserId: string,
  toUserId: string,
  score: number,
  comment?: string,
): Promise<void> {
  const id = ratingDocId(rideRequestId, fromUserId);
  const ratingRef = doc(db, 'ratings', id);

  const existing = await getDoc(ratingRef);
  if (existing.exists()) {
    throw new Error(
      `Rating already exists for rideRequest "${rideRequestId}" by user "${fromUserId}". Use updateRating to modify it.`,
    );
  }

  await setDoc(ratingRef, {
    rideRequestId,
    fromUserId,
    toUserId,
    score,
    comment: comment ?? null,
    createdAt: serverTimestamp(),
    updatedAt: null,
  });
}

export async function updateRating(
  rideRequestId: string,
  fromUserId: string,
  score: number,
  comment?: string,
): Promise<void> {
  const id = ratingDocId(rideRequestId, fromUserId);
  const ratingRef = doc(db, 'ratings', id);

  const existing = await getDoc(ratingRef);
  if (!existing.exists()) {
    throw new Error(
      `Rating not found for rideRequest "${rideRequestId}" by user "${fromUserId}". Use submitRating to create it.`,
    );
  }

  // Only score, comment, and updatedAt are ever modified — identity fields are immutable.
  await updateDoc(ratingRef, {
    score,
    comment: comment ?? null,
    updatedAt: serverTimestamp(),
  });
}
