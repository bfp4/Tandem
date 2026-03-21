import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { RideConfirmation } from '../types/rideConfirmation';
import type { RideRequest } from '../types/rideRequest';

/**
 * Trigger: Cloud Scheduler — every 15 minutes
 * Action:  Activate rideConfirmations whose ride starts within the next 30 minutes.
 *          Sends a 'ready_reminder' notification to both parties.
 *          Uses a batched write — never loops with individual updates.
 */
export const scheduleActivateConfirmations = onSchedule(
  'every 15 minutes',
  async () => {
    const db = getFirestore();
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 30 * 60 * 1000);

    const snap = await db
      .collection('rideConfirmations')
      .where('active', '==', false)
      .where('reminderSent', '==', false)
      .get();

    const batch = db.batch();
    const notificationPromises: Promise<unknown>[] = [];

    for (const confirmDoc of snap.docs) {
      const confirmation = confirmDoc.data() as RideConfirmation;

      // Fetch the associated ride request to get requestedStart
      const requestSnap = await db
        .collection('rideRequests')
        .doc(confirmation.rideRequestId)
        .get();
      if (!requestSnap.exists) continue;
      const rideRequest = requestSnap.data() as RideRequest;

      // Build a Date from nextRideDate + requestedStart ("HH:MM")
      const [hours, minutes] = rideRequest.requestedStart.split(':').map(Number);
      const rideStart = new Date(confirmation.nextRideDate + 'T00:00:00');
      rideStart.setHours(hours, minutes, 0, 0);

      if (rideStart <= windowEnd && rideStart >= now) {
        batch.update(confirmDoc.ref, { active: true, reminderSent: true });

        // Notifications are addDoc calls — queue them to run after the batch
        notificationPromises.push(
          db.collection('notifications').add({
            userId: confirmation.driverId,
            type: 'ready_reminder',
            rideRequestId: confirmation.rideRequestId,
            message: 'Your ride starts in 30 minutes — tap to mark yourself ready.',
            read: false,
            createdAt: Timestamp.now(),
          }),
          db.collection('notifications').add({
            userId: confirmation.riderId,
            type: 'ready_reminder',
            rideRequestId: confirmation.rideRequestId,
            message: 'Your ride starts in 30 minutes — tap to mark yourself ready.',
            read: false,
            createdAt: Timestamp.now(),
          }),
        );
      }
    }

    await batch.commit();
    await Promise.all(notificationPromises);
  },
);
