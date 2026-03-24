import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import type { RideConfirmation } from '../types/rideConfirmation';

/**
 * Trigger: onUpdate /rideConfirmations/{confirmationId}
 * Action:  Notify parties based on status transition.
 *   'both_ready'  → notify both driver and rider (type: 'both_ready')
 *   'in_progress' → notify rider               (type: 'pickup_confirmed')
 *   'completed'   → notify both                (type: 'rate_your_ride')
 *
 * Guard: if status transitions from 'completed' back to 'waiting' (repeating ride reset),
 *        do NOT send any notifications.
 */
export const onRideConfirmationUpdated = onDocumentUpdated(
  'rideConfirmations/{confirmationId}',
  async (event) => {
    const before = event.data?.before.data() as RideConfirmation | undefined;
    const after = event.data?.after.data() as RideConfirmation | undefined;
    if (!before || !after) return;

    // Guard: repeating ride reset — completed → waiting means the doc was recycled, not a new event
    if (before.status === 'completed' && after.status === 'waiting') return;

    // Only act when status actually changed
    if (before.status === after.status) return;

    const confirmationId = event.params.confirmationId;
    const { driverId, riderId, rideRequestId } = after;

    switch (after.status) {
      case 'both_ready':
        // TODO: createNotification(driverId, 'both_ready', rideRequestId, 'Both you and your rider are ready!')
        // TODO: createNotification(riderId,  'both_ready', rideRequestId, 'Both you and your driver are ready!')
        break;

      case 'in_progress':
        // TODO: createNotification(riderId, 'pickup_confirmed', rideRequestId, 'Your driver has confirmed the pickup.')
        break;

      case 'completed':
        // TODO: createNotification(driverId, 'rate_your_ride', rideRequestId, 'Your ride is complete — rate your rider.')
        // TODO: createNotification(riderId,  'rate_your_ride', rideRequestId, 'Your ride is complete — rate your driver.')
        break;

      default:
        break;
    }
  },
);
