import {createGlucoseForecastLoader} from '../../../src/modules/glucoseForecast';
const NOW = Date.parse('2026-09-07T12:00:00Z');
const MIN = 60_000;
const readings = [
  {ts: NOW - 5 * MIN, sgv: 140},
  {ts: NOW, sgv: 140},
];

it('warms only the uncovered status tail after initial historical loading', async () => {
  let at = NOW;
  const readDeviceStatus = jest.fn(async () => []);
  const load = createGlucoseForecastLoader({
    getScopeKey: () => 'a',
    now: () => at,
    readGlucose: async () => readings,
    readDeviceStatus,
  });
  await load();
  await new Promise<void>(resolve => setImmediate(() => resolve()));
  const initialCount = readDeviceStatus.mock.calls.length;
  expect(initialCount).toBeGreaterThan(100);
  at += 6 * 60 * MIN + MIN;
  await load();
  await new Promise<void>(resolve => setImmediate(() => resolve()));
  expect(readDeviceStatus.mock.calls.length - initialCount).toBeLessThanOrEqual(
    6,
  );
});

it('shares concurrent work and uses only bounded history/current reads', async () => {
  const readGlucose = jest.fn(async () => readings);
  const readDeviceStatus = jest.fn(async () => []);
  const publish = jest.fn();
  const load = createGlucoseForecastLoader({
    getScopeKey: () => 'a',
    now: () => NOW,
    readGlucose,
    readDeviceStatus,
    warmDeviceHistory: false,
    onSnapshot: publish,
  });
  const [a, b] = await Promise.all([load(), load()]);
  expect(a).toEqual(b);
  expect(readGlucose).toHaveBeenCalledTimes(5);
  expect(readDeviceStatus).toHaveBeenCalledTimes(1);
  for (const call of readGlucose.mock.calls as unknown as number[][]) {
    expect(call[1]! - call[0]!).toBeLessThanOrEqual(7 * 1440 * MIN);
  }
  expect(publish).toHaveBeenCalledTimes(1);
  await load();
  expect(readGlucose).toHaveBeenCalledTimes(5);
});

it('rejects an old-scope completion and publishes only the active person', async () => {
  let scope = 'a';
  let resolve: (value: typeof readings) => void = () => {};
  const deferred = new Promise<typeof readings>(r => {
    resolve = r;
  });
  const publish = jest.fn();
  const readGlucose = jest
    .fn()
    .mockReturnValueOnce(deferred)
    .mockResolvedValue(readings.map(p => ({...p, sgv: 100})));
  const load = createGlucoseForecastLoader({
    getScopeKey: () => scope,
    now: () => NOW,
    readGlucose,
    readDeviceStatus: async () => [],
    warmDeviceHistory: false,
    onSnapshot: publish,
  });
  const old = load();
  const rejected = old.catch((error: Error) => error);
  scope = 'b';
  const current = await load();
  resolve(readings);
  expect(await rejected).toEqual(
    new Error('Forecast source changed during loading.'),
  );
  expect(current.history.every(p => p.sgv === 100)).toBe(true);
  expect(publish).toHaveBeenCalledTimes(1);
});

it('can return available forecasts while older Loop context is still loading', async () => {
  const pending = new Promise<readonly unknown[]>(() => {});
  const readDeviceStatus = jest
    .fn()
    .mockResolvedValueOnce([])
    .mockReturnValue(pending);
  const load = createGlucoseForecastLoader({
    getScopeKey: () => 'a',
    now: () => NOW,
    readGlucose: async () => readings,
    readDeviceStatus,
  });
  const result = await load();
  expect(result.series[0]?.id).toBe('nightscout');
  expect(readDeviceStatus).toHaveBeenCalledTimes(3);
  for (const call of readDeviceStatus.mock.calls) {
    expect(call[1] - call[0]).toBeLessThanOrEqual(120 * MIN);
  }
});

it('does not turn unavailable loads into measured zero or stale glucose into a forecast', async () => {
  const load = createGlucoseForecastLoader({
    getScopeKey: () => 'a',
    now: () => NOW + 30 * MIN,
    readGlucose: async () => readings,
    readDeviceStatus: async () => {
      throw new Error('offline');
    },
    warmDeviceHistory: false,
  });
  const result = await load();
  expect(result.series).toEqual([]);
  expect(result.context.iobUnits).toBeUndefined();
});

it('does not publish cached live data with a new timestamp after a current source failure', async () => {
  let at = NOW;
  let offline = false;
  const publish = jest.fn();
  const load = createGlucoseForecastLoader({
    getScopeKey: () => 'a',
    now: () => at,
    readGlucose: async () => {
      if (offline) {
        throw new Error('offline');
      }
      return readings;
    },
    readDeviceStatus: async () => [],
    warmDeviceHistory: false,
    onSnapshot: publish,
  });
  await load();
  at += 5 * MIN;
  offline = true;
  await expect(load()).rejects.toThrow('offline');
  expect(publish).toHaveBeenCalledTimes(1);
});
