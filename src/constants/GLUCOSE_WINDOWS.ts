export type HourWindow = {
  /** Local start hour, 0..23 (inclusive). */
  startHour: number;
  /** Local end hour, 0..23 (exclusive). */
  endHour: number;
};

/**
 * Default "night" window used for overnight metrics.
 *
 * Intended to be made user-configurable in Settings in the future.
 */
export const DEFAULT_NIGHT_WINDOW: HourWindow = {
  startHour: 22,
  endHour: 6,
};

/**
 * Returns true if `date` falls within the provided window in local time.
 * Supports windows that cross midnight (e.g., 22 -> 6).
 */
export function isInHourWindowLocal(date: Date, window: HourWindow): boolean {
  const hour = date.getHours();
  if (window.startHour === window.endHour) return true;

  if (window.startHour < window.endHour) {
    return hour >= window.startHour && hour < window.endHour;
  }

  // Cross-midnight.
  return hour >= window.startHour || hour < window.endHour;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatHourWindowLabel(window: HourWindow): string {
  return `${pad2(window.startHour)}:00–${pad2(window.endHour)}:00`;
}
