import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import type { Rating } from '../types/rating';

/**
 * Shared helper: recalculates starRating and rideCount for a user
 * by averaging all /ratings documents where toUserId matches.
 */
async function recalculateStarRating(toUserId: string): Promise<void> {
  const db = getFirestore();
  const snap = await db
    .collection('ratings')
    .where('toUserId', '==', toUserId)
    .get();

  const scores = snap.docs.map((d: FirebaseFirestore.QueryDocumentSnapshot) => (d.data() as Rating).score);
  const rideCount = scores.length;
  const avg = rideCount > 0
    ? Math.round((scores.reduce((a: number, b: number) => a + b, 0) / rideCount) * 10) / 10
    : 0;

  await db.collection('users').doc(toUserId).update({
    starRating: avg,
    rideCount,
  });
}

export { recalculateStarRating };

/**
 * Trigger: onCreate /ratings/{ratingId}
 * Action:  Recalculate starRating and rideCount for the rated user.
 */
export const onRatingCreated = onDocumentCreated(
  'ratings/{ratingId}',
  async (event) => {
    const rating = event.data?.data() as Rating | undefined;
    if (!rating) return;

    await recalculateStarRating(rating.toUserId);
  },
);
