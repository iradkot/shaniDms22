import {BgSample} from 'app/types/day_bgs';

export function calculateAverageAndStdDev(bgSamples: BgSample[]) {
  // Calculate the average sgv
  const averageBg = Math.floor(
    bgSamples.reduce((acc, bg) => acc + bg.sgv, 0) / bgSamples.length,
  );

  // Calculate the standard deviation of the sgv values
  const stdDev = Math.floor(
    Math.sqrt(
      bgSamples.reduce((acc, bg) => acc + (bg.sgv - averageBg) ** 2, 0) /
        (bgSamples.length - 1),
    ),
  );

  return {averageBg, stdDev};
}

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

/**
 * This is a curried function that returns a function that sorts an array of BgSample objects
 * @param ascending
 * @returns {(a: BgSample, b: BgSample) => number}
 * @example
 * const sortedBgData = bgData.sort(sortFunction(false));
 **/
export const bgSortFunction =
  (ascending = false) =>
  (a: BgSample, b: BgSample) => {
    if (ascending) {
      return a.date - b.date;
    } else {
      return b.date - a.date;
    }
  };
