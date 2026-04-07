import { Timestamp } from 'firebase/firestore';

// Document ID = auto-generated Firestore ID
export interface Conversation {
  /** The two participant UIDs */
  participants: [string, string];
  /** Snapshot of the last message text for the list preview */
  lastMessage: string;
  lastMessageAt: Timestamp | null;
  /** Maps uid -> unread count for that user */
  unreadCounts: Record<string, number>;
}
