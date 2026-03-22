import { Timestamp } from 'firebase/firestore';

/**
 * Collection: /scheduleBlocks/{blockId}
 * Times are always on 15-minute intervals — enforced by the UI, no rounding needed.
 */
export interface ScheduleBlock {
  userId: string;
  /** Needed for dual-role users */
  role: 'driver' | 'rider';
  /** "YYYY-MM-DD" — null if repeating */
  date: string | null;
  /** "HH:MM" on a 15-min interval */
  startTime: string;
  /** "HH:MM" on a 15-min interval */
  endTime: string;
  status: 'open' | 'requested' | 'booked' | 'expired';
  repeating: boolean;
  /** e.g. ["MON","WED"] — null if not repeating */
  repeatDays: string[] | null;
  /** null = indefinite */
  repeatEndsAt: Timestamp | null;
  /** Shared ID across all blocks in a repeat series */
  seriesId: string | null;
  /** One-time only: date + endTime as Timestamp. null if repeating */
  expiresAt: Timestamp | null;
  /** Set when this block was created by splitting a parent */
  parentBlockId: string | null;
  createdAt: Timestamp;
}
