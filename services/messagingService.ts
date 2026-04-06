import { db } from '@/config/firebase';
import type { Conversation } from '@/types/conversation';
import type { Message } from '@/types/message';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

export interface ConversationWithId extends Conversation {
  id: string;
}

export interface MessageWithId extends Message {
  id: string;
}

/**
 * Finds an existing conversation between two users or creates a new one.
 * Returns the conversation ID.
 */
export async function getOrCreateConversation(
  uid1: string,
  uid2: string,
): Promise<string> {
  const snap = await getDocs(
    query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', uid1),
    ),
  );

  const existing = snap.docs.find((d) => {
    const participants = d.data().participants as string[];
    return participants.includes(uid2);
  });

  if (existing) return existing.id;

  const newRef = doc(collection(db, 'conversations'));
  const conversation: Conversation = {
    participants: [uid1, uid2],
    lastMessage: '',
    lastMessageAt: null,
    unreadCounts: { [uid1]: 0, [uid2]: 0 },
  };
  await setDoc(newRef, conversation);
  return newRef.id;
}

/**
 * Real-time listener for all conversations a user is part of,
 * ordered by most recent message. Sorting is done client-side to avoid
 * requiring a composite index on a nullable field (lastMessageAt).
 */
export function subscribeToConversations(
  uid: string,
  onUpdate: (conversations: ConversationWithId[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'conversations'),
    where('participants', 'array-contains', uid),
  );

  return onSnapshot(
    q,
    (snap) => {
      const conversations = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Conversation) }))
        .sort((a, b) => {
          const aMs = a.lastMessageAt?.toMillis() ?? 0;
          const bMs = b.lastMessageAt?.toMillis() ?? 0;
          return bMs - aMs;
        });
      onUpdate(conversations);
    },
    (error) => {
      console.error('subscribeToConversations error:', error);
      onError?.(error);
    },
  );
}

/**
 * Sends a message in a conversation and updates the conversation's
 * lastMessage preview and unread counts for the other participant.
 */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  recipientId: string,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  const messagesRef = collection(db, 'conversations', conversationId, 'messages');
  await addDoc(messagesRef, {
    senderId,
    text: trimmed,
    sentAt: serverTimestamp(),
    read: false,
  });

  const conversationRef = doc(db, 'conversations', conversationId);
  await updateDoc(conversationRef, {
    lastMessage: trimmed,
    lastMessageAt: serverTimestamp(),
    [`unreadCounts.${recipientId}`]: (await getUnreadCount(conversationId, recipientId)) + 1,
  });
}

async function getUnreadCount(conversationId: string, uid: string): Promise<number> {
  const snap = await getDocs(
    query(
      collection(db, 'conversations', conversationId, 'messages'),
      where('senderId', '!=', uid),
      where('read', '==', false),
      limit(100),
    ),
  );
  return snap.size;
}

/**
 * Real-time listener for messages in a conversation, ordered oldest-first.
 */
export function subscribeToMessages(
  conversationId: string,
  onUpdate: (messages: MessageWithId[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'conversations', conversationId, 'messages'),
    orderBy('sentAt', 'asc'),
  );

  return onSnapshot(q, (snap) => {
    const messages = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Message),
    }));
    onUpdate(messages);
  });
}

/**
 * Resets the unread count for a user in a conversation (call when they open it).
 */
export async function markConversationRead(
  conversationId: string,
  uid: string,
): Promise<void> {
  await updateDoc(doc(db, 'conversations', conversationId), {
    [`unreadCounts.${uid}`]: 0,
  });
}
