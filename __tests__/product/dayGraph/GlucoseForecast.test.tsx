import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {AppState} from 'react-native';
import type {DayGraphDataSource} from 'app/modules/dayGraph';
import {buildDayGraph} from 'app/modules/dayGraph';
import type {GlucoseForecastSnapshot} from 'app/modules/glucoseForecast';
import {useGlucoseForecast, visibleGlucoseForecast} from 'app/product/dayGraph/useGlucoseForecast';
import {GlucoseForecastCard} from 'app/product/dayGraph/GlucoseForecastCard';
import {RichDayGraphChart} from 'app/product/dayGraph/RichDayGraphChart';
import StackedHomeCharts from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';
import {withTheme} from '../../mocks/withTheme';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const NOW = DAY - 5 * MINUTE;
const fixture = (): GlucoseForecastSnapshot => ({
  version: 1,
  generatedAtMs: NOW,
  glucoseTimestampMs: NOW,
  history: [{ts: NOW, sgv: 120}],
  context: {iobUnits: 0, cobGrams: 0, historyDays: 14, matchedExamples: 28, features: []},
  series: [{
    id: 'personalized', label: 'Personal', sourceTimestampMs: NOW,
    points: [5, 15, 30].map(minutes => ({ts: NOW + minutes * MINUTE, sgv: 120 + minutes, lower: 95, upper: 175})),
    calibration: {status: 'calibrated', sampleCount: 25, within20Percent: 76, coveragePercent: 88},
  }],
});
const sourceFor = (loadGlucoseForecast: NonNullable<DayGraphDataSource['loadGlucoseForecast']>): DayGraphDataSource => ({
  loadGlucoseForecast,
  loadDayGraph: async () => ({glucoseSamples: [], timelineItems: [], freshness: {kind: 'fresh', fetchedAtMs: NOW}}),
});
let latest: ReturnType<typeof useGlucoseForecast>;
const Probe = ({source, live = true, nowMs = NOW}: {
  source: DayGraphDataSource; live?: boolean; nowMs?: number;
}) => {
  latest = useGlucoseForecast({source, live, nowMs});
  return null;
};
const texts = (tree: renderer.ReactTestRenderer) => JSON.stringify(tree.toJSON());

describe('live glucose forecast presentation', () => {
  let tree: renderer.ReactTestRenderer | undefined;
  afterEach(() => {
    if (tree) {
      act(() => tree!.unmount());
      tree = undefined;
    }
  });

  it('hides stale glucose and removes a stale prediction source independently', () => {
    expect(visibleGlucoseForecast(fixture(), NOW + 15 * MINUTE)).toBeUndefined();
    const staleSource = fixture();
    const result = visibleGlucoseForecast({...staleSource, series: [{
      ...staleSource.series[0]!, sourceTimestampMs: NOW - 15 * MINUTE,
    }]}, NOW);
    expect(result?.series).toEqual([]);
    expect(visibleGlucoseForecast({...fixture(), generatedAtMs: NOW - 15 * MINUTE}, NOW)).toBeUndefined();
  });

  it('uses cached history for polling and only forces history refresh for a manual request', async () => {
    jest.useFakeTimers();
    const previousAppState = AppState.currentState;
    AppState.currentState = 'active';
    const load = jest.fn(async () => fixture());
    try {
      await act(async () => {tree = renderer.create(<Probe source={sourceFor(load)} />);});
      expect(load).toHaveBeenLastCalledWith({forceRefresh: false});
      await act(async () => latest.refresh());
      expect(load).toHaveBeenLastCalledWith({forceRefresh: true});
      await act(async () => jest.advanceTimersByTime(5 * MINUTE));
      expect(load).toHaveBeenCalledTimes(3);
      expect(load).toHaveBeenLastCalledWith({forceRefresh: false});
    } finally {
      act(() => tree!.unmount());
      tree = undefined;
      AppState.currentState = previousAppState;
      jest.useRealTimers();
    }
  });

  it('does not fetch forecasts on historical days and removes live curves when leaving today', async () => {
    const load = jest.fn(async () => fixture());
    const source = sourceFor(load);
    await act(async () => {
      tree = renderer.create(<Probe source={source} live={false} />);
    });
    expect(load).not.toHaveBeenCalled();
    await act(async () => tree!.update(<Probe source={source} />));
    expect(latest.snapshot?.series).toHaveLength(1);
    await act(async () => tree!.update(<Probe source={source} live={false} />));
    expect(latest.snapshot).toBeUndefined();
    expect(latest.supported).toBe(false);
  });

  it('rejects late responses from another source and clears its previous forecast', async () => {
    let resolveOld!: (value: GlucoseForecastSnapshot) => void;
    const previous = sourceFor(() => new Promise(resolve => {resolveOld = resolve;}));
    const next = sourceFor(async () => ({...fixture(), context: {...fixture().context, matchedExamples: 3}}));
    await act(async () => {tree = renderer.create(<Probe source={previous} />);});
    await act(async () => tree!.update(<Probe source={next} />));
    expect(latest.snapshot?.context.matchedExamples).toBe(3);
    await act(async () => resolveOld(fixture()));
    expect(latest.snapshot?.context.matchedExamples).toBe(3);
    const pending = sourceFor(() => new Promise(() => undefined));
    await act(async () => tree!.update(<Probe source={pending} />));
    expect(latest.snapshot).toBeUndefined();
  });

  it('keeps forecast curves after midnight without changing recorded glucose facts', () => {
    const model = buildDayGraph({
      period: {dayStartMs: 0, dayEndMs: DAY}, expectedSampleIntervalMs: 5 * MINUTE,
      glucoseSamples: [{identity: {sourceId: 'patient', recordId: 'reading'}, timestampMs: NOW, valueMgDl: 120}],
      timelineItems: [],
    });
    act(() => {
      tree = renderer.create(withTheme(<RichDayGraphChart locale="en" model={model} forecast={fixture()} forecastStatus="ready" />));
    });
    const chart = tree!.root.findByType(StackedHomeCharts).props;
    expect(+chart.xDomain[1]).toBeGreaterThan(DAY);
    expect(chart.bgSamples).toHaveLength(1);
    expect(model.glucoseSummary?.maximumMgDl).toBe(120);
    expect(tree!.root.findAllByProps({testID: 'glucose-forecast-line-personalized'}).length).toBeGreaterThan(0);
    expect(tree!.root.findAllByProps({testID: 'glucose-forecast-band-personalized'}).length).toBeGreaterThan(0);
  });

  it('describes measured accuracy with tolerance and sample count and preserves zero IOB/COB', () => {
    act(() => {
      tree = renderer.create(withTheme(<GlucoseForecastCard locale="en" snapshot={fixture()} status="ready" />));
    });
    expect(texts(tree!)).toContain('76% within ±20 mg/dL · 25 checks');
    expect(texts(tree!)).toContain('88% of historical checks');
    expect(texts(tree!)).toContain('0.00 U');
    expect(texts(tree!)).toContain('0 g');
    expect(texts(tree!)).toContain('No forecast available: ');
  });

  it('shows uncalibrated sources without a fabricated confidence percentage', () => {
    const base = fixture();
    const snapshot: GlucoseForecastSnapshot = {...base,
      series: base.series.map(series => ({...series, calibration: {status: 'uncalibrated', sampleCount: 0}})),
    };
    act(() => {
      tree = renderer.create(withTheme(<GlucoseForecastCard locale="en" snapshot={snapshot} status="ready" />));
    });
    expect(texts(tree!)).toContain('Personal accuracy has not been measured sufficiently');
    expect(texts(tree!)).not.toContain('76%');
  });
});
