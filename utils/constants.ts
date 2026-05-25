/** Shared UI color palette */
export const ACCENT = '#007AFF';
export const GREEN = '#34C759';
export const ORANGE = '#FF9500';
export const RED = '#FF3B30';
export const STAR_COLOR = '#FFB800';
export const STAR_EMPTY = '#D1D5DB';
export const TEXT_PRIMARY = '#1C1C1E';
export const TEXT_SECONDARY = '#6B7280';
export const TEXT_MUTED = '#9CA3AF';
export const TEXT_TERTIARY = '#666666';
export const TEXT_INVERSE = '#FFFFFF';
export const BG = '#F2F2F7';
export const CARD_BG = '#FFFFFF';
export const BORDER = '#E5E7EB';
export const BORDER_LIGHT = '#F3F4F6';
export const BORDER_DEFAULT = '#E0E0E0';
export const SHADOW = '#000000';
export const SURFACE_SUBTLE = '#F9FAFB';
export const SURFACE_MUTED = '#EEF0F2';
export const PLACEHOLDER = '#BBBBBB';
export const ACCENT_LIGHT = '#EFF6FF';
export const GREEN_LIGHT = '#ECFDF5';
export const ORANGE_LIGHT = '#FFF8F0';
export const ERROR_BG = '#FEF2F2';
export const ERROR_BORDER = '#FECACA';
export const ERROR_DARK = '#991B1B';
export const ERROR_TEXT = '#7F1D1D';
export const ERROR_ACTION = '#B91C1C';
export const WARN_BG = '#FFFBEB';
export const WARN_BORDER = '#FDE68A';
export const WARN_TEXT = '#92400E';

/** Live ride navigation thresholds */
export const ARRIVAL_THRESHOLD_METERS = 150;
export const ROUTE_REFRESH_DISTANCE_METERS = 500;

/** Match screen distance filter options (miles) */
export const DISTANCE_STEPS = [5, 10, 15, 25, 50, 100] as const;

/**
 * Safely parse a star rating from a Firestore value that may be a string,
 * number, or missing. Returns a number clamped to [0, 5].
 */
export function parseStarRating(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(5, n)) : 0;
}
