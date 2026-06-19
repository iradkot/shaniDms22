import {
  buildAndroidGlucoseWidgetUpdateArgs,
  calculateWidgetTir,
} from 'app/services/androidGlucoseLiveSurface';
import {BgSample} from 'app/types/day_bgs.types';

const bg = (sgv: number, date = 1, extra: Partial<BgSample> = {}) =>
  ({sgv, date, ...extra} as BgSample);

describe('androidGlucoseLiveSurface widget payload', () => {
  it('calculates TIR with inclusive range boundaries and ignores invalid samples', () => {
    const samples = [
      bg(69),
      bg(70),
      bg(100),
      bg(180),
      bg(181),
      {sgv: Number.NaN, date: 6} as BgSample,
    ];

    expect(calculateWidgetTir(samples, {low: 70, high: 180})).toBe(60);
  });

  it('builds the native widget payload with insulin stats, TIR, projections, and thresholds', () => {
    const args = buildAndroidGlucoseWidgetUpdateArgs({
      enrichedBg: bg(101.6, 12345, {
        direction: 'FortyFiveUp',
        iob: -0.2,
        cob: 12.4,
      }),
      predictions: [{sgv: 110.2}, {sgv: 120.8}, {sgv: 130.1}],
      recentBgSamples: [bg(80), bg(190), bg(100), bg(70)],
      insulinStats: {
        totalBasal: 8.25,
        totalBolus: 5.5,
        basalBolusRatio: 0.6,
        totalInsulin: 13.75,
      },
    }, {low: 70, high: 180});

    expect(args).toEqual([
      102,
      '↗',
      12345,
      -0.2,
      12.4,
      8.25,
      5.5,
      0.6,
      13.75,
      75,
      110,
      121,
      130,
      70,
      180,
    ]);
  });

  it('uses sentinel values for missing optional data without dropping the glucose update', () => {
    const args = buildAndroidGlucoseWidgetUpdateArgs({
      enrichedBg: bg(99, 12345),
      insulinStats: null,
    });

    expect(args).toEqual([
      99,
      '•',
      12345,
      -999,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
    ]);
  });
});
