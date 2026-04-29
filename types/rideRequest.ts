import { GeoPoint, Timestamp } from 'firebase/firestore';

export interface PricingSnapshot {
  baseFare: number;
  perMileRate: number;
  /** Miles */
  calculatedDistance: number;
  totalPrice: number;
}

/** Collection: /rideRequests/{requestId} */
export interface RideRequest {
  /** The block the rider tapped (empty string when request originates from matching, not a block) */
  scheduleBlockId: string;
  driverId: string;
  riderId: string;
  /** ID of the riderRide document this request was generated from */
  riderRideId?: string;
  /**
   * Who initiated the match request.
   * 'rider'  → rider asked the driver; driver must accept/deny.
   * 'driver' → driver asked the rider; rider must accept/deny.
   * Undefined on legacy documents — treat as 'rider' for backward compat.
   */
  initiatedBy?: 'rider' | 'driver';
  /** "HH:MM" — on a 15-min interval */
  requestedStart: string;
  /** "HH:MM" — on a 15-min interval */
  requestedEnd: string;
  /** "YYYY-MM-DD" */
  date: string;
  pickupLocation: GeoPoint;
  dropoffLocation: GeoPoint;
  status: 'pending' | 'confirmed' | 'denied' | 'cancelled';
  repeating: boolean;
  repeatDays: string[] | null;
  repeatEndsAt: Timestamp | null;
  seriesId: string | null;
  /** null until confirmed */
  pricingSnapshot: PricingSnapshot | null;
  /** Estimated drive time from pickup to dropoff in minutes */
  //estimatedDriveTimeMinutes: number | null;
  requestedAt: Timestamp;
  respondedAt: Timestamp | null;
}
