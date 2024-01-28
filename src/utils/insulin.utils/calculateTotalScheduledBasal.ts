// Function to calculate total basal for a date range
import {BasalProfile} from 'app/types/insulin.types';

function calculateTotalScheduledBasal(
  basalProfile: BasalProfile,
  startDate: Date,
  endDate: Date,
): number {
  let totalBasal = 0;
  let currentDate = new Date(startDate);

  while (currentDate <= endDate) {
    basalProfile.forEach((entry, index) => {
      // Calculate duration in hours
      let nextEntryTime =
        index < basalProfile.length - 1
          ? basalProfile[index + 1].time
          : '24:00';
      let startTime = new Date(
        currentDate.toISOString().split('T')[0] + 'T' + entry.time,
      );
      let endTime = new Date(
        currentDate.toISOString().split('T')[0] + 'T' + nextEntryTime,
      );
      let duration = (endTime.getTime() - startTime.getTime()) / 3600000; // Convert milliseconds to hours

      totalBasal += entry.value * duration;
    });

    // Move to the next day
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return totalBasal;
}

// Sample Test
const basalProfileSample: BasalProfile = [
  {time: '00:00', value: 1.0, timeAsSeconds: 0},
  {time: '06:00', value: 1.2, timeAsSeconds: 6 * 60 * 60},
  {time: '22:00', value: 0.9, timeAsSeconds: 22 * 60 * 60},
];

let startDate = new Date('2023-12-01');
let endDate = new Date('2023-12-02');

console.log(
  'Total Scheduled Basal:',
  calculateTotalScheduledBasal(basalProfileSample, startDate, endDate),
);

export default calculateTotalScheduledBasal;
