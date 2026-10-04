import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {useHomeData, type UseHomeDataInput} from 'app/product/home/useHomeData';
import type {
  DailyInsulinComparisonPresentation,
  DailyInsulinComparisonRequest,
  DailyOverviewSourceSnapshot,
} from 'app/modules/dailyOverview';

const MINUTE = 60_000;
const nowMs = new Date(2026, 8, 8, 12, 1).getTime();
const midnight = new Date(2026, 8, 8).getTime();
const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
};
const sample: DailyOverviewSourceSnapshot = {
  glucoseSamples: [{timestampMs: midnight + MINUTE, valueMgDl: 110}],
  insulinSummary: {quality: 'available', basalUnits: 10, bolusUnits: 4.5},
};
let state: ReturnType<typeof useHomeData>;
let tree: renderer.ReactTestRenderer | undefined;
const Probe = (props: UseHomeDataInput) => {
  state = useHomeData(props);
  return null;
};
const createInput = (): UseHomeDataInput => ({
  scopeKey: 'user-a:workspace-a',
  nowMs,
  refreshSequence: 0,
  thresholds,
  enabledWidgetIds: [
    'glucose-graph',
    'time-in-range',
    'daily-insulin',
    'weekly-glucose',
  ],
  sources: {
    dailyOverview: {loadDailyOverview: jest.fn(async () => sample)},
    trends: {loadGlucoseSamples: jest.fn(async () => [])},
  },
});
const render = async (input: UseHomeDataInput): Promise<void> => {
  await act(async () => {
    if (tree) {
      tree.update(<Probe {...input} />);
    } else {
      tree = renderer.create(<Probe {...input} />);
    }
  });
};
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return {promise, resolve, reject};
};
const comparison = (
  cutoffTimestampMs: number,
  totalUnits = 12,
): DailyInsulinComparisonPresentation => ({
  status: 'available',
  weekDays: 7,
  cutoffTimestampMs,
  isPartialDay: true,
  yesterday: {quality: 'available', totalUnits},
});
const createComparisonInput = (): UseHomeDataInput => {
  const input = createInput();
  return {
    ...input,
    enabledWidgetIds: ['daily-insulin'],
    sources: {
      ...input.sources,
      dailyOverview: {
        ...input.sources.dailyOverview!,
        loadDailyInsulinComparison: jest.fn(
          async (request: DailyInsulinComparisonRequest) =>
            comparison(request.asOfMs),
        ),
      },
    },
  };
};
afterEach(() => {
  if (tree) {
    act(() => tree?.unmount());
  }
  tree = undefined;
});

