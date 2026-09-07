import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {useDayGraphCalendar} from 'app/product/dayGraph/useDayGraphCalendar';
import {
  DEFAULT_DAY_GRAPH_RANGE_THRESHOLDS,
  moveLocalDays,
  type DayGraphCalendarSnapshot,
  type DayGraphDataSource,
} from 'app/modules/dayGraph';

const day = new Date(2026, 8, 7).getTime();
const nowMs = day + 12 * 3_600_000;
const month = new Date(2026, 8, 1).getTime();
const previous = new Date(2026, 7, 1).getTime();
const record = (start = day, value = 120) => ({
  identity: {sourceId: 'fixture', recordId: String(start)},
  timestampMs: start + 60_000,
  valueMgDl: value,
});
const snapshot = (start = day): DayGraphCalendarSnapshot => ({
  glucoseSamples: [record(start)],
  complete: true,
  freshness: {kind: 'fresh', fetchedAtMs: nowMs},
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
};
type Props = Parameters<typeof useDayGraphCalendar>[0];
let latest: ReturnType<typeof useDayGraphCalendar>;
const Probe = (props: Props) => {
  latest = useDayGraphCalendar(props);
  return null;
};
const props = (source: DayGraphDataSource): Props => ({
  source,
  open: false,
  monthStartMs: month,
  nowMs,
  thresholds: DEFAULT_DAY_GRAPH_RANGE_THRESHOLDS,
  expectedSampleIntervalMs: 300_000,
});
const mount = async (input: Props) => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<Probe {...input} />);
  });
  return tree;
};
const update = async (tree: renderer.ReactTestRenderer, input: Props) => {
  await act(async () => {
    tree.update(<Probe {...input} />);
  });
};

