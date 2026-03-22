import { Timestamp } from 'firebase/firestore';

export type NotificationType =
  | 'ride_requested'    // rider submits → notify driver
  | 'ride_confirmed'    // driver confirms → notify rider
  | 'ride_denied'       // driver denies → notify rider
  | 'ride_cancelled'    // either side cancels → notify other party
  | 'ready_reminder'    // 30 min before ride → notify both (sent by scheduler)
  | 'other_side_ready'  // one side marks ready → notify other party
  | 'both_ready'        // both marked ready → notify both
  | 'pickup_confirmed'  // driver marks pickup → notify rider
  | 'rate_your_ride'    // ride completes → notify both
  | 'request_expired';  // one-time block passes unfilled → notify driver

/** Collection: /notifications/{notificationId} */
export interface Notification {
  /** Recipient user ID */
  userId: string;
  type: NotificationType;
  /** Used for deep-linking when notification is tapped */
  rideRequestId: string;
  message: string;
  /** Default false — drives bell badge count */
  read: boolean;
  createdAt: Timestamp;
}
