import {createDayGraphForecastLoader, createRecordedLoopForecastLoader, forecastForDisplay} from 'app/modules/glucoseForecast';

const MINUTE = 60_000;
const NOW = Date.parse('2026-11-17T23:55:00Z');
const readings = [{ts: NOW, sgv: 120}];
const status = (timestamp = NOW, value = 130) => ({
  ts: NOW,
  loopTimestampMs: timestamp,
  loopPrediction: {startMs: timestamp, values: Array.from({length: 14}, () => value)},
  iobUnits: 0, iobTimestampMs: timestamp,
  cobGrams: 0, cobTimestampMs: timestamp,
});
const priorChannel = globalThis.__SHANI_RELEASE_CHANNEL__;
beforeEach(() => {globalThis.__SHANI_RELEASE_CHANNEL__ = 'pilot';});
afterEach(() => {globalThis.__SHANI_RELEASE_CHANNEL__ = priorChannel;});

it('loads only recent records, preserves zeros and original Loop times across midnight', async () => {
  const readGlucose = jest.fn(async () => readings);
  const readDeviceStatus = jest.fn(async () => [status(NOW - MINUTE)]);
  const readContextEvents = jest.fn(() => []);
  const onSnapshot = jest.fn();
  const load = createDayGraphForecastLoader({getScopeKey: () => 'a', now: () => NOW,
    readGlucose, readDeviceStatus, readContextEvents, onSnapshot});
  const snapshot = await load();
  expect(readGlucose).toHaveBeenCalledTimes(1);
  expect(readGlucose).toHaveBeenCalledWith(NOW - 30 * MINUTE, NOW + 1);
  expect(readDeviceStatus).toHaveBeenCalledTimes(1);
  expect(readContextEvents).not.toHaveBeenCalled();
  expect(onSnapshot).not.toHaveBeenCalled();
  expect(snapshot.series.map(series => series.id)).toEqual(['loop']);
  expect(snapshot.series[0]!.points.map(point => point.ts)).toEqual([4, 9, 14, 19, 24, 29].map(minutes => NOW + minutes * MINUTE));
  expect(snapshot.series[0]!.sourceTimestampMs).toBe(NOW - MINUTE);
  expect(snapshot.context).toMatchObject({iobUnits: 0, cobGrams: 0, historyDays: 0, matchedExamples: 0});
  expect(snapshot.series[0]!.points.every(point => point.lower === undefined && point.upper === undefined)).toBe(true);
});

it('uses the newest Loop calculation even if an older calculation was uploaded later', async () => {
  const load = createRecordedLoopForecastLoader({getScopeKey: () => 'a', now: () => NOW,
    readGlucose: async () => readings,
    readDeviceStatus: async () => [status(NOW - 5 * MINUTE, 200), {...status(NOW - MINUTE, 130), ts: NOW - 30_000}]});
  const snapshot = await load();
  expect(snapshot.series[0]!.sourceTimestampMs).toBe(NOW - MINUTE);
  expect(snapshot.series[0]!.points[0]!.sgv).toBe(130);
});

it.each(['glucose', 'loop', 'upload', 'prediction-start'])('omits predictions when %s is 15 minutes old', async stale => {
  const old = NOW - 15 * MINUTE;
  const row = status();
  if (stale === 'loop') {row.loopTimestampMs = old;}
  if (stale === 'upload') {row.ts = old;}
  if (stale === 'prediction-start') {row.loopPrediction.startMs = old;}
  const load = createRecordedLoopForecastLoader({getScopeKey: () => 'a', now: () => NOW,
    readGlucose: async () => stale === 'glucose' ? [{ts: old, sgv: 120}] : readings,
    readDeviceStatus: async () => [row]});
  expect((await load()).series).toEqual([]);
});

it('does not reuse a previous prediction when a later device-status request fails', async () => {
  const readDeviceStatus = jest.fn().mockResolvedValueOnce([status()]).mockRejectedValueOnce(new Error('offline'));
  const load = createRecordedLoopForecastLoader({getScopeKey: () => 'a', now: () => NOW,
    readGlucose: async () => readings, readDeviceStatus});
  expect((await load()).series).toHaveLength(1);
  await expect(load()).rejects.toThrow('offline');
});

it('shares in-flight work and rejects responses from another scope, including an A-B-A switch', async () => {
  let scope = 'a';
  let finish!: (value: typeof readings) => void;
  const readGlucose = jest.fn().mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}))
    .mockResolvedValue(readings);
  const load = createRecordedLoopForecastLoader({getScopeKey: () => scope, now: () => NOW,
    readGlucose, readDeviceStatus: async () => [status()]});
  const old = load();
  expect(load()).toBe(old);
  scope = 'b';
  await load();
  scope = 'a';
  await load();
  finish(readings);
  await expect(old).rejects.toThrow('source changed');
});

it('filters retained model curves, model uncertainty and points beyond the published 30-minute display horizon', async () => {
  const load = createRecordedLoopForecastLoader({getScopeKey: () => 'a', now: () => NOW,
    readGlucose: async () => readings, readDeviceStatus: async () => [status()]});
  const snapshot = await load();
  const loop = snapshot.series[0]!;
  const retained = {...snapshot, series: [
    {...loop, points: [...loop.points.map(point => ({...point, lower: 50, upper: 200})), {ts: NOW + 60 * MINUTE, sgv: 150}]},
    {...loop, id: 'personalized' as const},
  ]};
  const display = forecastForDisplay(retained)!;
  expect(display.series.map(series => series.id)).toEqual(['loop']);
  expect(display.series[0]!.points).toEqual(loop.points);
  expect(display.series[0]!.calibration).toEqual({status: 'uncalibrated', sampleCount: 0});
});
