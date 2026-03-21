import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { ScheduleBlock } from '../types/scheduleBlock';

/**
 * Trigger: Cloud Scheduler — every 60 minutes
 * Action:  Expire one-time schedule blocks whose expiresAt has passed.
 *          Sends a 'request_expired' notification to the driver for each.
 *          Uses a batched write — never loops with individual updates.
 */
export const scheduleExpireBlocks = onSchedule('every 60 minutes', async () => {
  const db = getFirestore();
  const now = Timestamp.now();

  const snap = await db
    .collection('scheduleBlocks')
    .where('repeating', '==', false)
    .where('expiresAt', '<=', now)
    .where('status', 'in', ['open', 'requested'])
    .get();

  const batch = db.batch();
  const notificationPromises: Promise<unknown>[] = [];

  for (const blockDoc of snap.docs) {
    const block = blockDoc.data() as ScheduleBlock;

    batch.update(blockDoc.ref, { status: 'expired' });

    notificationPromises.push(
      db.collection('notifications').add({
        userId: block.userId,
        type: 'request_expired',
        rideRequestId: '',
        message: `Your schedule block on ${block.date} (${block.startTime}–${block.endTime}) expired without a booking.`,
        read: false,
        createdAt: Timestamp.now(),
      }),
    );
  }

  await batch.commit();
  await Promise.all(notificationPromises);
});
