import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Pressable, Text} from 'react-native';
import type {
  TrendsDataSource,
  TrendsGlucoseSample,
  TrendsPeriod,
} from 'app/modules/trends';
import {TrendsOverviewModuleView} from 'app/product/trends';
import {buildDailyTrends} from 'app/product/trends/buildDailyTrends';

const DAY = 24 * 60 * 60 * 1000;

const source = (
  load: (period: TrendsPeriod) => Promise<readonly TrendsGlucoseSample[]>,
): TrendsDataSource => ({loadGlucoseSamples: load});

const renderedText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return Array.isArray(value) ? value.map(renderedText).join('') : '';
};

const textValues = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root
    .findAllByType(Text)
    .map(node => renderedText(node.props.children))
    .filter(Boolean);

const textByTestId = (
  tree: renderer.ReactTestRenderer,
  testID: string,
): string | undefined =>
  tree.root.findAllByProps({testID}).find(node => node.type === Text)
    ? renderedText(
        tree.root.findAllByProps({testID}).find(node => node.type === Text)
          ?.props.children,
      )
    : undefined;

describe('TrendsOverviewModuleView', () => {
  const thresholds = {
    veryLowMaxMgDl: 54,
    targetMinMgDl: 70,
    targetMaxMgDl: 180,
    highMaxMgDl: 250,
  } as const;

  it('loads matched periods and presents coverage, five ranges, GMI, mean, and CV', async () => {
    const load = jest.fn(async (period: TrendsPeriod) =>
      Array.from({length: 28}, (_, index) => ({
        timestampMs: period.startMs + index * (12 * 60 * 60 * 1000),
        valueMgDl: index % 2 === 0 ? 100 : 140,
      })),
    );
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <TrendsOverviewModuleView
          dataSource={source(load)}
          expectedSampleIntervalMs={12 * 60 * 60 * 1000}
          locale="en"
          now={() => 100 * DAY}
          onOpenHypoInvestigation={jest.fn()}
          thresholds={thresholds}
        />,
      );
    });

    expect(load).toHaveBeenCalledTimes(2);
    const loadedPeriods = load.mock.calls.map(call => call[0]);
    expect(loadedPeriods[0]!.endMs - loadedPeriods[0]!.startMs).toBe(14 * DAY);
    expect(loadedPeriods[1]!.endMs).toBe(loadedPeriods[0]!.startMs);
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'Data coverage',
        '100%',
        'Very low',
        'Low',
        'In range',
        'High',
        'Very high',
        'Mean glucose',
        'GMI',
        'CV',
        'Matched previous period',
      ]),
    );
    expect(
      tree!.root.findByProps({testID: 'trends-overview-ranges'}),
    ).toBeTruthy();
    expect(
      tree!.root.findByProps({testID: 'trends-evidence-metadata'}),
    ).toBeTruthy();
    act(() => tree!.unmount());
  });

  it('offers a contextual Hypo investigation with the selected period', async () => {
    const onOpen = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <TrendsOverviewModuleView
          dataSource={source(async period => [
            {timestampMs: period.startMs, valueMgDl: 50},
          ])}
          locale="he"
          now={() => 100 * DAY}
          onOpenHypoInvestigation={onOpen}
          thresholds={thresholds}
        />,
      );
    });

    const lowLink = tree!.root
      .findAllByProps({testID: 'trends-open-hypo-investigation'})
      .find(node => node.type === Pressable);
    expect(lowLink?.props.accessibilityRole).toBe('button');
    act(() => lowLink?.props.onPress());
    expect(onOpen).toHaveBeenCalledWith({
      startMs: 86 * DAY,
      endMs: 100 * DAY,
    });
    expect(textValues(tree!)).toContain('כיסוי נתונים נמוך — יש לפרש בזהירות');
    act(() => tree!.unmount());
  });

  it('ignores a late response from a previously selected range', async () => {
    const pending: Array<{
      period: TrendsPeriod;
      resolve: (samples: readonly TrendsGlucoseSample[]) => void;
    }> = [];
    const dataSource = source(
      period =>
        new Promise(resolve => {
          pending.push({period, resolve});
        }),
    );
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <TrendsOverviewModuleView
          dataSource={dataSource}
          expectedSampleIntervalMs={DAY}
          locale="en"
          now={() => 100 * DAY}
          onOpenHypoInvestigation={jest.fn()}
          thresholds={thresholds}
        />,
      );
    });
    expect(pending).toHaveLength(2);

    act(() =>
      tree!.root.findByProps({testID: 'trends-range-7'}).props.onPress(),
    );
    expect(pending).toHaveLength(4);
    await act(async () => {
      pending[2]!.resolve(
        Array.from({length: 7}, (_, index) => ({
          timestampMs: pending[2]!.period.startMs + index * DAY,
          valueMgDl: 130,
        })),
      );
      pending[3]!.resolve(
        Array.from({length: 7}, (_, index) => ({
          timestampMs: pending[3]!.period.startMs + index * DAY,
          valueMgDl: 120,
        })),
      );
      await Promise.resolve();
    });
    expect(textByTestId(tree!, 'trends-overview-mean')).toBe('130 mg/dL');

    await act(async () => {
      pending[0]!.resolve(
        Array.from({length: 14}, (_, index) => ({
          timestampMs: pending[0]!.period.startMs + index * DAY,
          valueMgDl: 200,
        })),
      );
      pending[1]!.resolve(
        Array.from({length: 14}, (_, index) => ({
          timestampMs: pending[1]!.period.startMs + index * DAY,
          valueMgDl: 200,
        })),
      );
      await Promise.resolve();
    });
    expect(textByTestId(tree!, 'trends-overview-mean')).toBe('130 mg/dL');
    act(() => tree!.unmount());
  });

  it('displays exact thresholds and sample-based TIR, including all five bands', async () => {
    const customThresholds = {
      veryLowMaxMgDl: 55,
      targetMinMgDl: 75,
      targetMaxMgDl: 170,
      highMaxMgDl: 240,
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <TrendsOverviewModuleView
          dataSource={source(async period =>
            [40, 55, 75, 170, 171, 240, 241].map((valueMgDl, index) => ({
              timestampMs: period.startMs + index * 1000,
              valueMgDl,
            })),
          )}
          locale="en"
          now={() => 100 * DAY}
          onOpenHypoInvestigation={jest.fn()}
          thresholds={customThresholds}
          timeZoneOffsetMinutes={0}
        />,
      );
    });
    expect(textByTestId(tree!, 'trends-overview-tir')).toBe('28.57%');
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        '<55',
        '55–<75',
        '75–170',
        '>170–240',
        '>240',
        'Share of recorded glucose readings',
      ]),
    );
    expect(
      tree!.root.findByProps({testID: 'trends-overview-range-ring'}),
    ).toBeTruthy();
    act(() => tree!.unmount());
  });

  it('selects daily details and missing days without loading the period again', async () => {
    const load = jest.fn(async (period: TrendsPeriod) =>
      Array.from({length: 13}, (_, index) => ({
        timestampMs: period.startMs + index * DAY,
        valueMgDl: index === 10 ? 190 : 110,
      })),
    );
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <TrendsOverviewModuleView
          dataSource={source(load)}
          expectedSampleIntervalMs={DAY}
          locale="he"
          now={() => 100 * DAY}
          onOpenHypoInvestigation={jest.fn()}
          thresholds={thresholds}
          timeZoneOffsetMinutes={0}
        />,
      );
    });
    expect(textValues(tree!)).toContain('אין קריאות ביום הזה');
    const day = tree!.root.findByProps({testID: 'trends-day-10'});
    expect(day.props.accessibilityLabel).toContain('0%');
    act(() => day.props.onPress());
    expect(textValues(tree!)).toContain('190 mg/dL');
    expect(textValues(tree!)).not.toContain('אין קריאות ביום הזה');
    act(() =>
      tree!.root.findByProps({testID: 'trends-days-previous'}).props.onPress(),
    );
    expect(tree!.root.findByProps({testID: 'trends-day-0'})).toBeTruthy();
    expect(load).toHaveBeenCalledTimes(2);
    act(() => tree!.unmount());
  });

  it('keeps comparison values neutral and gates GRI and deltas on duration', async () => {
    const end = 100 * DAY;
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <TrendsOverviewModuleView
          dataSource={source(async period =>
            Array.from(
              {length: Math.round((period.endMs - period.startMs) / DAY)},
              (_, index) => ({
                timestampMs: period.startMs + index * DAY,
                valueMgDl: period.endMs === end ? 200 : 120,
              }),
            ),
          )}
          expectedSampleIntervalMs={DAY}
          locale="en"
          now={() => end}
          onOpenHypoInvestigation={jest.fn()}
          thresholds={thresholds}
          showGri
          timeZoneOffsetMinutes={0}
        />,
      );
    });
    expect(textByTestId(tree!, 'trends-comparison-mean-delta')).toBe(
      '+80 mg/dL',
    );
    expect(textByTestId(tree!, 'trends-comparison-target-delta')).toBe(
      '-100 pp',
    );
    expect(textByTestId(tree!, 'trends-overview-gri-score')).toBe('80');
    await act(async () =>
      tree!.root.findByProps({testID: 'trends-range-7'}).props.onPress(),
    );
    expect(textByTestId(tree!, 'trends-overview-gmi')).toBeUndefined();
    expect(
      tree!.root.findAllByProps({testID: 'trends-overview-gri'}),
    ).toHaveLength(0);
    expect(
      tree!.root.findAllByProps({testID: 'trends-comparison-mean-delta'}),
    ).toHaveLength(0);
    expect(textValues(tree!)).toContain(
      'Deltas are withheld until both equal periods have adequate coverage.',
    );
    act(() => tree!.unmount());
  });

  it('shows no-data coverage without empty charts or fabricated values', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <TrendsOverviewModuleView
          dataSource={source(async () => [])}
          locale="en"
          now={() => 100 * DAY}
          onOpenHypoInvestigation={jest.fn()}
          thresholds={thresholds}
          showGri
        />,
      );
    });
    expect(textByTestId(tree!, 'trends-overview-coverage')).toBe('0%');
    expect(textValues(tree!)).toContain('No glucose readings in this period');
    for (const testID of [
      'trends-overview-range-ring',
      'trends-overview-daily',
      'trends-overview-mean',
      'trends-overview-gri',
      'trends-open-hypo-investigation',
    ]) {
      expect(tree!.root.findAllByProps({testID})).toHaveLength(0);
    }
    act(() => tree!.unmount());
  });

  it('builds clipped local days using the shared duplicate and sample validity rules', () => {
    const hour = DAY / 24;
    const startMs = Date.UTC(2026, 8, 7, 12);
    const localMidnight = Date.UTC(2026, 8, 7, 21);
    const endMs = startMs + 3 * DAY;
    const days = buildDailyTrends({
      period: {startMs, endMs},
      expectedSampleIntervalMs: hour,
      timeZoneOffsetMinutes: 180,
      thresholds,
      samples: [
        {timestampMs: startMs, valueMgDl: 110},
        {timestampMs: startMs, valueMgDl: 350},
        {timestampMs: localMidnight - 1, valueMgDl: 130},
        {timestampMs: localMidnight, valueMgDl: 200},
        {timestampMs: localMidnight + hour, valueMgDl: -1},
        {timestampMs: endMs, valueMgDl: 100},
      ],
    });
    expect(days).toHaveLength(4);
    expect(days[0]!.partialDay).toBe(true);
    expect(days[0]!.overview.period).toEqual({startMs, endMs: localMidnight});
    expect(days[0]!.overview.meanGlucoseMgDl).toBe(120);
    expect(days[0]!.overview.ranges?.targetPercent).toBe(100);
    expect(days[0]!.overview.expectedSampleCount).toBe(9);
    expect(days[1]!.overview.meanGlucoseMgDl).toBe(200);
    expect(days[1]!.overview.ranges?.highPercent).toBe(100);
    expect(days[1]!.partialDay).toBe(false);
    expect(days[2]!.overview.coverageQuality).toBe('no-data');
    expect(days[2]!.overview.meanGlucoseMgDl).toBeUndefined();
    expect(days[3]!.partialDay).toBe(true);
    expect(days[3]!.overview.period.endMs).toBe(endMs);
  });
});