describe('home daily insulin comparison lifecycle', () => {
  it('uses the loaded today cutoff and full local day even when the clock changes during loading', async () => {
    const input = createComparisonInput();
    const todayRequest = deferred<DailyOverviewSourceSnapshot>();
    jest
      .mocked(input.sources.dailyOverview!.loadDailyOverview)
      .mockReturnValueOnce(todayRequest.promise);
    await render(input);
    expect(state.insulinComparison.kind).toBe('loading');
    expect(
      input.sources.dailyOverview!.loadDailyInsulinComparison,
    ).not.toHaveBeenCalled();
    await render({...input, nowMs: nowMs + MINUTE});
    await act(async () => todayRequest.resolve(sample));
    expect(
      input.sources.dailyOverview!.loadDailyInsulinComparison,
    ).toHaveBeenCalledWith({
      period: {startMs: midnight, endMs: new Date(2026, 8, 9).getTime()},
      asOfMs: nowMs,
    });
    expect(state.today).toMatchObject({
      kind: 'ready',
      data: {observedPeriod: {endMs: nowMs}},
    });
    expect(state.insulinComparison).toMatchObject({
      kind: 'ready',
      data: {cutoffTimestampMs: nowMs},
    });
  });

  it('keeps today available while comparison history is pending or fails', async () => {
    const input = createComparisonInput();
    const history = deferred<DailyInsulinComparisonPresentation>();
    jest
      .mocked(input.sources.dailyOverview!.loadDailyInsulinComparison!)
      .mockReturnValueOnce(history.promise);
    await render(input);
    expect(state.insulinComparison.kind).toBe('loading');
    expect(state.today).toMatchObject({
      kind: 'ready',
      data: {overview: {insulinSummary: {totalUnits: 14.5}}},
    });
    await act(async () => history.reject(new Error('History offline')));
    expect(state.insulinComparison.kind).toBe('error');
    expect(state.today).toMatchObject({
      kind: 'ready',
      data: {overview: {insulinSummary: {totalUnits: 14.5}}},
    });
  });

  it('reloads history only after a five-minute refresh loads today and replaces the old cutoff', async () => {
    const input = createComparisonInput();
    const loadComparison = jest.mocked(
      input.sources.dailyOverview!.loadDailyInsulinComparison!,
    );
    await render(input);
    const refreshedToday = deferred<DailyOverviewSourceSnapshot>();
    const refreshedHistory = deferred<DailyInsulinComparisonPresentation>();
    jest
      .mocked(input.sources.dailyOverview!.loadDailyOverview)
      .mockReturnValueOnce(refreshedToday.promise);
    loadComparison.mockReturnValueOnce(refreshedHistory.promise);
    const nextNowMs = nowMs + 5 * MINUTE;
    await render({...input, nowMs: nextNowMs});
    expect(loadComparison).toHaveBeenCalledTimes(1);
    expect(state.insulinComparison).toMatchObject({
      kind: 'ready',
      data: {cutoffTimestampMs: nowMs},
    });
    await act(async () => refreshedToday.resolve(sample));
    expect(state.today).toMatchObject({
      kind: 'ready',
      data: {observedPeriod: {endMs: nextNowMs}},
    });
    expect(state.insulinComparison.kind).toBe('loading');
    expect(loadComparison).toHaveBeenLastCalledWith({
      period: {startMs: midnight, endMs: new Date(2026, 8, 9).getTime()},
      asOfMs: nextNowMs,
    });
    await act(async () => refreshedHistory.resolve(comparison(nextNowMs)));
    expect(state.insulinComparison).toMatchObject({
      kind: 'ready',
      data: {cutoffTimestampMs: nextNowMs},
    });
  });

  it('reloads history on a same-clock manual refresh without refetching for equivalent props', async () => {
    const input = createComparisonInput();
    const loadComparison = input.sources.dailyOverview!.loadDailyInsulinComparison;
    await render(input);
    await render({...input, enabledWidgetIds: ['daily-insulin', 'chat']});
    expect(loadComparison).toHaveBeenCalledTimes(1);
    await render({...input, refreshSequence: 1});
    expect(loadComparison).toHaveBeenCalledTimes(2);
    expect(loadComparison).toHaveBeenLastCalledWith({
      period: {startMs: midnight, endMs: new Date(2026, 8, 9).getTime()},
      asOfMs: nowMs,
    });
  });

  it('does not read history for hidden widgets or missing comparison adapters', async () => {
    const input = createComparisonInput();
    await render({...input, enabledWidgetIds: ['glucose-graph']});
    expect(
      input.sources.dailyOverview!.loadDailyInsulinComparison,
    ).not.toHaveBeenCalled();
    expect(state.insulinComparison).toEqual({
      kind: 'unavailable',
      reason: 'hidden',
    });
    await render(createInput());
    expect(state.insulinComparison).toEqual({
      kind: 'unavailable',
      reason: 'source',
    });
  });

  it.each(['scope', 'source', 'day', 'hidden'] as const)(
    'discards late history after a %s change',
    async mode => {
      const input = createComparisonInput();
      const firstHistory = deferred<DailyInsulinComparisonPresentation>();
      const loadComparison = jest.mocked(
        input.sources.dailyOverview!.loadDailyInsulinComparison!,
      );
      loadComparison.mockReturnValueOnce(firstHistory.promise);
      await render(input);
      let next: UseHomeDataInput;
      if (mode === 'scope') {
        next = {...input, scopeKey: 'user-b:workspace-b'};
      } else if (mode === 'source') {
        const replacement = createComparisonInput();
        next = {...input, sources: replacement.sources};
      } else if (mode === 'day') {
        next = {...input, nowMs: new Date(2026, 8, 9, 12, 1).getTime()};
      } else {
        next = {...input, enabledWidgetIds: ['glucose-graph']};
      }
      await render(next);
      await act(async () => firstHistory.resolve(comparison(nowMs, 99)));
      if (mode === 'hidden') {
        expect(state.insulinComparison).toEqual({
          kind: 'unavailable',
          reason: 'hidden',
        });
        expect(loadComparison).toHaveBeenCalledTimes(1);
      } else {
        expect(state.insulinComparison).toMatchObject({
          kind: 'ready',
          data: {yesterday: {totalUnits: 12}},
        });
        if (mode === 'day') {
          expect(state.insulinComparison).toMatchObject({
            data: {cutoffTimestampMs: next.nowMs},
          });
        }
      }
      expect(state.today.kind).toBe('ready');
    },
  );
});

