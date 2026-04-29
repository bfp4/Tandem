import { Timestamp } from 'firebase/firestore';

/**
 * Collection: /riderRides/{rideId}
 *
 * Represents a recurring ride that a rider needs — from a pickup address to
 * a dropoff address at a fixed departure time on one or more days per week.
 * The estimated duration is calculated from the OSRM routing service when the
 * ride is created and stored here so the schedule can display it without
 * re-fetching.
 */
export interface RiderRide {
  userId: string;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  /** "HH:MM" 24-hour format, e.g. "10:00" */
  departureTime: string;
  /** Always true for schedule-based rides */
  repeating: boolean;
  /** Short day names, e.g. ["Mon", "Fri"] */
  repeatDays: string[];
  /** Calculated via OSRM at creation time; null if routing failed */
  estimatedDurationMinutes: number | null;
  status: 'active' | 'cancelled';
  createdAt: Timestamp;
}
