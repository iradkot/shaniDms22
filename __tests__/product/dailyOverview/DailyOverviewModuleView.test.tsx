import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import type {
  DailyOverviewDataSource,
  DailyOverviewPeriod,
  DailyOverviewSourceSnapshot,
} from 'app/modules/dailyOverview';
import {DailyOverviewModuleView} from 'app/product/dailyOverview';

const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
} as const;

const localNoon = (year: number, month: number, day: number): number =>
  new Date(year, month, day, 12).getTime();

const renderedText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return Array.isArray(value) ? value.map(renderedText).join('') : '';
};

const textValues = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).map(node => renderedText(node.props.children));

const textByTestId = (
  tree: renderer.ReactTestRenderer,
  testID: string,
): string | undefined => {
  const node = tree.root
    .findAllByProps({testID})
    .find(candidate => candidate.type === Text);
  return node ? renderedText(node.props.children) : undefined;
};

const dataSource = (
  load: (period: DailyOverviewPeriod) => Promise<DailyOverviewSourceSnapshot>,
): DailyOverviewDataSource => ({loadDailyOverview: load});

const availableSnapshot = (
  period: DailyOverviewPeriod,
  valueMgDl: number,
): DailyOverviewSourceSnapshot => ({
  glucoseSamples: [
    {timestampMs: period.startMs, valueMgDl},
    {
      timestampMs: period.startMs + (period.endMs - period.startMs) / 2,
      valueMgDl: valueMgDl + 20,
    },
  ],
  insulinSummary: {quality: 'available', basalUnits: 7, bolusUnits: 3},
});

describe('DailyOverviewModuleView', () => {
  it('honors a typed day focus and renders factual glucose and available insulin data', async () => {
    const focusedDay = new Date(2026, 0, 12).getTime();
    const load = jest.fn(async (period: DailyOverviewPeriod) =>
      availableSnapshot(period, 60),
    );
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <DailyOverviewModuleView
          dataSource={dataSource(load)}
          expectedSampleIntervalMs={12 * 60 * 60 * 1000}
          focus={{kind: 'day', dayStartMs: focusedDay}}
          locale="en"
          now={() => localNoon(2026, 0, 15)}
          thresholds={thresholds}
        />,
      );
    });

    expect(load).toHaveBeenCalledWith({
      startMs: focusedDay,
      endMs: new Date(2026, 0, 13).getTime(),
    });
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'Daily overview',
        'Data coverage',
        '100%',
        'Very low',
        'Low',
        'In range',
        'High',
        'Very high',
        'Mean',
        'Minimum',
        'Maximum',
        'CV',
        'Insulin',
        'Total',
        'Basal',
        'Bolus',
      ]),
    );
    expect(textByTestId(tree!, 'daily-overview-insulin-total')).toBe('10 U');
    act(() => tree!.unmount());
  });

  it('uses Hebrew RTL copy and does not show numeric insulin cards when unavailable', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DailyOverviewModuleView
          dataSource={dataSource(async period => ({
            glucoseSamples: [
              {timestampMs: period.startMs, valueMgDl: 120},
            ],
            insulinSummary: {quality: 'unavailable'},
          }))}
          locale="he"
          now={() => localNoon(2026, 0, 15)}
          thresholds={thresholds}
        />,
      );
    });

    expect(textValues(tree!)).toEqual(
      expect.arrayContaining(['מבט יומי', 'נתוני אינסולין אינם זמינים ליום זה.']),
    );
    expect(
      tree!.root.findAllByProps({testID: 'daily-overview-insulin-total'}),
    ).toHaveLength(0);
    expect(
      tree!.root.findByProps({testID: 'daily-overview-day-controls'}).props
        .style,
    ).toEqual(expect.arrayContaining([expect.objectContaining({flexDirection: 'row-reverse'})]));
    act(() => tree!.unmount());
  });

  it('supports previous, next, and today while ignoring a stale day response', async () => {
    const pending: Array<{
      period: DailyOverviewPeriod;
      resolve: (snapshot: DailyOverviewSourceSnapshot) => void;
    }> = [];
    const source = dataSource(
      period =>
        new Promise(resolve => {
          pending.push({period, resolve});
        }),
    );
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <DailyOverviewModuleView
          dataSource={source}
          expectedSampleIntervalMs={12 * 60 * 60 * 1000}
          locale="en"
          now={() => localNoon(2026, 0, 15)}
          thresholds={thresholds}
        />,
      );
    });
    expect(pending).toHaveLength(1);

    act(() =>
      tree!.root.findByProps({testID: 'daily-overview-previous'}).props.onPress(),
    );
    expect(pending).toHaveLength(2);

    await act(async () => {
      pending[1]!.resolve(availableSnapshot(pending[1]!.period, 120));
      await Promise.resolve();
    });
    expect(textByTestId(tree!, 'daily-overview-mean')).toBe('130 mg/dL');

    await act(async () => {
      pending[0]!.resolve(availableSnapshot(pending[0]!.period, 200));
      await Promise.resolve();
    });
    expect(textByTestId(tree!, 'daily-overview-mean')).toBe('130 mg/dL');

    act(() =>
      tree!.root.findByProps({testID: 'daily-overview-next'}).props.onPress(),
    );
    expect(pending).toHaveLength(3);
    expect(pending[2]!.period.startMs).toBe(new Date(2026, 0, 15).getTime());
    expect(
      tree!.root.findByProps({testID: 'daily-overview-next'}).props
        .accessibilityState,
    ).toEqual({disabled: true});

    act(() =>
      tree!.root.findByProps({testID: 'daily-overview-previous'}).props.onPress(),
    );
    act(() =>
      tree!.root.findByProps({testID: 'daily-overview-today'}).props.onPress(),
    );
    expect(pending[pending.length - 1]!.period.startMs).toBe(
      new Date(2026, 0, 15).getTime(),
    );
    act(() => tree!.unmount());
  });

  it('shows a retry action after an error and loads again', async () => {
    const load = jest
      .fn<Promise<DailyOverviewSourceSnapshot>, [DailyOverviewPeriod]>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async period => availableSnapshot(period, 100));
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <DailyOverviewModuleView
          dataSource={dataSource(load)}
          locale="en"
          now={() => localNoon(2026, 0, 15)}
          thresholds={thresholds}
        />,
      );
    });
    expect(tree!.root.findByProps({testID: 'daily-overview-error'})).toBeTruthy();

    await act(async () => {
      tree!.root.findByProps({testID: 'daily-overview-retry'}).props.onPress();
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(tree!.root.findByProps({testID: 'daily-overview-content'})).toBeTruthy();
    act(() => tree!.unmount());
  });
});
