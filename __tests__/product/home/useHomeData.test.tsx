import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {useHomeData, type UseHomeDataInput} from 'app/product/home/useHomeData';
import type {DailyOverviewSourceSnapshot} from 'app/modules/dailyOverview';

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
afterEach(() => {
  if (tree) {
    act(() => tree?.unmount());
  }
  tree = undefined;
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
