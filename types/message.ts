import { Timestamp } from 'firebase/firestore';

// Stored at conversations/{conversationId}/messages/{messageId}
export interface Message {
  senderId: string;
  text: string;
  sentAt: Timestamp;
  read: boolean;
}
