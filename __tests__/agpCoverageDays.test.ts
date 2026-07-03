import {countDaysWithData} from '../src/components/charts/AGPGraph/utils/statistics';
import {BgSample} from '../src/types/day_bgs.types';

describe('AGP data coverage days', () => {
  it('counts unique local calendar days with valid readings, not estimated days from reading count', () => {
    const samples = [
      bgSample(new Date(2026, 6, 1, 8), 100),
      bgSample(new Date(2026, 6, 1, 12), 110),
      bgSample(new Date(2026, 6, 3, 9), 120),
      bgSample(new Date(2026, 6, 5, 10), 130),
    ];

    expect(countDaysWithData(samples)).toBe(3);
  });
});

function bgSample(date: Date, sgv: number): BgSample {
  return {
    sgv,
    date: date.getTime(),
    dateString: date.toISOString(),
    trend: 4,
    direction: 'Flat',
    device: 'test',
    type: 'sgv',
  };
}
