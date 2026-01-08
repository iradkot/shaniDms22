import {calculateTirBuckets} from 'app/containers/MainTabsNavigator/Containers/Home/components/TimeInRangeRow';
import {calculateTimeInRange as calculateAgpTimeInRange} from 'app/components/charts/AGPGraph/utils/statistics';
import {calculateTrendsMetrics} from 'app/containers/MainTabsNavigator/Containers/Trends/utils/trendsCalculations';
import {BgSample} from 'app/types/day_bgs.types';

describe('calculateTirBuckets', () => {
  it('splits samples into severe/normal low/target/high/severe high buckets', () => {
    const mk = (sgv: number, date: number): BgSample =>
      ({sgv, date} as unknown as BgSample);

    const bgData: BgSample[] = [
      mk(50, 1),
      mk(55, 2),
      mk(60, 3),
      mk(69, 4),
      mk(69, 5),
      mk(70, 6),
      mk(100, 7),
      mk(150, 8),
      mk(200, 9),
      mk(250, 10),
    ];

    const res = calculateTirBuckets(bgData);

    expect(Math.round(res.severeLow)).toBe(20);
    expect(Math.round(res.low)).toBe(30);
    expect(Math.round(res.target)).toBe(20);
    expect(Math.round(res.high)).toBe(20);
    expect(Math.round(res.severeHigh)).toBe(10);
  });

  it('handles empty and invalid samples safely', () => {
    expect(calculateTirBuckets([])).toEqual({
      severeLow: 0,
      low: 0,
      target: 0,
      high: 0,
      severeHigh: 0,
    });

    const bgData = [
      {sgv: NaN, date: 1},
      {sgv: 100, date: 2},
    ] as unknown as BgSample[];

    const res = calculateTirBuckets(bgData);
    expect(Math.round(res.target)).toBe(100);
  });

  it('AGP time-in-range includes TARGET.min in target bucket', () => {
    const mk = (sgv: number, date: number): BgSample =>
      ({sgv, date} as unknown as BgSample);

    const bgData: BgSample[] = [
      mk(69, 1),
      mk(70, 2),
      mk(70, 3),
      mk(71, 4),
    ];

    const res = calculateAgpTimeInRange(bgData);
    // 3/4 readings are in [70..140]
    expect(Math.round(res.target)).toBe(75);
    expect(Math.round(res.low)).toBe(25);
  });

  it('Trends TIR includes TARGET.min in range', () => {
    const mk = (sgv: number, date: number): BgSample =>
      ({sgv, date} as unknown as BgSample);

    const bgData: BgSample[] = [
      mk(69, 1),
      mk(70, 2),
      mk(70, 3),
      mk(71, 4),
    ];

    const metrics = calculateTrendsMetrics(bgData);
    expect(Number((metrics.tir * 100).toFixed(0))).toBe(75);
  });
});
