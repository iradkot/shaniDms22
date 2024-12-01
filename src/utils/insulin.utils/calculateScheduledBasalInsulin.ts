import { BasalProfile } from 'app/types/insulin.types';

/**
 * Calculates the total scheduled basal insulin over a date range.
 * @param basalProfile - The basal profile data.
 * @param startDate - Start date of the period.
 * @param endDate - End date of the period.
 * @returns Total scheduled basal insulin delivered over the period.
 */
export const calculateScheduledBasalInsulin = (
  basalProfile: BasalProfile,
  startDate: Date,
  endDate: Date
): number => {
  let totalBasal = 0;
  const oneDayMs = 24 * 60 * 60 * 1000;

  let currentDate = new Date(startDate);
  while (currentDate <= endDate) {
    // For each day, calculate basal insulin based on the basal profile
    const dayStart = new Date(currentDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(currentDate);
    dayEnd.setHours(23, 59, 59, 999);

    // For each segment in the basal profile
    for (let i = 0; i < basalProfile.length; i++) {
      const entry = basalProfile[i];
      const nextEntry = basalProfile[i + 1] || basalProfile[0]; // Wrap around for the last segment
      const rate = entry.value; // rate in U/hr

      // Calculate start and end times of this segment
      const segmentStartTime = parseTime(entry.time);
      const segmentEndTime = parseTime(nextEntry.time);

      // Adjust for segments that cross midnight
      const segmentStart = new Date(dayStart.getTime() + segmentStartTime);
      let segmentEnd = new Date(dayStart.getTime() + segmentEndTime);
      if (segmentEndTime <= segmentStartTime) {
        // Segment crosses midnight
        segmentEnd = new Date(segmentEnd.getTime() + oneDayMs);
      }

      // Find overlap between segment and the day (which might be partial for startDate and endDate)
      const overlapStart = new Date(Math.max(segmentStart.getTime(), startDate.getTime()));
      const overlapEnd = new Date(Math.min(segmentEnd.getTime(), endDate.getTime()));

      if (overlapEnd > overlapStart) {
        const durationHours = (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60);
        totalBasal += rate * durationHours;
      }
    }

    currentDate = new Date(currentDate.getTime() + oneDayMs);
  }

  return totalBasal;
};

/**
 * Parses a time string in "HH:mm" format to milliseconds since midnight.
 * @param timeStr - Time string in "HH:mm" format.
 * @returns Milliseconds since midnight.
 */
function parseTime(timeStr: string): number {
  const [hoursStr, minutesStr] = timeStr.split(':');
  const hours = parseInt(hoursStr, 10);
  const minutes = parseInt(minutesStr, 10);
  return (hours * 60 + minutes) * 60 * 1000;
}
