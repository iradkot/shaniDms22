import {
  buildChartLoadSeries,
  findNearestLoadPoint,
} from '../src/utils/chartLoadSeries.utils';
import {
  filterFoodItemsToRange,
  filterInsulinDataToRange,
} from '../src/utils/nightscoutTreatments.utils';
import {findClosestBgSample} from '../src/components/charts/CgmGraph/utils';
import type {BgSample} from '../src/types/day_bgs.types';
import type {InsulinDataEntry} from '../src/types/insulin.types';

function bg(date: number, values: Partial<BgSample> = {}): BgSample {
  return {
    sgv: 100,
    date,
    dateString: new Date(date).toISOString(),
    trend: 0,
    direction: 'Flat',
    device: 'test',
    type: 'sgv',
    ...values,
  };
}

describe('chart data integrity', () => {
  it('uses one consistent IOB total and scales split areas to that total', () => {
    const series = buildChartLoadSeries(
      [bg(1_000, {iob: 3, iobBolus: 1, iobBasal: 1})],
      [new Date(0), new Date(2_000)],
    );

    expect(series.iobPoints).toEqual([{x: 1_000, y: 3}]);
    expect(series.splitIobPoints[0]).toEqual({
      x: 1_000,
      bolus: 1.5,
      basal: 1.5,
      total: 3,
    });
  });

  it('does not invent a missing half of split IOB', () => {
    const series = buildChartLoadSeries(
      [bg(1_000, {iob: 2, iobBolus: 2})],
      [new Date(0), new Date(2_000)],
    );

    expect(series.iobPoints).toEqual([{x: 1_000, y: 2}]);
    expect(series.splitIobPoints).toEqual([]);
  });

  it('does not show stale IOB or COB at a distant cursor time', () => {
    expect(findNearestLoadPoint([{x: 0, y: 2}], 11 * 60_000)).toBeNull();
    expect(findNearestLoadPoint([{x: 0, y: 2}], 10 * 60_000)).toEqual({
      x: 0,
      y: 2,
    });
  });

  it('retains a temp basal that starts before and overlaps the chart range', () => {
    const entries: InsulinDataEntry[] = [
      {
        type: 'tempBasal',
        rate: 1.5,
        duration: 120,
        timestamp: new Date(0).toISOString(),
      },
      {type: 'bolus', amount: 2, timestamp: new Date(0).toISOString()},
      {type: 'bolus', amount: 1, timestamp: new Date(90 * 60_000).toISOString()},
    ];

    const filtered = filterInsulinDataToRange(
      entries,
      60 * 60_000,
      180 * 60_000,
    );

    expect(filtered.map(entry => entry.type)).toEqual(['tempBasal', 'bolus']);
  });

  it('keeps carb events inside the visible range only', () => {
    const filtered = filterFoodItemsToRange(
      [
        {id: 'before', timestamp: 10, carbs: 10, name: '', image: '', notes: '', score: 0},
        {id: 'inside', timestamp: 20, carbs: 20, name: '', image: '', notes: '', score: 0},
      ],
      15,
      25,
    );

    expect(filtered.map(item => item.id)).toEqual(['inside']);
  });

  it('finds the closest CGM sample in ascending and descending input', () => {
    const ascending = [bg(0), bg(5), bg(10)];
    const descending = [...ascending].reverse();

    expect(findClosestBgSample(6, ascending)?.date).toBe(5);
    expect(findClosestBgSample(6, descending)?.date).toBe(5);
  });
});
