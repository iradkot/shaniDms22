import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Pressable, Text} from 'react-native';
import type {
  TrendsDataSource,
  TrendsGlucoseSample,
  TrendsPeriod,
} from 'app/modules/trends';
import {AgpModuleView} from 'app/product/trends/AgpModuleView';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

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

describe('AgpModuleView', () => {
  it('loads a 14-day profile and exposes each hourly percentile row accessibly', async () => {
    const samples = [
      ...[40, 80, 120, 160, 200].map((valueMgDl, day) => ({
        timestampMs: 86 * DAY_MS + day * DAY_MS + HOUR_MS,
        valueMgDl,
      })),
      ...Array.from({length: 9}, (_, index) => ({
        timestampMs: 91 * DAY_MS + index * DAY_MS + 2 * HOUR_MS,
        valueMgDl: 110,
      })),
    ];
    const load = jest.fn(
      async (_period: TrendsPeriod): Promise<readonly TrendsGlucoseSample[]> =>
        samples,
    );
    const dataSource: TrendsDataSource = {loadGlucoseSamples: load};
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <AgpModuleView
          dataSource={dataSource}
          expectedSampleIntervalMs={DAY_MS}
          locale="en"
          now={() => 100 * DAY_MS}
          timeZoneOffsetMinutes={0}
        />,
      );
    });

    expect(load).toHaveBeenCalledWith({
      startMs: 86 * DAY_MS,
      endMs: 100 * DAY_MS,
    });
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'AGP & daily patterns',
        '100% coverage',
        'Representative 14-day view',
        '10–90%',
        '25–75%',
        'Median',
      ]),
    );
    const hour = tree!.root.findByProps({testID: 'agp-hour-01'});
    expect(hour.props.accessible).toBe(true);
    expect(hour.props.accessibilityLabel).toContain(
      '01:00. 5 readings. 10th to 90th percentile 56 to 184 mg/dL. 25th to 75th percentile 80 to 160 mg/dL. Median 120 mg/dL.',
    );
    const hourlyIds = new Set(
      tree!.root
        .findAll(
          node =>
            typeof node.props.testID === 'string' &&
            node.props.testID.startsWith('agp-hour-'),
        )
        .map(node => node.props.testID),
    );
    expect(hourlyIds.size).toBe(24);
    expect(
      tree!.root.findAll(
        node =>
          typeof node.props.testID === 'string' &&
          node.props.testID.startsWith('agp-day-'),
      ).length,
    ).toBeGreaterThanOrEqual(14);
    expect(tree!.root.findByProps({testID: 'trends-evidence-metadata'})).toBeTruthy();
    act(() => tree!.unmount());
  });

  it('opens an individual day without hiding its data gaps', async () => {
    const onOpenDay = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AgpModuleView
          dataSource={{
            loadGlucoseSamples: async period => [
              {timestampMs: period.startMs + HOUR_MS, valueMgDl: 120},
            ],
          }}
          expectedSampleIntervalMs={12 * HOUR_MS}
          locale="en"
          now={() => 100 * DAY_MS}
          onOpenDay={onOpenDay}
          timeZoneOffsetMinutes={0}
        />,
      );
    });

    const emptyDay = tree!.root.findByProps({testID: 'agp-day-87'});
    expect(renderedText(emptyDay.props.accessibilityLabel)).toContain(
      'No readings',
    );
    act(() => emptyDay.props.onPress());
    expect(onOpenDay).toHaveBeenCalledWith({
      dayStartMs: 87 * DAY_MS,
      dayEndMs: 88 * DAY_MS,
    });
    act(() => tree!.unmount());
  });

  it('shows loading and supports retry after a source error', async () => {
    let rejectFirst: ((reason: Error) => void) | undefined;
    const load = jest
      .fn<Promise<readonly TrendsGlucoseSample[]>, [TrendsPeriod]>()
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValueOnce([]);
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <AgpModuleView
          dataSource={{loadGlucoseSamples: load}}
          locale="en"
          now={() => 100 * DAY_MS}
          timeZoneOffsetMinutes={0}
        />,
      );
    });
    expect(tree!.root.findByProps({testID: 'agp-loading'})).toBeTruthy();

    await act(async () => {
      rejectFirst?.(new Error('offline'));
      await Promise.resolve();
    });
    expect(textValues(tree!)).toContain('The AGP data could not be loaded.');

    const retry = tree!.root
      .findAllByProps({testID: 'agp-retry'})
      .find(node => node.type === Pressable);
    await act(async () => {
      retry?.props.onPress();
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(textValues(tree!)).toContain(
      'No valid readings are available for this period.',
    );
    act(() => tree!.unmount());
  });

  it('reloads the selected range and labels seven days as a short view', async () => {
    const load = jest.fn(async (period: TrendsPeriod) => {
      const days = (period.endMs - period.startMs) / DAY_MS;
      return Array.from({length: days}, (_, index) => ({
        timestampMs: period.startMs + index * DAY_MS + HOUR_MS,
        valueMgDl: 120,
      }));
    });
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AgpModuleView
          dataSource={{loadGlucoseSamples: load}}
          expectedSampleIntervalMs={DAY_MS}
          locale="en"
          now={() => 100 * DAY_MS}
          timeZoneOffsetMinutes={0}
        />,
      );
    });

    await act(async () => {
      tree!.root.findByProps({testID: 'agp-range-7'}).props.onPress();
      await Promise.resolve();
    });

    expect(load).toHaveBeenLastCalledWith({
      startMs: 93 * DAY_MS,
      endMs: 100 * DAY_MS,
    });
    expect(textValues(tree!)).toContain(
      'Short view — a representative AGP needs at least 14 consecutive days.',
    );
    expect(
      tree!.root.findByProps({testID: 'agp-range-7'}).props.accessibilityState,
    ).toEqual({selected: true});
    act(() => tree!.unmount());
  });

  it('keeps data-quality and percentile meaning equivalent in Hebrew', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AgpModuleView
          dataSource={{
            loadGlucoseSamples: async period =>
              Array.from({length: 14}, (_, day) => ({
                timestampMs: period.startMs + day * DAY_MS + HOUR_MS,
                valueMgDl: 120,
              })),
          }}
          expectedSampleIntervalMs={DAY_MS}
          locale="he"
          now={() => 100 * DAY_MS}
          timeZoneOffsetMinutes={120}
        />,
      );
    });

    const values = textValues(tree!);
    expect(values).toEqual(
      expect.arrayContaining([
        'AGP ודפוסים יומיים',
        '100% כיסוי',
        'תצוגה מייצגת של 14 ימים',
        '10–90%',
        '25–75%',
        'חציון',
      ]),
    );
    expect(
      tree!.root.findByProps({testID: 'agp-hour-00'}).props.accessibilityLabel,
    ).toBe('00:00. אין קריאות.');
    expect(values.join(' ')).not.toMatch(/מינון|המלצה|dose|recommend/i);
    act(() => tree!.unmount());
  });

  it('ignores a late response from a previously selected period', async () => {
    const pending: Array<{
      period: TrendsPeriod;
      resolve: (samples: readonly TrendsGlucoseSample[]) => void;
    }> = [];
    const dataSource: TrendsDataSource = {
      loadGlucoseSamples: period =>
        new Promise(resolve => {
          pending.push({period, resolve});
        }),
    };
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AgpModuleView
          dataSource={dataSource}
          expectedSampleIntervalMs={DAY_MS}
          locale="en"
          now={() => 100 * DAY_MS}
          timeZoneOffsetMinutes={0}
        />,
      );
    });
    expect(pending).toHaveLength(1);

    act(() => tree!.root.findByProps({testID: 'agp-range-7'}).props.onPress());
    expect(pending).toHaveLength(2);
    await act(async () => {
      pending[1]!.resolve(
        Array.from({length: 7}, (_, day) => ({
          timestampMs: pending[1]!.period.startMs + day * DAY_MS + HOUR_MS,
          valueMgDl: 130,
        })),
      );
      await Promise.resolve();
    });
    expect(
      tree!.root.findByProps({testID: 'agp-hour-01'}).props.accessibilityLabel,
    ).toContain('Median 130 mg/dL.');

    await act(async () => {
      pending[0]!.resolve(
        Array.from({length: 14}, (_, day) => ({
          timestampMs: pending[0]!.period.startMs + day * DAY_MS + HOUR_MS,
          valueMgDl: 200,
        })),
      );
      await Promise.resolve();
    });
    expect(
      tree!.root.findByProps({testID: 'agp-hour-01'}).props.accessibilityLabel,
    ).toContain('Median 130 mg/dL.');
    act(() => tree!.unmount());
  });
});
