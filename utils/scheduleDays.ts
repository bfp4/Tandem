import type { RideRequest } from '@/types/rideRequest';
import type { ScheduleBlock } from '@/types/scheduleBlock';

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const FULL_DAY: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

export const DAY_NUM: Record<number, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

const DAY_SHORT_TO_NUM: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * "YYYY-MM-DD" of the soonest occurrence of a short day name ("Mon", etc.).
 * Includes today if today matches the target day AND `departureTime` (HH:MM, 24h)
 * has not yet passed; otherwise rolls to the same weekday next week.
 */
export function nextDateForDay(dayShort: string, departureTime?: string): string {
  const target = DAY_SHORT_TO_NUM[dayShort] ?? 0;
  const now = new Date();
  let daysAhead = (target - now.getDay() + 7) % 7;

  if (daysAhead === 0 && departureTime) {
    const [h, m] = departureTime.split(':').map((n) => parseInt(n, 10));
    const departureToday = new Date(now);
    departureToday.setHours(h || 0, m || 0, 0, 0);
    if (departureToday.getTime() <= now.getTime()) {
      daysAhead = 7;
    }
  }

  const d = new Date(now);
  d.setDate(now.getDate() + daysAhead);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

export function dayMatchesList(day: string, list: string[] | null): boolean {
  if (!list) return false;
  return list.some((d) =>
    d.toLowerCase().startsWith(day.toLowerCase().slice(0, 3)),
  );
}

export function blockMatchesDay(block: ScheduleBlock, day: string): boolean {
  if (block.repeating) return dayMatchesList(day, block.repeatDays);
  if (block.date)
    return DAY_NUM[new Date(block.date + 'T00:00:00').getDay()] === day;
  return false;
}

export function rideRequestMatchesDay(r: RideRequest, day: string): boolean {
  if (r.repeating) return dayMatchesList(day, r.repeatDays);
  return DAY_NUM[new Date(r.date + 'T00:00:00').getDay()] === day;
}
