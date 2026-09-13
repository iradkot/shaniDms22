import React from 'react';
import renderer, {act} from 'react-test-renderer';
import MixedMiniChart from 'app/components/charts/MixedMiniChart/MixedMiniChart';
import {
  buildMiniLoadSegments,
  buildMiniLoadSegmentsByKind,
} from 'app/components/charts/miniChartData';
import type {BgSample} from 'app/types/day_bgs.types';
import type {DatedChartLoadSample} from 'app/utils/chartLoadSeries.utils';
import {withTheme} from '../mocks/withTheme';

const MINUTE = 60_000;
const domain: [Date, Date] = [new Date(0), new Date(40 * MINUTE)];

describe('Mini-chart load preparation', () => {
  const samples: readonly DatedChartLoadSample[] = Object.freeze(
    [
      {date: 40 * MINUTE, iob: 0, cob: 0},
      {date: 0, iob: -0.5, cob: -2},
      {date: 5 * MINUTE, iobBolus: 2, iobBasal: -0.5, cob: 9},
      {date: 10 * MINUTE, cob: 8},
      {date: 15 * MINUTE, iob: 1, cob: 6},
      {date: 15 * MINUTE, iob: 2, cob: 5},
      {date: 15 * MINUTE},
      {date: 25 * MINUTE, iob: 0.5},
      {date: -1, iob: 99, cob: 99},
      {date: 40 * MINUTE + 1, iob: 99, cob: 99},
      {date: NaN, iob: 99, cob: 99},
    ].map(sample => Object.freeze(sample)),
  );

  const expected = {
    iob: [
      [
        {x: 0, y: -0.5},
        {x: 5 * MINUTE, y: 1.5},
      ],
      [
        {x: 15 * MINUTE, y: 2},
        {x: 25 * MINUTE, y: 0.5},
      ],
      [{x: 40 * MINUTE, y: 0}],
    ],
    cob: [
      [
        {x: 0, y: 0},
        {x: 5 * MINUTE, y: 9},
        {x: 10 * MINUTE, y: 8},
        {x: 15 * MINUTE, y: 5},
      ],
      [{x: 40 * MINUTE, y: 0}],
    ],
  };

  it.each(['iob', 'cob'] as const)(
    'preserves %s values, missing readings, duplicate-time values and gap boundaries',
    kind => {
      expect(buildMiniLoadSegments(samples, domain, kind)).toEqual(
        expected[kind],
      );
    },
  );

  it('uses the same factual segment policy for paired and individual lanes', () => {
    expect(buildMiniLoadSegmentsByKind(samples, domain)).toEqual(expected);
    expect(buildMiniLoadSegmentsByKind([], domain)).toEqual({iob: [], cob: []});
    expect(
      buildMiniLoadSegmentsByKind(samples, [new Date(2), new Date(1)]),
    ).toEqual({iob: [], cob: []});
  });

  it('prepares both mixed-chart loads once per data/domain change, never per cursor move', () => {
    let reads = 0;
    const history: BgSample[] = Array.from({length: 48}, (_, index) => ({
      get date() {
        reads++;
        return index * MINUTE;
      },
      dateString: new Date(index * MINUTE).toISOString(),
      sgv: 100,
      direction: 'Flat',
      trend: 0,
      device: 'fixture',
      type: 'sgv',
      iob: index % 3,
      cob: index % 20,
    }));
    let tree: renderer.ReactTestRenderer | undefined;
    const chart = (bgSamples = history, xDomain = domain, cursorTimeMs = 0) =>
      withTheme(
        <MixedMiniChart
          width={390}
          height={180}
          bgSamples={bgSamples}
          xDomain={xDomain}
          cursorTimeMs={cursorTimeMs}
        />,
      );
    // One pass for load values, one for gap timestamps, and the existing
    // latest-basal-time scan. Preparing IOB and COB independently exceeds this.
    const preparationBudget = history.length * 3;
    try {
      act(() => {
        tree = renderer.create(chart());
      });
      expect(reads).toBeLessThanOrEqual(preparationBudget);
      reads = 0;
      for (let minute = 1; minute <= 30; minute++) {
        act(() => tree!.update(chart(history, domain, minute * MINUTE)));
      }
      expect(reads).toBe(0);
      const nextHistory = [...history];
      act(() => tree!.update(chart(nextHistory)));
      expect(reads).toBeGreaterThan(0);
      expect(reads).toBeLessThanOrEqual(preparationBudget);
      reads = 0;
      act(() =>
        tree!.update(chart(nextHistory, [new Date(0), new Date(20 * MINUTE)])),
      );
      expect(reads).toBeGreaterThan(0);
      expect(reads).toBeLessThanOrEqual(preparationBudget);
    } finally {
      if (tree) {
        act(() => tree!.unmount());
      }
    }
  });
});
