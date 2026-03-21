import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  Transaction,
  DocumentReference,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import type { ScheduleBlock } from '@/types/scheduleBlock';

export async function createScheduleBlock(
  data: Omit<ScheduleBlock, 'createdAt'>,
): Promise<string> {
  const ref = await addDoc(collection(db, 'scheduleBlocks'), {
    ...data,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getOpenBlocksForDriver(
  driverId: string,
): Promise<ScheduleBlock[]> {
  const q = query(
    collection(db, 'scheduleBlocks'),
    where('userId', '==', driverId),
    where('status', '==', 'open'),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => d.data() as ScheduleBlock);
}

/**
 * Splits a schedule block at `splitAtTime`, marking the original as 'booked'
 * and creating a remainder block from `splitAtTime` to the original `endTime`.
 *
 * MUST be called inside an existing Firestore transaction — not standalone.
 *
 * @returns The document ID of the new remainder block.
 */
export async function splitBlock(
  tx: Transaction,
  blockId: string,
  splitAtTime: string,
): Promise<string> {
  const blockRef = doc(db, 'scheduleBlocks', blockId);
  const blockSnap = await tx.get(blockRef);
  if (!blockSnap.exists()) throw new Error(`ScheduleBlock not found: ${blockId}`);

  const block = blockSnap.data() as ScheduleBlock;

  // Mark the original block as booked
  tx.update(blockRef, { status: 'booked' });

  // Create the remainder block
  const remainderRef = doc(collection(db, 'scheduleBlocks'));
  const remainderData: Omit<ScheduleBlock, 'createdAt'> & { createdAt: unknown } = {
    userId: block.userId,
    role: block.role,
    date: block.date,
    startTime: splitAtTime,
    endTime: block.endTime,
    status: 'open',
    repeating: block.repeating,
    repeatDays: block.repeatDays,
    repeatEndsAt: block.repeatEndsAt,
    seriesId: block.seriesId,
    expiresAt: block.expiresAt,
    parentBlockId: blockId,
    createdAt: serverTimestamp(),
  };
  tx.set(remainderRef, remainderData);

  return remainderRef.id;
}

export async function expireBlock(blockId: string): Promise<void> {
  await updateDoc(doc(db, 'scheduleBlocks', blockId), { status: 'expired' });
}
