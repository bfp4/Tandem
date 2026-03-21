import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import type { Rating } from '../types/rating';
import { recalculateStarRating } from './onRatingCreated';

/**
 * Trigger: onUpdate /ratings/{ratingId}
 * Action:  Recalculate starRating and rideCount for the rated user.
 *          Uses the shared recalculateStarRating helper from onRatingCreated.
 */
export const onRatingUpdated = onDocumentUpdated(
  'ratings/{ratingId}',
  async (event) => {
    const after = event.data?.after.data() as Rating | undefined;
    if (!after) return;

    await recalculateStarRating(after.toUserId);
  },
);
