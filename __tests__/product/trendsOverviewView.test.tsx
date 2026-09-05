import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Pressable, Text} from 'react-native';
import type {
  TrendsDataSource,
  TrendsGlucoseSample,
  TrendsPeriod,
} from 'app/modules/trends';
import {TrendsOverviewModuleView} from 'app/product/trends';

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
  tree.root
    .findAllByProps({testID})
    .find(node => node.type === Text)
    ? renderedText(
        tree.root
          .findAllByProps({testID})
          .find(node => node.type === Text)?.props.children,
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
    expect(tree!.root.findByProps({testID: 'trends-overview-ranges'})).toBeTruthy();
    expect(tree!.root.findByProps({testID: 'trends-evidence-metadata'})).toBeTruthy();
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
});
