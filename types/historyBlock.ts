import { GeoPoint, Timestamp } from 'firebase/firestore';

/** Subcollection: /users/{userId}/historyBlocks/{historyBlockId} */
export interface HistoryBlock {
  rideRequestId: string;
  otherUserId: string;
  /** The current user's role in this ride */
  role: 'driver' | 'rider';
  /** "YYYY-MM-DD" */
  date: string;
  pickupLocation: GeoPoint;
  dropoffLocation: GeoPoint;
  /** "HH:MM" — always on a 15-min interval */
  pickupTime: string;
  amountPaid: number;
  createdAt: Timestamp;
}
