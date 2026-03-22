import { auth } from 'firebase-functions/v1';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

/**
 * Trigger: auth.user().onDelete
 * Action:  Cleans up all Firestore data for the deleted user in the correct
 *          order — Firestore first while the uid is still valid, then the Auth
 *          record is released by Firebase automatically after this function returns.
 *
 * Order matters:
 *   1. Cancel active rideRequests and notify the other party
 *   2. Delete associated rideConfirmations
 *   3. Delete open/requested scheduleBlocks
 *   4. Delete all notifications
 *   5. Delete historyBlocks subcollection, then the user document itself
 */
export const onAuthUserDeleted = auth.user().onDelete(async (user) => {
  const db = getFirestore();
  const uid = user.uid;

  // Step 1: Find rideRequests where this user is driver or rider and still active
  const [driverSnap, riderSnap] = await Promise.all([
    db
      .collection('rideRequests')
      .where('driverId', '==', uid)
      .where('status', 'in', ['pending', 'confirmed'])
      .get(),
    db
      .collection('rideRequests')
      .where('riderId', '==', uid)
      .where('status', 'in', ['pending', 'confirmed'])
      .get(),
  ]);

  const activeRequests = [...driverSnap.docs, ...riderSnap.docs];

  // Step 2: For each active request, cancel it and notify the other party,
  //         then delete the associated rideConfirmation.
  for (const requestDoc of activeRequests) {
    const request = requestDoc.data();
    const otherPartyId =
      request.driverId === uid ? request.riderId : request.driverId;

    const batch = db.batch();

    // Cancel the ride request
    batch.update(requestDoc.ref, { status: 'cancelled' });

    // Notify the other party
    const notifRef = db.collection('notifications').doc();
    batch.set(notifRef, {
      userId: otherPartyId,
      type: 'ride_cancelled',
      rideRequestId: requestDoc.id,
      message: 'A ride was cancelled because the other user deleted their account.',
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    // Delete associated rideConfirmation(s) for this request
    const confirmationSnap = await db
      .collection('rideConfirmations')
      .where('rideRequestId', '==', requestDoc.id)
      .get();

    if (!confirmationSnap.empty) {
      const confirmBatch = db.batch();
      for (const confDoc of confirmationSnap.docs) {
        confirmBatch.delete(confDoc.ref);
      }
      await confirmBatch.commit();
    }
  }

  // Step 3: Delete open or requested scheduleBlocks owned by this user
  const blocksSnap = await db
    .collection('scheduleBlocks')
    .where('userId', '==', uid)
    .where('status', 'in', ['open', 'requested'])
    .get();

  if (!blocksSnap.empty) {
    const blockBatch = db.batch();
    for (const blockDoc of blocksSnap.docs) {
      blockBatch.delete(blockDoc.ref);
    }
    await blockBatch.commit();
  }

  // Step 4: Delete all notifications for this user
  const notifSnap = await db
    .collection('notifications')
    .where('userId', '==', uid)
    .get();

  if (!notifSnap.empty) {
    const notifBatch = db.batch();
    for (const notifDoc of notifSnap.docs) {
      notifBatch.delete(notifDoc.ref);
    }
    await notifBatch.commit();
  }

  // Step 5: Delete historyBlocks subcollection, then the user document
  const historySnap = await db
    .collection('users')
    .doc(uid)
    .collection('historyBlocks')
    .get();

  if (!historySnap.empty) {
    const historyBatch = db.batch();
    for (const historyDoc of historySnap.docs) {
      historyBatch.delete(historyDoc.ref);
    }
    await historyBatch.commit();
  }

  await db.collection('users').doc(uid).delete();
});
