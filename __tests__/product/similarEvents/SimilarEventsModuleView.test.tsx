import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Pressable, Text} from 'react-native';
import {
  SimilarEventsModuleView,
  type SimilarEventsModuleRuntime,
} from '../../../src/product/similarEvents';

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

const runtime = (
  loadGlucoseSamples: SimilarEventsModuleRuntime['dataSource']['loadGlucoseSamples'],
): SimilarEventsModuleRuntime => ({
  dataSource: {loadGlucoseSamples},
  thresholds: {lowBelowMgDl: 70, highAboveMgDl: 180},
  expectedSampleIntervalMs: 5 * 60 * 1000,
  timeZoneOffsetMinutes: 0,
  onOpenDayGraph: jest.fn(),
  onAskAi: jest.fn(),
});

describe('SimilarEventsModuleView', () => {
  it('asks for a focused event without loading a broad default analysis', () => {
    const load = jest.fn();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SimilarEventsModuleView locale="en" runtime={runtime(load)} />,
      );
    });

    expect(load).not.toHaveBeenCalled();
    expect(textValues(tree!)).toContain(
      'Open Similar events from a selected low or high event.',
    );
    act(() => tree!.unmount());
  });

  it('loads bounded chunks and exposes navigation only through explicit actions', async () => {
    const MINUTE_MS = 60 * 1000;
    const focusStartMs = 100 * MINUTE_MS;
    const load = jest.fn(async (period: {startMs: number; endMs: number}) =>
      Array.from(
        {length: (period.endMs - period.startMs) / (5 * MINUTE_MS)},
        (_, index) => ({
          timestampMs: period.startMs + index * 5 * MINUTE_MS,
          valueMgDl: index === 1 || index === 2 ? 60 + index : 120,
        }),
      ),
    );
    const onOpenDayGraph = jest.fn();
    const onAskAi = jest.fn();
    const moduleRuntime: SimilarEventsModuleRuntime = {
      ...runtime(load),
      historyDurationMs: 30 * MINUTE_MS,
      historyChunkDurationMs: 15 * MINUTE_MS,
      onOpenDayGraph,
      onAskAi,
    };
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <SimilarEventsModuleView
          focus={{
            kind: 'period',
            startMs: focusStartMs,
            endMs: focusStartMs + 30 * MINUTE_MS,
          }}
          locale="en"
          runtime={moduleRuntime}
        />,
      );
    });

    expect(load).toHaveBeenCalledTimes(3);
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'Focused low event',
        'Descriptive similarity',
        'similar-glucose-events-v1',
        'This percentage is not a medical score.',
      ]),
    );
    const match = tree!.root
      .findAllByProps({testID: 'similar-events-match-0'})
      .find(node => node.type === Pressable);
    act(() => match?.props.onPress());
    expect(onOpenDayGraph).not.toHaveBeenCalled();
    expect(onAskAi).not.toHaveBeenCalled();

    act(() =>
      tree!.root.findByProps({testID: 'similar-events-open-graph'}).props.onPress(),
    );
    act(() =>
      tree!.root.findByProps({testID: 'similar-events-ask-ai'}).props.onPress(),
    );
    expect(onOpenDayGraph).toHaveBeenCalledTimes(1);
    expect(onAskAi).toHaveBeenCalledTimes(1);
    act(() => tree!.unmount());
  });

  it('shows a recoverable error and retries the same bounded plan', async () => {
    const MINUTE_MS = 60 * 1000;
    let failing = true;
    const load = jest.fn(async (period: {startMs: number}) => {
      if (failing) {
        throw new Error('private source detail');
      }
      return [{timestampMs: period.startMs, valueMgDl: 60}];
    });
    const moduleRuntime: SimilarEventsModuleRuntime = {
      ...runtime(load),
      expectedSampleIntervalMs: 10 * MINUTE_MS,
      historyDurationMs: 10 * MINUTE_MS,
      historyChunkDurationMs: 10 * MINUTE_MS,
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <SimilarEventsModuleView
          focus={{kind: 'period', startMs: 20 * MINUTE_MS, endMs: 30 * MINUTE_MS}}
          locale="en"
          runtime={moduleRuntime}
        />,
      );
    });

    expect(tree!.root.findByProps({testID: 'similar-events-error'})).toBeTruthy();
    expect(textValues(tree!)).not.toContain('private source detail');
    failing = false;
    await act(async () => {
      tree!.root.findByProps({testID: 'similar-events-retry'}).props.onPress();
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(4);
    expect(tree!.root.findByProps({testID: 'similar-events-formula'})).toBeTruthy();
    act(() => tree!.unmount());
  });

  it('keeps the focused window visible while a chunked search is canceled', () => {
    const MINUTE_MS = 60 * 1000;
    const signals: AbortSignal[] = [];
    const load = jest.fn(
      (_period: {startMs: number}, signal: AbortSignal) =>
        new Promise<readonly []>(() => {
          signals.push(signal);
        }),
    );
    const moduleRuntime: SimilarEventsModuleRuntime = {
      ...runtime(load),
      historyDurationMs: 20 * MINUTE_MS,
      historyChunkDurationMs: 10 * MINUTE_MS,
    };
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SimilarEventsModuleView
          focus={{kind: 'period', startMs: 30 * MINUTE_MS, endMs: 40 * MINUTE_MS}}
          locale="en"
          runtime={moduleRuntime}
        />,
      );
    });

    expect(textValues(tree!)).toContain('0/3 data windows loaded');
    expect(tree!.root.findByProps({testID: 'similar-events-focus-window'})).toBeTruthy();
    act(() =>
      tree!.root.findByProps({testID: 'similar-events-cancel'}).props.onPress(),
    );
    expect(signals).toHaveLength(3);
    expect(signals.every(signal => signal.aborted)).toBe(true);
    expect(tree!.root.findByProps({testID: 'similar-events-canceled'})).toBeTruthy();
    expect(tree!.root.findByProps({testID: 'similar-events-focus-window'})).toBeTruthy();
    act(() => tree!.unmount());
  });

  it('ignores a late response after the focused event changes', async () => {
    const MINUTE_MS = 60 * 1000;
    const pending: Array<{
      period: {startMs: number; endMs: number};
      resolve: (samples: readonly {timestampMs: number; valueMgDl: number}[]) => void;
    }> = [];
    const load = jest.fn(
      (period: {startMs: number; endMs: number}) =>
        new Promise<readonly {timestampMs: number; valueMgDl: number}[]>(resolve => {
          pending.push({period, resolve});
        }),
    );
    const moduleRuntime: SimilarEventsModuleRuntime = {
      ...runtime(load),
      expectedSampleIntervalMs: 10 * MINUTE_MS,
      historyDurationMs: 10 * MINUTE_MS,
      historyChunkDurationMs: 10 * MINUTE_MS,
    };
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <SimilarEventsModuleView
          focus={{kind: 'period', startMs: 20 * MINUTE_MS, endMs: 30 * MINUTE_MS}}
          locale="en"
          runtime={moduleRuntime}
        />,
      );
    });
    expect(pending).toHaveLength(2);

    act(() => {
      tree!.update(
        <SimilarEventsModuleView
          focus={{kind: 'period', startMs: 100 * MINUTE_MS, endMs: 110 * MINUTE_MS}}
          locale="en"
          runtime={moduleRuntime}
        />,
      );
    });
    expect(pending).toHaveLength(4);
    await act(async () => {
      pending[2]!.resolve([
        {timestampMs: pending[2]!.period.startMs, valueMgDl: 220},
      ]);
      pending[3]!.resolve([
        {timestampMs: pending[3]!.period.startMs, valueMgDl: 215},
      ]);
      await Promise.resolve();
    });
    expect(textValues(tree!)).toContain('Focused high event');

    await act(async () => {
      pending[0]!.resolve([
        {timestampMs: pending[0]!.period.startMs, valueMgDl: 60},
      ]);
      pending[1]!.resolve([
        {timestampMs: pending[1]!.period.startMs, valueMgDl: 62},
      ]);
      await Promise.resolve();
    });
    expect(textValues(tree!)).toContain('Focused high event');
    expect(textValues(tree!)).not.toContain('Focused low event');
    act(() => tree!.unmount());
  });

  it('shows the Hebrew low-coverage warning before withholding an absent focused event', async () => {
    const MINUTE_MS = 60 * 1000;
    const focusStartMs = 20 * MINUTE_MS;
    const load = jest.fn(async (period: {startMs: number}) =>
      period.startMs === focusStartMs
        ? [{timestampMs: focusStartMs, valueMgDl: 120}]
        : [],
    );
    const moduleRuntime: SimilarEventsModuleRuntime = {
      ...runtime(load),
      historyDurationMs: 10 * MINUTE_MS,
      historyChunkDurationMs: 10 * MINUTE_MS,
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <SimilarEventsModuleView
          focus={{kind: 'period', startMs: focusStartMs, endMs: 30 * MINUTE_MS}}
          locale="he"
          runtime={moduleRuntime}
        />,
      );
    });

    expect(tree!.root.findByProps({testID: 'similar-events-coverage-warning'})).toBeTruthy();
    expect(tree!.root.findByProps({testID: 'similar-events-no-focus-event'})).toBeTruthy();
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'איכות נתונים',
        'הכיסוי נמוך מ־70%. קריאות חסרות עלולות להסתיר אירועים או לשנות את ההתאמות שמוצגות.',
        'לא נצפה אירוע סוכר נמוך או גבוה בחלון שנבחר.',
      ]),
    );
    act(() => tree!.unmount());
  });
});
