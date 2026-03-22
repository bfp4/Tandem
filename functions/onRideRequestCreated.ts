import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import type { RideRequest } from '../types/rideRequest';

/**
 * Trigger: onCreate /rideRequests/{requestId}
 * Action:  Notify the driver that a new ride has been requested.
 */
export const onRideRequestCreated = onDocumentCreated(
  'rideRequests/{requestId}',
  async (event) => {
    const rideRequest = event.data?.data() as RideRequest | undefined;
    if (!rideRequest) return;

    // TODO: call notificationService.createNotification(
    //   rideRequest.driverId,
    //   'ride_requested',
    //   event.params.requestId,
    //   'You have a new ride request.'
    // )
  },
);
