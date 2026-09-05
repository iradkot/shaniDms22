import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {StyleSheet, Text} from 'react-native';
import type {
  TrendsDataSource,
  TrendsGlucoseSample,
  TrendsPeriod,
} from 'app/modules/trends';
import {ComparePeriodsModuleView} from 'app/product/trends/ComparePeriodsModuleView';

const DAY_MS = 24 * 60 * 60 * 1000;
const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
} as const;

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
): string => renderedText(tree.root.findByProps({testID}).props.children);

const samplesFor = (
  period: TrendsPeriod,
  valueMgDl: number,
): readonly TrendsGlucoseSample[] =>
  Array.from({length: 14}, (_, index) => ({
    timestampMs: period.startMs + index * DAY_MS,
    valueMgDl,
  }));

describe('ComparePeriodsModuleView', () => {
  it('loads adjacent equal 14-day periods and presents both with neutral signed differences', async () => {
    const load = jest.fn(async (period: TrendsPeriod) =>
      samplesFor(period, period.endMs === 100 * DAY_MS ? 140 : 120),
    );
    const dataSource: TrendsDataSource = {loadGlucoseSamples: load};
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ComparePeriodsModuleView
          dataSource={dataSource}
          expectedSampleIntervalMs={DAY_MS}
          locale="en"
          now={() => 100 * DAY_MS}
          thresholds={thresholds}
        />,
      );
    });

    expect(load.mock.calls.map(call => call[0])).toEqual([
      {startMs: 86 * DAY_MS, endMs: 100 * DAY_MS},
      {startMs: 72 * DAY_MS, endMs: 86 * DAY_MS},
    ]);
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'Compare periods',
        'Selected period',
        'Previous period',
        '100% coverage',
        'Duration sufficient (14+ days)',
        'Target range: 70–180 mg/dL',
        'Selected period minus previous period',
      ]),
    );
    expect(
      StyleSheet.flatten(
        tree!.root.findByProps({testID: 'compare-periods-pair'}).props.style,
      ).flexDirection,
    ).toBe('row');
    expect(textByTestId(tree!, 'compare-periods-mean-delta')).toBe('+20 mg/dL');
    expect(textByTestId(tree!, 'compare-periods-gmi-delta')).toBe('+0.5 pp');
    expect(textByTestId(tree!, 'compare-periods-very-low-delta')).toBe('0 pp');
    expect(textByTestId(tree!, 'compare-periods-low-delta')).toBe('0 pp');
    expect(textByTestId(tree!, 'compare-periods-target-delta')).toBe('0 pp');
    expect(textByTestId(tree!, 'compare-periods-high-delta')).toBe('0 pp');
    expect(textByTestId(tree!, 'compare-periods-very-high-delta')).toBe('0 pp');
    expect(textByTestId(tree!, 'compare-periods-cv-delta')).toBe('0 pp');
    expect(tree!.root.findByProps({testID: 'trends-evidence-metadata'})).toBeTruthy();
    act(() => tree!.unmount());
  });

  it('withholds 7-day differences, explains duration sufficiency, and mirrors Hebrew layout', async () => {
    const load = jest.fn(async (period: TrendsPeriod) =>
      samplesFor(period, period.endMs === 100 * DAY_MS ? 130 : 120),
    );
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ComparePeriodsModuleView
          dataSource={{loadGlucoseSamples: load}}
          expectedSampleIntervalMs={DAY_MS}
          locale="he"
          now={() => 100 * DAY_MS}
          thresholds={thresholds}
        />,
      );
    });
    await act(async () => {
      tree!.root
        .findByProps({testID: 'compare-periods-range-7'})
        .props.onPress();
    });

    expect(load.mock.calls.slice(-2).map(call => call[0])).toEqual([
      {startMs: 93 * DAY_MS, endMs: 100 * DAY_MS},
      {startMs: 86 * DAY_MS, endMs: 93 * DAY_MS},
    ]);
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'השוואת תקופות',
        'התקופה שנבחרה',
        'התקופה הקודמת',
        'משך קצר מ־14 ימים',
        'ההפרשים מוסתרים עד שלשתי התקופות יהיו לפחות 14 ימים וכיסוי של 70%.',
      ]),
    );
    expect(
      tree!.root.findAllByProps({testID: 'compare-periods-mean-delta'}),
    ).toHaveLength(0);
    expect(
      StyleSheet.flatten(
        tree!.root.findByProps({testID: 'compare-periods-pair'}).props.style,
      ).flexDirection,
    ).toBe('row-reverse');
    act(() => tree!.unmount());
  });

  it('shows both coverage levels and withholds differences when either period is not representative', async () => {
    const load = jest.fn(async (period: TrendsPeriod) =>
      Array.from(
        {length: period.endMs === 100 * DAY_MS ? 14 : 7},
        (_, index) => ({
          timestampMs: period.startMs + index * DAY_MS,
          valueMgDl: 120,
        }),
      ),
    );
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ComparePeriodsModuleView
          dataSource={{loadGlucoseSamples: load}}
          expectedSampleIntervalMs={DAY_MS}
          locale="en"
          now={() => 100 * DAY_MS}
          thresholds={thresholds}
        />,
      );
    });

    const texts = textValues(tree!);
    expect(texts).toEqual(
      expect.arrayContaining([
        '100% coverage',
        '50% coverage',
        'Coverage below 70%',
        'Signed differences are hidden until both periods have at least 14 days and 70% coverage.',
      ]),
    );
    expect(
      tree!.root.findAllByProps({testID: 'compare-periods-mean-delta'}),
    ).toHaveLength(0);
    act(() => tree!.unmount());
  });

  it('shows a load error and retries both periods', async () => {
    let failing = true;
    const load = jest.fn(async (period: TrendsPeriod) => {
      if (failing) {
        throw new Error('source unavailable');
      }
      return samplesFor(period, 120);
    });
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ComparePeriodsModuleView
          dataSource={{loadGlucoseSamples: load}}
          expectedSampleIntervalMs={DAY_MS}
          locale="en"
          now={() => 100 * DAY_MS}
          thresholds={thresholds}
        />,
      );
    });

    expect(
      tree!.root.findByProps({testID: 'compare-periods-error'}),
    ).toBeTruthy();
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'The period data could not be loaded.',
        'source unavailable',
        'Try again',
      ]),
    );

    failing = false;
    await act(async () => {
      tree!.root.findByProps({testID: 'compare-periods-retry'}).props.onPress();
    });

    expect(load).toHaveBeenCalledTimes(4);
    expect(
      tree!.root.findByProps({testID: 'compare-periods-pair'}),
    ).toBeTruthy();
    act(() => tree!.unmount());
  });

  it('keeps loading visible and ignores late results from the previously selected duration', async () => {
    const pending: Array<{
      period: TrendsPeriod;
      resolve: (samples: readonly TrendsGlucoseSample[]) => void;
    }> = [];
    const load = jest.fn(
      (period: TrendsPeriod) =>
        new Promise<readonly TrendsGlucoseSample[]>(resolve => {
          pending.push({period, resolve});
        }),
    );
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <ComparePeriodsModuleView
          dataSource={{loadGlucoseSamples: load}}
          expectedSampleIntervalMs={DAY_MS}
          locale="en"
          now={() => 100 * DAY_MS}
          thresholds={thresholds}
        />,
      );
    });
    expect(
      tree!.root.findByProps({testID: 'compare-periods-loading'}),
    ).toBeTruthy();

    act(() => {
      tree!.root
        .findByProps({testID: 'compare-periods-range-30'})
        .props.onPress();
    });
    expect(pending).toHaveLength(4);

    await act(async () => {
      pending[2]!.resolve(
        Array.from({length: 30}, (_, index) => ({
          timestampMs: pending[2]!.period.startMs + index * DAY_MS,
          valueMgDl: 150,
        })),
      );
      pending[3]!.resolve(
        Array.from({length: 30}, (_, index) => ({
          timestampMs: pending[3]!.period.startMs + index * DAY_MS,
          valueMgDl: 120,
        })),
      );
      await Promise.resolve();
    });
    expect(textByTestId(tree!, 'compare-periods-mean-delta')).toBe('+30 mg/dL');

    await act(async () => {
      pending[0]!.resolve(samplesFor(pending[0]!.period, 220));
      pending[1]!.resolve(samplesFor(pending[1]!.period, 220));
      await Promise.resolve();
    });
    expect(textByTestId(tree!, 'compare-periods-mean-delta')).toBe('+30 mg/dL');
    act(() => tree!.unmount());
  });
});
