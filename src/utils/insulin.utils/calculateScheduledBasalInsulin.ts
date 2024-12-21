import { BasalProfile } from 'app/types/insulin.types';

/**
 * Calculates the total scheduled basal insulin over a date range.
 * Forces minutes/seconds to 0 on startDate and endDate, then
 * iterates day by day, clamping each day's calculation to [startDate, endDate].
 *
 * @param basalProfile - Basal profile data array.
 * @param startDate    - Start date of the period.
 * @param endDate      - End date of the period.
 * @returns Total scheduled basal insulin delivered over the period (units).
 */
export const calculateScheduledBasalInsulin = (
  basalProfile: BasalProfile,
  startDate: Date,
  endDate: Date
): number => {
  let totalBasal = 0;
  const oneDayMs = 24 * 60 * 60 * 1000;

  // 1) Round startDate and endDate down to the hour (or to midnight, if that’s your intention).
  //    Here we zero out minutes/seconds. If you want the day to start at 22:00 specifically,
  //    you could do: setHours(22, 0, 0, 0) on startDate. Adjust as needed.
  const adjustedStart = new Date(startDate);
  adjustedStart.setMinutes(0, 0, 0);

  const adjustedEnd = new Date(endDate);
  adjustedEnd.setMinutes(0, 0, 0);

  // 2) Iterate from adjustedStart up to adjustedEnd (day by day).
  let currentDate = new Date(adjustedStart);
  while (currentDate <= adjustedEnd) {
    // Nominal day boundaries (local midnight-to-midnight),
    // or change to (22:00–22:00) if your pump’s day is offset.
    const dayStart = new Date(currentDate);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(currentDate);
    dayEnd.setHours(23, 59, 59, 999);

    // 3) Clamp day boundaries to [adjustedStart, adjustedEnd].
    const actualDayStart = new Date(Math.max(dayStart.getTime(), adjustedStart.getTime()));
    const actualDayEnd = new Date(Math.min(dayEnd.getTime(), adjustedEnd.getTime()));

    // If there's no overlap, move to the next day.
    if (actualDayEnd <= actualDayStart) {
      currentDate = new Date(currentDate.getTime() + oneDayMs);
      continue;
    }

    // 4) Go through each basal segment, and calculate overlap with [actualDayStart, actualDayEnd].
    for (let i = 0; i < basalProfile.length; i++) {
      const entry = basalProfile[i];
      const nextEntry = basalProfile[i + 1] || basalProfile[0]; // wrap around
      const rate = entry.value; // rate in U/hr

      const segmentStartTime = parseTime(entry.time);       // offset from midnight, in ms
      const segmentEndTime = parseTime(nextEntry.time);     // offset from midnight, in ms

      // Segment nominal start/end for this day
      const segmentStart = new Date(actualDayStart.getTime() + segmentStartTime);
      let segmentEnd = new Date(actualDayStart.getTime() + segmentEndTime);

      // If crossing midnight (e.g., next segment time is earlier in the day),
      // add one full day to the segmentEnd.
      if (segmentEndTime <= segmentStartTime) {
        segmentEnd = new Date(segmentEnd.getTime() + oneDayMs);
      }

      // Overlap = [segmentStart, segmentEnd] ∩ [actualDayStart, actualDayEnd].
      const overlapStart = new Date(Math.max(segmentStart.getTime(), actualDayStart.getTime()));
      const overlapEnd = new Date(Math.min(segmentEnd.getTime(), actualDayEnd.getTime()));

      // Calculate only positive overlap duration in hours.
      if (overlapEnd > overlapStart) {
        const durationHours = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60);
        totalBasal += rate * durationHours;
      }
    }

    // Move to the next calendar day
    currentDate = new Date(currentDate.getTime() + oneDayMs);
  }

  return totalBasal;
};

/**
 * Parses a time string in "HH:mm" format to milliseconds since midnight.
 */
function parseTime(timeStr: string): number {
  const [hoursStr, minutesStr] = timeStr.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  return (hours * 60 + minutes) * 60 * 1000;
}
