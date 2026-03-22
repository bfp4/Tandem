import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import type { RideRequest } from '../types/rideRequest';

/**
 * Trigger: onUpdate /rideRequests/{requestId}
 * Action:  Notify the appropriate party based on the new status.
 *   'confirmed'  → notify rider   (type: 'ride_confirmed')
 *   'denied'     → notify rider   (type: 'ride_denied')
 *   'cancelled'  → notify the other party (type: 'ride_cancelled')
 */
export const onRideRequestUpdated = onDocumentUpdated(
  'rideRequests/{requestId}',
  async (event) => {
    const before = event.data?.before.data() as RideRequest | undefined;
    const after = event.data?.after.data() as RideRequest | undefined;
    if (!before || !after) return;

    // Only act when status actually changed
    if (before.status === after.status) return;

    const requestId = event.params.requestId;

    switch (after.status) {
      case 'confirmed':
        // TODO: createNotification(after.riderId, 'ride_confirmed', requestId, 'Your ride has been confirmed.')
        break;

      case 'denied':
        // TODO: createNotification(after.riderId, 'ride_denied', requestId, 'Your ride request was denied.')
        break;

      case 'cancelled': {
        // Determine which party cancelled and notify the other
        // TODO: determine cancelledBy from context or an extra field, then:
        // const otherUserId = cancelledBy === after.riderId ? after.driverId : after.riderId;
        // TODO: createNotification(otherUserId, 'ride_cancelled', requestId, 'Your ride has been cancelled.')
        break;
      }

      default:
        break;
    }
  },
);
