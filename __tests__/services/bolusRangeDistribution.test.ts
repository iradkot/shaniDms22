import {buildBolusRangeDistribution} from 'app/services/insulin/bolusRangeDistribution';

const HOUR = 3_600_000;
const startMs = +new Date(2026, 9, 7, 0);
const iso = (offset: number) => new Date(startMs + offset * HOUR).toISOString();

describe('bolus range distribution', () => {
  it('clips interval carry-in and splits it across local hour boundaries', () => {
    expect(
      buildBolusRangeDistribution(
        [
          {type: 'bolus', amount: 6, startTime: iso(-1), endTime: iso(3)},
          {type: 'bolus', amount: 99, timestamp: iso(2)},
          {type: 'bolus', amount: 99, timestamp: iso(-1)},
        ],
        {startMs, endMs: startMs + 2 * HOUR},
      ),
    ).toEqual({
      count: 1,
      totalUnits: 3,
      peakLocalHour: 0,
      byLocalHour: [
        {hour: 0, totalU: 1.5},
        {hour: 1, totalU: 1.5},
      ],
    });
  });

  it('preserves the rounded total when several hours contain fractions of a hundredth', () => {
    const result = buildBolusRangeDistribution(
      [{type: 'bolus', amount: 0.02, startTime: iso(0), endTime: iso(3)}],
      {startMs, endMs: startMs + 3 * HOUR},
    );
    expect(result.byLocalHour).toEqual([
      {hour: 0, totalU: 0.01},
      {hour: 1, totalU: 0.01},
      {hour: 2, totalU: 0},
    ]);
    expect(
      result.byLocalHour.reduce((sum, bucket) => sum + bucket.totalU, 0),
    ).toBe(result.totalUnits);
  });
});
