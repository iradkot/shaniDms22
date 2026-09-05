import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {StyleSheet, Text} from 'react-native';
import type {
  AuthoritativeLoopSettingChange,
  LoopChangesDataSource,
  LoopSettingChange,
} from 'app/modules/loopChanges';
import type {TrendsPeriod} from 'app/modules/trends';
import {LoopChangesModuleView} from 'app/product/loopChanges';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW_MS = 200 * DAY_MS;
const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
} as const;

const focusedChange: AuthoritativeLoopSettingChange = {
  id: 'change-focused',
  changedAtMs: 150 * DAY_MS,
  kind: 'carb_ratio',
  source: {
    authority: 'authoritative',
    kind: 'loop-ios',
    label: 'Loop profile history',
  },
  summary: 'Breakfast carbohydrate ratio updated',
  previousValue: {kind: 'scalar', value: 10, unit: 'g/U'},
  nextValue: {kind: 'scalar', value: 9, unit: 'g/U'},
};

const otherChange: LoopSettingChange = {
  id: 'change-other',
  changedAtMs: 140 * DAY_MS,
  kind: 'other',
  source: {
    authority: 'observed',
    kind: 'nightscout-profile',
    label: 'Nightscout note',
  },
  summary: 'A profile switch was recorded',
};

const renderedText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return Array.isArray(value) ? value.map(renderedText).join('') : '';
};

const allText = (tree: renderer.ReactTestRenderer): string =>
  tree.root
    .findAllByType(Text)
    .map(node => renderedText(node.props.children))
    .join('\n');

const textByTestId = (
  tree: renderer.ReactTestRenderer,
  testID: string,
): string => renderedText(tree.root.findByProps({testID}).props.children);

