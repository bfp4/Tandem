import type { RideConfirmationWithId } from '@/services/rideConfirmationService';
import type { RideRequestWithId } from '@/services/rideRequestService';
import type { User as AppUser } from '@/types/user';

export interface EnrichedRide {
  confirmation: RideConfirmationWithId;
  request: RideRequestWithId;
  otherUser: AppUser;
  pickupAddress: string;
  dropoffAddress: string;
  /** True when derived from confirmed rideRequest but missing a confirmation doc */
  synthetic?: boolean;
}
