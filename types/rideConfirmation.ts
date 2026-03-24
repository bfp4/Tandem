import { Timestamp } from 'firebase/firestore';

/**
 * Collection: /rideConfirmations/{confirmationId}
 * One document created per rideRequest when the driver confirms.
 * For repeating rides, this document is reset after each completion rather than recreated.
 */
export interface RideConfirmation {
  rideRequestId: string;
  driverId: string;
  riderId: string;

  /** Scheduler flips this to true 30 min before the ride — gates the Mark Ready UI */
  active: boolean;

  /** Default false */
  riderReady: boolean;
  /** Default false */
  driverReady: boolean;

  /**
   * @readonly - set atomically inside a transaction only, never written directly
   */
  bothConfirmedAt: Timestamp | null;

  pickupConfirmed: boolean;
  pickupConfirmedAt: Timestamp | null;
  /** Prevents duplicate 30-min reminders */
  reminderSent: boolean;

  status: 'waiting' | 'both_ready' | 'in_progress' | 'completed';

  /**
   * Tracks the next upcoming occurrence for repeating rides.
   * For one-time rides this is just the ride date.
   * Updated to the next occurrence each time completeRide resets this document.
   * "YYYY-MM-DD"
   */
  nextRideDate: string;

  createdAt: Timestamp;
}
