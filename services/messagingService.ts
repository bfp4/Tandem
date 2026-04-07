import { db } from '@/config/firebase';
import type { Conversation } from '@/types/conversation';
import type { Message } from '@/types/message';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
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
 * Returns the ID of an existing conversation between two users, or null if none exists.
 * Does NOT create a new conversation.
 */
export async function findExistingConversation(
  uid1: string,
  uid2: string,
): Promise<string | null> {
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

  return existing ? existing.id : null;
}

/**
 * Finds an existing conversation or reserves a new document ID without
 * writing to Firestore yet. The document is only created when the first
 * message is sent via sendMessage().
 *
 * Returns { conversationId, isPending } where isPending=true means the
 * Firestore document does not exist yet.
 */
export async function getOrCreateConversation(
  uid1: string,
  uid2: string,
): Promise<{ conversationId: string; isPending: boolean }> {
  const existingId = await findExistingConversation(uid1, uid2);
  if (existingId) return { conversationId: existingId, isPending: false };

  // Reserve an ID without writing yet — the document is created on first send.
  return { conversationId: doc(collection(db, 'conversations')).id, isPending: true };
}

/**
 * Ensures the conversation document exists. Called by sendMessage before
 * writing the first message when the conversation is still pending.
 */
async function ensureConversationExists(
  conversationId: string,
  uid1: string,
  uid2: string,
): Promise<void> {
  const ref = doc(db, 'conversations', conversationId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const conversation: Conversation = {
      participants: [uid1, uid2],
      lastMessage: '',
      lastMessageAt: null,
      unreadCounts: { [uid1]: 0, [uid2]: 0 },
    };
    await setDoc(ref, conversation);
  }
}

/**
 * Deletes a conversation document if it has no messages.
 * Safe to call on back-navigation to clean up pending/empty conversations.
 */
export async function deleteConversationIfEmpty(
  conversationId: string,
): Promise<void> {
  const messagesSnap = await getDocs(
    collection(db, 'conversations', conversationId, 'messages'),
  );
  if (messagesSnap.empty) {
    await deleteDoc(doc(db, 'conversations', conversationId));
  }
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
 * Pass isPending=true on the first message of a new conversation so the
 * Firestore document is created atomically before the message is written.
 */
export async function sendMessage(
  conversationId: string,
  senderId: string,
  recipientId: string,
  text: string,
  isPending?: boolean,
): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;

  if (isPending) {
    await ensureConversationExists(conversationId, senderId, recipientId);
  }

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
    [`unreadCounts.${recipientId}`]: increment(1),
  });
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
