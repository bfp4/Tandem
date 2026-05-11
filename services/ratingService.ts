import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { Rating } from '@/types/rating';

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

export async function getRating(
  rideRequestId: string,
  fromUserId: string,
): Promise<Rating> {
  const id = ratingDocId(rideRequestId, fromUserId);
  const snap = await getDoc(doc(db, 'ratings', id));
  if (!snap.exists()) {
    throw new Error(
      `No rating found for rideRequest "${rideRequestId}" by user "${fromUserId}".`,
    );
  }
  return snap.data() as Rating;
}

export async function getRatingsByUser(userId: string): Promise<Rating[]> {
  const snap = await getDocs(
    query(
      collection(db, 'ratings'),
      where('toUserId', '==', userId),
      orderBy('createdAt', 'desc'),
    ),
  );
  return snap.docs.map((d) => d.data() as Rating);
}

/**
 * Computes average rating received by a user from `/ratings` (same formula as Cloud Functions).
 * Uses a simple equality query (no composite index). Preferred over user doc alone when triggers
 * are not deployed yet.
 */
export async function aggregateRatingForUser(toUserId: string): Promise<{
  average: number;
  count: number;
} | null> {
  const snap = await getDocs(
    query(collection(db, 'ratings'), where('toUserId', '==', toUserId)),
  );
  if (snap.empty) return null;
  let sum = 0;
  let count = 0;
  snap.forEach((d) => {
    const raw = (d.data() as Rating).score;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(n)) {
      sum += n;
      count += 1;
    }
  });
  if (count === 0) return null;
  const avg = Math.round((sum / count) * 10) / 10;
  return { average: avg, count };
}
