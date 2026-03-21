import {
  collection,
  addDoc,
  doc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { Notification, NotificationType } from '@/types/notification';

export async function createNotification(
  userId: string,
  type: NotificationType,
  rideRequestId: string,
  message: string,
): Promise<void> {
  await addDoc(collection(db, 'notifications'), {
    userId,
    type,
    rideRequestId,
    message,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  await updateDoc(doc(db, 'notifications', notificationId), { read: true });
}

export async function getUnreadNotifications(
  userId: string,
): Promise<Notification[]> {
  const snap = await getDocs(
    query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('read', '==', false),
    ),
  );
  return snap.docs.map((d) => d.data() as Notification);
}
