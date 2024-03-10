// Accessors for D3 calculations
import {BgSample} from 'app/types/day_bgs.types';

export const xAccessor = (d: BgSample) => new Date(d.date);
export const yAccessor = (d: BgSample) => d.sgv;

export const findClosestBgSample = (
  x: number,
  bgSamples: BgSample[],
): BgSample | null => {
  if (!bgSamples || bgSamples.length === 0) {
    return null;
  }

  let start = 0;
  let end = bgSamples.length - 1;

  while (start <= end) {
    const mid = Math.floor((start + end) / 2);
    const midDate = new Date(bgSamples[mid].date).getTime();

    if (midDate === x) {
      return bgSamples[mid];
    } else if (midDate < x) {
      start = mid + 1;
    } else {
      end = mid - 1;
    }
  }

  // At this point, start points to the closest date
  // Check if the closest date is in the past or future and return the closer one
  if (
    start > 0 &&
    (start === bgSamples.length ||
      x - new Date(bgSamples[start - 1].date).getTime() <
        new Date(bgSamples[start].date).getTime() - x)
  ) {
    return bgSamples[start - 1];
  }

  return bgSamples[start];
};
