import {BgSample} from 'app/types/day_bgs';
export function findBiggestChangesInTimeRange(
  bgSamples: BgSample[],
  timeRange: number,
): {
  upChange: {
    fromValue: number;
    toValue: number;
    fromTime: string;
    toTime: string;
  };
  downChange: {
    fromValue: number;
    toValue: number;
    fromTime: string;
    toTime: string;
  };
} {
  // Sort the bgSamples array by date in ascending order
  const sortedBgSamples = Array.from(bgSamples).sort((a, b) => a.date - b.date);

  // Initialize maxChanges to { upChange: {...}, downChange: {...} }
  let maxChanges = {
    upChange: {fromValue: 0, toValue: 0, fromTime: '', toTime: ''},
    downChange: {fromValue: 0, toValue: 0, fromTime: '', toTime: ''},
  };

  for (let i = 1; i < sortedBgSamples.length; i++) {
    const bgSample = sortedBgSamples[i];
    const prevBgSample = sortedBgSamples[i - 1];

    // Calculate the difference between the current bgSample's sgv value and the previous bgSample's sgv value
    const change = bgSample.sgv - prevBgSample.sgv;

    // Calculate the time difference between the current bgSample and the previous bgSample in minutes
    const timeDifference = (bgSample.date - prevBgSample.date) / (1000 * 60);

    // If the time difference is less than or equal to the timeRange and the change is greater than the current maxChange, update maxChange
    if (timeDifference <= timeRange) {
      if (
        change >
        maxChanges.upChange.toValue - maxChanges.upChange.fromValue
      ) {
        maxChanges.upChange = {
          fromValue: prevBgSample.sgv,
          toValue: bgSample.sgv,
          fromTime: prevBgSample.dateString,
          toTime: bgSample.dateString,
        };
      }

      if (
        change <
        maxChanges.downChange.toValue - maxChanges.downChange.fromValue
      ) {
        maxChanges.downChange = {
          fromValue: prevBgSample.sgv,
          toValue: bgSample.sgv,
          fromTime: prevBgSample.dateString,
          toTime: bgSample.dateString,
        };
      }
    }
  }

  return maxChanges;
}