describe('LoopChangesModuleView', () => {
  it('opens a typed focused change without blocking on analysis and exposes explicit actions', async () => {
    const loadChanges = jest.fn(async () => [otherChange, focusedChange]);
    const loadGlucoseSamples = jest.fn(async (_period: TrendsPeriod) => []);
    const dataSource: LoopChangesDataSource = {
      loadChanges,
      loadGlucoseSamples,
    };
    const onOpenDayGraph = jest.fn();
    const onAskAiAdvisor = jest.fn();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <LoopChangesModuleView
          focus={{kind: 'loop-change', changeId: focusedChange.id}}
          locale="en"
          now={() => NOW_MS}
          runtime={{
            dataSource,
            thresholds,
            onAskAiAdvisor,
            onOpenDayGraph,
          }}
        />,
      );
    });

    expect(loadChanges).toHaveBeenCalledWith({
      startMs: NOW_MS - 90 * DAY_MS,
      endMs: NOW_MS,
    });
    expect(loadGlucoseSamples).not.toHaveBeenCalled();
    expect(tree!.root.findByProps({testID: 'loop-changes-detail'})).toBeTruthy();
    expect(allText(tree!)).toContain('Breakfast carbohydrate ratio updated');
    expect(allText(tree!)).toContain('Setting: Carbohydrate ratio');
    expect(allText(tree!)).toContain('10 g/U');
    expect(allText(tree!)).toContain('9 g/U');
    expect(allText(tree!)).toContain(
      'The advisor may suggest what to review. It cannot change Loop settings.',
    );

    act(() =>
      tree!.root.findByProps({testID: 'loop-changes-open-graph'}).props.onPress(),
    );
    act(() =>
      tree!.root.findByProps({testID: 'loop-changes-ask-ai'}).props.onPress(),
    );
    const expectedLocalDay = new Date(focusedChange.changedAtMs);
    expectedLocalDay.setHours(0, 0, 0, 0);
    expect(onOpenDayGraph).toHaveBeenCalledWith({
      changeId: focusedChange.id,
      dayStartMs: expectedLocalDay.getTime(),
    });
    expect(onAskAiAdvisor).toHaveBeenCalledWith({changeId: focusedChange.id});
    act(() => tree!.unmount());
  });

  it('loads equal before and after windows on demand and labels their deltas as observed, not causal', async () => {
    const loadGlucoseSamples = jest.fn(async (period: TrendsPeriod) =>
      Array.from({length: 14}, (_, index) => ({
        timestampMs: period.startMs + index * DAY_MS,
        valueMgDl: period.endMs === focusedChange.changedAtMs ? 100 : 200,
      })),
    );
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <LoopChangesModuleView
          focus={{kind: 'loop-change', changeId: focusedChange.id}}
          locale="en"
          now={() => NOW_MS}
          runtime={{
            dataSource: {
              loadChanges: async () => [focusedChange],
              loadGlucoseSamples,
            },
            expectedSampleIntervalMs: DAY_MS,
            thresholds,
            onAskAiAdvisor: jest.fn(),
            onOpenDayGraph: jest.fn(),
          }}
        />,
      );
    });

    await act(async () => {
      tree!.root
        .findByProps({testID: 'loop-changes-run-observation'})
        .props.onPress();
    });

    expect(loadGlucoseSamples.mock.calls.map(call => call[0])).toEqual([
      {
        startMs: focusedChange.changedAtMs - 14 * DAY_MS,
        endMs: focusedChange.changedAtMs,
      },
      {
        startMs: focusedChange.changedAtMs,
        endMs: focusedChange.changedAtMs + 14 * DAY_MS,
      },
    ]);
    expect(allText(tree!)).toContain('Observed differences');
    expect(allText(tree!)).toContain('Target range: 70–180 mg/dL');
    expect(textByTestId(tree!, 'loop-changes-before-metrics')).toBe(
      '100 mg/dL · 100% in range · 0% CV',
    );
    expect(textByTestId(tree!, 'loop-changes-after-metrics')).toBe(
      '200 mg/dL · 0% in range · 0% CV',
    );
    expect(allText(tree!)).toContain('+100 mg/dL');
    expect(allText(tree!)).toContain('-100 pp');
    expect(allText(tree!)).toContain('This is an association in the available data, not proof that the setting change caused it.');
    act(() => tree!.unmount());
  });

  it('shows each coverage level and withholds comparison metrics when either window misses a Trends gate', async () => {
    const loadGlucoseSamples = jest.fn(async (period: TrendsPeriod) =>
      Array.from(
        {
          length: period.endMs === focusedChange.changedAtMs ? 14 : 9,
        },
        (_, index) => ({
          timestampMs: period.startMs + index * DAY_MS,
          valueMgDl: 120,
        }),
      ),
    );
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <LoopChangesModuleView
          focus={{kind: 'loop-change', changeId: focusedChange.id}}
          locale="en"
          now={() => NOW_MS}
          runtime={{
            dataSource: {
              loadChanges: async () => [focusedChange],
              loadGlucoseSamples,
            },
            expectedSampleIntervalMs: DAY_MS,
            thresholds,
            onAskAiAdvisor: jest.fn(),
            onOpenDayGraph: jest.fn(),
          }}
        />,
      );
    });
    await act(async () => {
      tree!.root
        .findByProps({testID: 'loop-changes-run-observation'})
        .props.onPress();
    });

    expect(allText(tree!)).toContain('100% coverage');
    expect(allText(tree!)).toContain('64.29% coverage');
    expect(allText(tree!)).toContain('9 / 14 readings');
    expect(allText(tree!)).not.toContain('Observed differences');
    expect(allText(tree!)).toContain(
      'Differences are hidden until both windows have at least 14 days and 70% coverage.',
    );
    act(() => tree!.unmount());
  });

  it('filters change history by date and mirrors the control order in Hebrew', async () => {
    const loadChanges = jest.fn(async () => []);
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <LoopChangesModuleView
          locale="he"
          now={() => NOW_MS}
          runtime={{
            dataSource: {loadChanges, loadGlucoseSamples: async () => []},
            thresholds,
            onAskAiAdvisor: jest.fn(),
            onOpenDayGraph: jest.fn(),
          }}
        />,
      );
    });

    expect(
      StyleSheet.flatten(
        tree!.root.findByProps({testID: 'loop-changes-history-filters'}).props
          .style,
      ).flexDirection,
    ).toBe('row-reverse');
    await act(async () => {
      tree!.root
        .findByProps({testID: 'loop-changes-history-days-30'})
        .props.onPress();
    });
    expect(loadChanges).toHaveBeenLastCalledWith({
      startMs: NOW_MS - 30 * DAY_MS,
      endMs: NOW_MS,
    });
    expect(allText(tree!)).toContain('לא נמצאו שינויי הגדרות בתקופה הזו.');
    act(() => tree!.unmount());
  });

  it('localizes an observed-only change and does not invent old or new values', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <LoopChangesModuleView
          focus={{kind: 'loop-change', changeId: otherChange.id}}
          locale="he"
          now={() => NOW_MS}
          runtime={{
            dataSource: {
              loadChanges: async () => [otherChange],
              loadGlucoseSamples: async () => [],
            },
            thresholds,
            onAskAiAdvisor: jest.fn(),
            onOpenDayGraph: jest.fn(),
          }}
        />,
      );
    });

    expect(allText(tree!)).toContain('הגדרה: הגדרה אחרת');
    expect(allText(tree!)).toContain(
      'המקור מתעד שהיה שינוי, אך אינו מאמת את הערכים הקודמים או החדשים.',
    );
    expect(allText(tree!)).not.toContain('ערך קודם');
    const title = tree!.root
      .findAllByType(Text)
      .find(node => renderedText(node.props.children) === otherChange.summary);
    expect(StyleSheet.flatten(title?.props.style).writingDirection).toBe('rtl');
    act(() => tree!.unmount());
  });

  it('reloads a selected observation window and ignores a late result from the old window', async () => {
    const pending: Array<{
      period: TrendsPeriod;
      resolve: (samples: readonly {timestampMs: number; valueMgDl: number}[]) => void;
    }> = [];
    const loadGlucoseSamples = jest.fn(
      (period: TrendsPeriod) =>
        new Promise<readonly {timestampMs: number; valueMgDl: number}[]>(
          resolve => pending.push({period, resolve}),
        ),
    );
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <LoopChangesModuleView
          focus={{kind: 'loop-change', changeId: focusedChange.id}}
          locale="en"
          now={() => NOW_MS}
          runtime={{
            dataSource: {
              loadChanges: async () => [focusedChange],
              loadGlucoseSamples,
            },
            expectedSampleIntervalMs: DAY_MS,
            thresholds,
            onAskAiAdvisor: jest.fn(),
            onOpenDayGraph: jest.fn(),
          }}
        />,
      );
    });
    await act(async () => Promise.resolve());
    act(() =>
      tree!.root
        .findByProps({testID: 'loop-changes-run-observation'})
        .props.onPress(),
    );
    expect(pending).toHaveLength(2);
    expect(allText(tree!)).toContain('Loading both glucose windows…');
    act(() =>
      tree!.root
        .findByProps({testID: 'loop-changes-window-days-30'})
        .props.onPress(),
    );
    expect(pending).toHaveLength(4);

    await act(async () => {
      pending[2]!.resolve(
        Array.from({length: 30}, (_, index) => ({
          timestampMs: pending[2]!.period.startMs + index * DAY_MS,
          valueMgDl: 100,
        })),
      );
      pending[3]!.resolve(
        Array.from({length: 30}, (_, index) => ({
          timestampMs: pending[3]!.period.startMs + index * DAY_MS,
          valueMgDl: 150,
        })),
      );
      await Promise.resolve();
    });
    expect(allText(tree!)).toContain('+50 mg/dL');

    await act(async () => {
      pending[0]!.resolve(
        Array.from({length: 14}, (_, index) => ({
          timestampMs: pending[0]!.period.startMs + index * DAY_MS,
          valueMgDl: 100,
        })),
      );
      pending[1]!.resolve(
        Array.from({length: 14}, (_, index) => ({
          timestampMs: pending[1]!.period.startMs + index * DAY_MS,
          valueMgDl: 300,
        })),
      );
      await Promise.resolve();
    });
    expect(allText(tree!)).toContain('+50 mg/dL');
    expect(allText(tree!)).not.toContain('+200 mg/dL');
    act(() => tree!.unmount());
  });

  it('offers retry after change-history loading fails', async () => {
    const loadChanges = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([focusedChange]);
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <LoopChangesModuleView
          locale="en"
          now={() => NOW_MS}
          runtime={{
            dataSource: {loadChanges, loadGlucoseSamples: async () => []},
            thresholds,
            onAskAiAdvisor: jest.fn(),
            onOpenDayGraph: jest.fn(),
          }}
        />,
      );
    });
    expect(tree!.root.findByProps({testID: 'loop-changes-error'})).toBeTruthy();

    await act(async () => {
      tree!.root.findByProps({testID: 'loop-changes-retry'}).props.onPress();
    });
    expect(loadChanges).toHaveBeenCalledTimes(2);
    expect(tree!.root.findByProps({testID: 'loop-changes-list'})).toBeTruthy();
    act(() => tree!.unmount());
  });

  it('offers retry when an on-demand glucose observation fails', async () => {
    let failing = true;
    const loadGlucoseSamples = jest.fn(async (period: TrendsPeriod) => {
      if (failing) {
        throw new Error('offline');
      }
      return Array.from({length: 14}, (_, index) => ({
        timestampMs: period.startMs + index * DAY_MS,
        valueMgDl: 120,
      }));
    });
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <LoopChangesModuleView
          focus={{kind: 'loop-change', changeId: focusedChange.id}}
          locale="en"
          now={() => NOW_MS}
          runtime={{
            dataSource: {
              loadChanges: async () => [focusedChange],
              loadGlucoseSamples,
            },
            expectedSampleIntervalMs: DAY_MS,
            thresholds,
            onAskAiAdvisor: jest.fn(),
            onOpenDayGraph: jest.fn(),
          }}
        />,
      );
    });
    await act(async () => {
      tree!.root
        .findByProps({testID: 'loop-changes-run-observation'})
        .props.onPress();
    });
    expect(
      tree!.root.findByProps({testID: 'loop-changes-observation-error'}),
    ).toBeTruthy();

    failing = false;
    await act(async () => {
      tree!.root
        .findByProps({testID: 'loop-changes-observation-retry'})
        .props.onPress();
    });
    expect(loadGlucoseSamples).toHaveBeenCalledTimes(4);
    expect(
      tree!.root.findByProps({testID: 'loop-changes-observation'}),
    ).toBeTruthy();
    act(() => tree!.unmount());
  });
});