describe('home data request lifecycle', () => {
  it('shares one through-now daily read and makes one weekly glucose read', async () => {
    const input = createInput();
    await render(input);
    expect(
      input.sources.dailyOverview?.loadDailyOverview,
    ).toHaveBeenCalledTimes(1);
    expect(input.sources.dailyOverview?.loadDailyOverview).toHaveBeenCalledWith(
      {startMs: midnight, endMs: nowMs},
    );
    expect(input.sources.trends?.loadGlucoseSamples).toHaveBeenCalledTimes(1);
    expect(input.sources.trends?.loadGlucoseSamples).toHaveBeenCalledWith({
      startMs: new Date(2026, 8, 1).getTime(),
      endMs: midnight,
    });
    expect(state.today.kind).toBe('ready');
    expect(state.weeklyGlucose.kind).toBe('ready');
    expect(state.weeklyInsulin).toEqual({
      kind: 'unavailable',
      reason: 'hidden',
    });
  });

  it('does not reload after reordering, replacing equivalent props, or a minute within the same bucket', async () => {
    const input = createInput();
    await render(input);
    await render({
      ...input,
      nowMs: nowMs + MINUTE,
      thresholds: {...thresholds},
      sources: {...input.sources},
      enabledWidgetIds: [
        'weekly-glucose',
        'daily-insulin',
        'time-in-range',
        'glucose-graph',
        'chat',
      ],
    });
    expect(
      input.sources.dailyOverview?.loadDailyOverview,
    ).toHaveBeenCalledTimes(1);
    expect(input.sources.trends?.loadGlucoseSamples).toHaveBeenCalledTimes(1);
  });

  it('refreshes only today in a new five-minute bucket, and all visible lanes on manual refresh', async () => {
    const input = createInput();
    await render(input);
    await render({...input, nowMs: nowMs + 5 * MINUTE});
    expect(
      input.sources.dailyOverview?.loadDailyOverview,
    ).toHaveBeenCalledTimes(2);
    expect(input.sources.trends?.loadGlucoseSamples).toHaveBeenCalledTimes(1);
    await render({...input, nowMs: nowMs + 5 * MINUTE, refreshSequence: 1});
    expect(
      input.sources.dailyOverview?.loadDailyOverview,
    ).toHaveBeenCalledTimes(3);
    expect(input.sources.trends?.loadGlucoseSamples).toHaveBeenCalledTimes(2);
  });

  it('does not fetch hidden cards and loads seven insulin days only when explicitly selected', async () => {
    const input = {...createInput(), enabledWidgetIds: ['chat'] as const};
    await render(input);
    await render({...input, nowMs: nowMs + 6 * MINUTE, refreshSequence: 1});
    expect(
      input.sources.dailyOverview?.loadDailyOverview,
    ).not.toHaveBeenCalled();
    expect(input.sources.trends?.loadGlucoseSamples).not.toHaveBeenCalled();
    await render({...input, enabledWidgetIds: ['weekly-insulin']});
    expect(
      input.sources.dailyOverview?.loadDailyOverview,
    ).toHaveBeenCalledTimes(7);
    expect(input.sources.trends?.loadGlucoseSamples).not.toHaveBeenCalled();
    expect(state.weeklyInsulin.kind).toBe('ready');
    expect(state.today.kind).toBe('unavailable');
  });

  it('keeps lane errors independent and treats missing adapters as unavailable', async () => {
    const input = createInput();
    jest
      .mocked(input.sources.dailyOverview!.loadDailyOverview)
      .mockRejectedValueOnce(new Error('offline'));
    await render(input);
    expect(state.today.kind).toBe('error');
    expect(state.weeklyGlucose.kind).toBe('ready');
    await render({...input, sources: {}});
    expect(state.today).toEqual({kind: 'unavailable', reason: 'source'});
    expect(state.weeklyGlucose).toEqual({
      kind: 'unavailable',
      reason: 'source',
    });
  });

  it('retains data during refresh and reports a refresh failure without hiding it', async () => {
    const input = createInput();
    await render(input);
    let reject: ((error: Error) => void) | undefined;
    jest
      .mocked(input.sources.dailyOverview!.loadDailyOverview)
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, rejectPromise) => {
            reject = rejectPromise;
          }),
      );
    await render({...input, refreshSequence: 1});
    expect(state.today).toMatchObject({
      kind: 'ready',
      refreshing: true,
      refreshFailed: false,
    });
    await act(async () => {
      reject?.(new Error('offline'));
    });
    expect(state.today).toMatchObject({
      kind: 'ready',
      refreshing: false,
      refreshFailed: true,
      data: {overview: {meanGlucoseMgDl: 110}},
    });
  });

  it.each(['scope', 'source'] as const)(
    'discards a late response after a %s switch',
    async mode => {
      const input = createInput();
      let resolve: ((value: DailyOverviewSourceSnapshot) => void) | undefined;
      jest
        .mocked(input.sources.dailyOverview!.loadDailyOverview)
        .mockImplementationOnce(
          () =>
            new Promise(resolvePromise => {
              resolve = resolvePromise;
            }),
        );
      await render(input);
      const replacement: DailyOverviewSourceSnapshot = {
        ...sample,
        glucoseSamples: [{timestampMs: midnight + MINUTE, valueMgDl: 150}],
      };
      const next =
        mode === 'scope'
          ? {...input, scopeKey: 'user-b:workspace-b'}
          : {
              ...input,
              sources: {
                ...input.sources,
                dailyOverview: {
                  loadDailyOverview: jest.fn(async () => replacement),
                },
              },
            };
      if (mode === 'scope') {
        jest
          .mocked(input.sources.dailyOverview!.loadDailyOverview)
          .mockResolvedValueOnce(replacement);
      }
      await render(next);
      expect(state.today).toMatchObject({
        kind: 'ready',
        data: {overview: {meanGlucoseMgDl: 150}},
      });
      await act(async () => {
        resolve?.(sample);
      });
      expect(state.today).toMatchObject({
        kind: 'ready',
        data: {overview: {meanGlucoseMgDl: 150}},
      });
    },
  );

  it('stops queued insulin requests after the widget is hidden or unmounted', async () => {
    const input = {
      ...createInput(),
      enabledWidgetIds: ['weekly-insulin'] as const,
    };
    let release: (() => void) | undefined;
    const wait = new Promise<void>(resolve => {
      release = resolve;
    });
    jest
      .mocked(input.sources.dailyOverview!.loadDailyOverview)
      .mockImplementation(async () => {
        await wait;
        return sample;
      });
    await render(input);
    expect(
      input.sources.dailyOverview?.loadDailyOverview,
    ).toHaveBeenCalledTimes(2);
    await render({...input, enabledWidgetIds: ['chat']});
    act(() => tree?.unmount());
    tree = undefined;
    await act(async () => {
      release?.();
    });
    expect(
      input.sources.dailyOverview?.loadDailyOverview,
    ).toHaveBeenCalledTimes(2);
  });

  it('rolls into a new day without fetching future basal at exact midnight', async () => {
    const input = createInput();
    await render(input);
    const nextMidnight = new Date(2026, 8, 9).getTime();
    await render({...input, nowMs: nextMidnight});
    expect(
      input.sources.dailyOverview?.loadDailyOverview,
    ).toHaveBeenCalledTimes(1);
    expect(state.today).toMatchObject({
      kind: 'ready',
      data: {
        observedPeriod: {startMs: nextMidnight, endMs: nextMidnight},
        overview: {insulinSummary: {quality: 'unavailable'}},
      },
    });
    expect(input.sources.trends?.loadGlucoseSamples).toHaveBeenLastCalledWith({
      startMs: new Date(2026, 8, 2).getTime(),
      endMs: nextMidnight,
    });
  });
});
