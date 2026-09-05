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
  const firstSample = bgSamples[0]!;
  const lastSample = bgSamples[end]!;
  const ascending = firstSample.date <= lastSample.date;

  while (start <= end) {
    const mid = Math.floor((start + end) / 2);
    const midSample = bgSamples[mid]!;
    const midDate = midSample.date;

    if (midDate === x) {
      return midSample;
    } else if ((ascending && midDate < x) || (!ascending && midDate > x)) {
      start = mid + 1;
    } else {
      end = mid - 1;
    }
  }

  const candidates = [bgSamples[start - 1], bgSamples[start]].filter(
    (sample): sample is BgSample =>
      sample != null && Number.isFinite(sample.date),
  );
  if (!candidates.length) {
    return null;
  }
  return candidates.reduce((closest, sample) =>
    Math.abs(sample.date - x) < Math.abs(closest.date - x) ? sample : closest,
  );
};
