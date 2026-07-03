import {buildComparisonRows} from '../src/containers/MainTabsNavigator/Containers/Trends/components/CompareSection';
import {calculateTrendsMetrics} from '../src/containers/MainTabsNavigator/Containers/Trends/utils/trendsCalculations';
import {BgSample} from '../src/types/day_bgs.types';

describe('comparison table rows', () => {
  it('formats TIR as a real percentage instead of the internal 0..1 ratio', () => {
    const currentBgData = [
      bgSample(new Date(2026, 6, 1, 8, 0), 100),
      bgSample(new Date(2026, 6, 1, 8, 5), 110),
      bgSample(new Date(2026, 6, 1, 8, 10), 120),
      bgSample(new Date(2026, 6, 1, 8, 15), 130),
      bgSample(new Date(2026, 6, 1, 8, 20), 210),
    ];
    const previousBgData = [
      bgSample(new Date(2026, 5, 24, 8, 0), 100),
      bgSample(new Date(2026, 5, 24, 8, 5), 110),
      bgSample(new Date(2026, 5, 24, 8, 10), 210),
      bgSample(new Date(2026, 5, 24, 8, 15), 220),
    ];

    const rows = buildComparisonRows({
      language: 'he',
      rangeDays: 1,
      currentBgData,
      previousBgData,
      currentMetrics: calculateTrendsMetrics(currentBgData),
      previousMetrics: calculateTrendsMetrics(previousBgData),
    });

    expect(rows.find(row => row.key === 'tir')?.current.value).toBe('80.0 %');
    expect(rows.find(row => row.key === 'tir')?.previous.value).toBe('50.0 %');
  });

  it('ignores invalid readings when formatting average glucose', () => {
    const currentBgData = [
      bgSample(new Date(2026, 6, 1, 8, 0), 100),
      bgSample(new Date(2026, 6, 1, 8, 5), Number.NaN),
      bgSample(new Date(2026, 6, 1, 8, 10), 120),
    ];
    const previousBgData = [
      bgSample(new Date(2026, 5, 24, 8, 0), 90),
      bgSample(new Date(2026, 5, 24, 8, 5), 110),
    ];

    const rows = buildComparisonRows({
      language: 'he',
      rangeDays: 1,
      currentBgData,
      previousBgData,
      currentMetrics: calculateTrendsMetrics(currentBgData),
      previousMetrics: calculateTrendsMetrics(previousBgData),
    });

    expect(rows.find(row => row.key === 'avg-bg')?.current.value).toBe(
      '110.0 mg/dL',
    );
    expect(rows.find(row => row.key === 'avg-bg')?.previous.value).toBe(
      '100.0 mg/dL',
    );
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
