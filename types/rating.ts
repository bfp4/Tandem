import { Timestamp } from 'firebase/firestore';

/**
 * Collection: /ratings/{ratingId}
 * Document ID must always be set to "{rideRequestId}_{fromUserId}" — enforced in the service layer.
 */
export interface Rating {
  rideRequestId: string;
  fromUserId: string;
  toUserId: string;
  /** 1–5 */
  score: number;
  comment: string | null;
  createdAt: Timestamp;
  /** null on first write, set on any subsequent update */
  updatedAt: Timestamp | null;
}