describe('lazy date calendar reads', () => {
  it('loads glucose only when opened, clamps future range, caches summaries on reopen and retries explicitly', async () => {
    const loadCalendarGlucose = jest.fn(async () => snapshot());
    const loadDayGraph = jest.fn();
    const input = props({loadDayGraph, loadCalendarGlucose});
    const tree = await mount(input);
    try {
      expect(loadCalendarGlucose).not.toHaveBeenCalled();
      await update(tree, {...input, open: true});
      expect(loadCalendarGlucose).toHaveBeenCalledWith(
        {dayStartMs: month, dayEndMs: moveLocalDays(day, 1)},
        {signal: expect.any(AbortSignal)},
      );
      expect(latest.days.find(item => item.dayStartMs === day)?.status).toBe(
        'data',
      );
      expect(latest.loading).toBe(false);
      await update(tree, input);
      await update(tree, {...input, open: true, nowMs: nowMs + 60_000});
      expect(loadCalendarGlucose).toHaveBeenCalledTimes(1);
      await act(async () => {
        latest.retry();
      });
      expect(loadCalendarGlucose).toHaveBeenCalledTimes(2);
      expect(loadDayGraph).not.toHaveBeenCalled();
    } finally {
      act(() => tree.unmount());
    }
  });

  it('keeps browsing responsive and ignores a late response for a different month', async () => {
    const first = deferred<DayGraphCalendarSnapshot>();
    const second = deferred<DayGraphCalendarSnapshot>();
    const loadCalendarGlucose = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const input = {
      ...props({loadDayGraph: jest.fn(), loadCalendarGlucose}),
      open: true,
    };
    const tree = await mount(input);
    try {
      expect(latest.loading).toBe(true);
      await update(tree, {...input, monthStartMs: previous});
      await act(async () => {
        second.resolve(snapshot(previous));
      });
      await act(async () => {
        first.resolve(snapshot());
      });
      expect(latest.days[0]?.dayStartMs).toBe(previous);
      expect(latest.days[0]?.status).toBe('data');
    } finally {
      act(() => tree.unmount());
    }
  });

  it('isolates account/source changes even while a read is in flight', async () => {
    const oldRead = deferred<DayGraphCalendarSnapshot>();
    const newRead = deferred<DayGraphCalendarSnapshot>();
    const input = {
      ...props({
        loadDayGraph: jest.fn(),
        loadCalendarGlucose: () => oldRead.promise,
      }),
      open: true,
    };
    const tree = await mount(input);
    try {
      await update(tree, {
        ...input,
        source: {
          loadDayGraph: jest.fn(),
          loadCalendarGlucose: () => newRead.promise,
        },
      });
      await act(async () => {
        oldRead.resolve(snapshot());
      });
      expect(latest.days.every(item => item.status === 'unknown')).toBe(true);
      await act(async () => {
        newRead.resolve({...snapshot(), glucoseSamples: []});
      });
      expect(latest.days.find(item => item.dayStartMs === day)?.status).toBe(
        'empty',
      );
    } finally {
      act(() => tree.unmount());
    }
  });

  it('retains already visible glucose offline and distinguishes failures from empty months', async () => {
    const read = deferred<DayGraphCalendarSnapshot>();
    const input = {
      ...props({
        loadDayGraph: jest.fn(),
        loadCalendarGlucose: () => read.promise,
      }),
      open: true,
      selectedDaySnapshot: {
        glucoseSamples: [record()],
        timelineItems: [],
        freshness: {kind: 'stale' as const, fetchedAtMs: nowMs},
      },
    };
    const tree = await mount(input);
    try {
      await act(async () => {
        read.reject(new Error('offline'));
      });
      expect(latest.failed).toBe(true);
      expect(latest.stale).toBe(true);
      expect(latest.days.find(item => item.dayStartMs === day)).toMatchObject({
        status: 'data',
        partial: true,
      });
      expect(latest.days.filter(item => item.status === 'empty')).toHaveLength(
        0,
      );
    } finally {
      act(() => tree.unmount());
    }
  });

  it('recalculates after target changes and keeps stale missing dates unknown', async () => {
    const loadCalendarGlucose = jest.fn(async () => ({
      ...snapshot(),
      complete: false,
      freshness: {kind: 'stale' as const, fetchedAtMs: nowMs},
    }));
    const input = {
      ...props({loadDayGraph: jest.fn(), loadCalendarGlucose}),
      open: true,
    };
    const tree = await mount(input);
    try {
      expect(
        latest.days.find(item => item.dayStartMs === day)?.timeInRangePct,
      ).toBe(100);
      await update(tree, {
        ...input,
        thresholds: {...DEFAULT_DAY_GRAPH_RANGE_THRESHOLDS, targetMinMgDl: 130},
      });
      expect(
        latest.days.find(item => item.dayStartMs === day)?.timeInRangePct,
      ).toBe(0);
      expect(latest.stale).toBe(true);
      expect(latest.days.some(item => item.status === 'empty')).toBe(false);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('still supports date selection when the host has no calendar data capability', async () => {
    const tree = await mount({...props({loadDayGraph: jest.fn()}), open: true});
    try {
      expect(latest.loading).toBe(false);
      expect(latest.failed).toBe(false);
      expect(latest.days).toHaveLength(30);
      expect(latest.days.every(item => item.status === 'unknown')).toBe(true);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('does not claim saved data when every read failed and no readings exist', async () => {
    const tree = await mount({
      ...props({
        loadDayGraph: jest.fn(),
        loadCalendarGlucose: async () => {
          throw new Error('offline');
        },
      }),
      open: true,
    });
    try {
      expect(latest.failed).toBe(true);
      expect(latest.stale).toBe(false);
      expect(latest.days.every(item => item.status === 'unknown')).toBe(true);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('prefers newly visible readings over a cached empty-day summary', async () => {
    const input = {
      ...props({
        loadDayGraph: jest.fn(),
        loadCalendarGlucose: async () => ({...snapshot(), glucoseSamples: []}),
      }),
      open: true,
    };
    const tree = await mount(input);
    try {
      expect(latest.days.find(item => item.dayStartMs === day)?.status).toBe(
        'empty',
      );
      await update(tree, {
        ...input,
        selectedDaySnapshot: {...snapshot(), timelineItems: []},
      });
      expect(latest.days.find(item => item.dayStartMs === day)).toMatchObject({
        status: 'data',
        timeInRangePct: 100,
      });
    } finally {
      act(() => tree.unmount());
    }
  });

  it('does not restart a pending download on clock ticks and cancels it on close', async () => {
    const pending = deferred<DayGraphCalendarSnapshot>();
    const loadCalendarGlucose = jest.fn<
      Promise<DayGraphCalendarSnapshot>,
      Parameters<NonNullable<DayGraphDataSource['loadCalendarGlucose']>>
    >(() => pending.promise);
    const input = {
      ...props({loadDayGraph: jest.fn(), loadCalendarGlucose}),
      open: true,
    };
    const tree = await mount(input);
    try {
      const signal = loadCalendarGlucose.mock.calls[0]?.[1]?.signal;
      expect(signal?.aborted).toBe(false);
      await update(tree, {
        ...input,
        nowMs: nowMs + 60_000,
        thresholds: {...input.thresholds},
      });
      expect(loadCalendarGlucose).toHaveBeenCalledTimes(1);
      expect(signal?.aborted).toBe(false);
      await update(tree, {...input, open: false});
      expect(signal?.aborted).toBe(true);
      await act(async () => pending.resolve(snapshot()));
      expect(latest.days).toEqual([]);
    } finally {
      act(() => tree.unmount());
    }
  });

  it('refreshes an expired summary on reopen while retaining its visible readings', async () => {
    const pending = deferred<DayGraphCalendarSnapshot>();
    const loadCalendarGlucose = jest
      .fn()
      .mockResolvedValueOnce(snapshot())
      .mockReturnValueOnce(pending.promise);
    const input = {
      ...props({loadDayGraph: jest.fn(), loadCalendarGlucose}),
      open: true,
    };
    const tree = await mount(input);
    try {
      await update(tree, {...input, open: false});
      await update(tree, {...input, nowMs: nowMs + 5 * 60_000});
      expect(loadCalendarGlucose).toHaveBeenCalledTimes(2);
      expect(latest.loading).toBe(true);
      expect(latest.days.find(item => item.dayStartMs === day)?.status).toBe(
        'data',
      );
      await act(async () => pending.reject(new Error('offline')));
      expect(latest.loading).toBe(false);
      expect(latest.failed).toBe(true);
      expect(latest.stale).toBe(true);
      expect(latest.days.find(item => item.dayStartMs === day)?.status).toBe(
        'data',
      );
    } finally {
      act(() => tree.unmount());
    }
  });

  it('bounds retained summaries to three months and reloads an evicted month', async () => {
    const loadCalendarGlucose = jest.fn(async () => snapshot());
    const input = {
      ...props({loadDayGraph: jest.fn(), loadCalendarGlucose}),
      open: true,
    };
    const tree = await mount(input);
    try {
      for (const monthIndex of [7, 6, 5]) {
        await update(tree, {
          ...input,
          monthStartMs: new Date(2026, monthIndex, 1).getTime(),
        });
      }
      expect(loadCalendarGlucose).toHaveBeenCalledTimes(4);
      await update(tree, {...input, monthStartMs: previous});
      expect(loadCalendarGlucose).toHaveBeenCalledTimes(4);
      await update(tree, input);
      expect(loadCalendarGlucose).toHaveBeenCalledTimes(5);
    } finally {
      act(() => tree.unmount());
    }
  });
});
