import {
  buildGlucoseForecast,
  decodeForecastDeviceStatus,
  nightscoutAr2,
  futureLoopPoints,
} from '../../../src/modules/glucoseForecast';
import type {ForecastReading} from '../../../src/modules/glucoseForecast';

const MIN = 60_000;
const DAY = 1440 * MIN;
const NOW = Date.parse('2026-09-07T12:00:00Z');
const point = (minutes: number, sgv: number): ForecastReading => ({
  ts: NOW + minutes * MIN,
  sgv,
});
const glucose = [
  point(-15, 120),
  point(-10, 125),
  point(-5, 130),
  point(0, 135),
];
const status = (overrides: Record<string, unknown> = {}) => ({
  created_at: new Date(NOW).toISOString(),
  loop: {
    timestamp: new Date(NOW).toISOString(),
    predicted: {
      startDate: new Date(NOW).toISOString(),
      values: [135, 137, 139, 141, 143, 145, 147, 149],
    },
    iob: {timestamp: new Date(NOW).toISOString(), iob: -0.2},
    cob: {timestamp: new Date(NOW).toISOString(), cob: 0},
    ...overrides,
  },
});

describe('source forecasts and trustworthy timing', () => {
  it('keeps the compact snapshot on the same absolute Loop clock without a guessed fallback', () => {
    expect(futureLoopPoints(status(), NOW).slice(0, 3)).toEqual([
      point(5, 137),
      point(10, 139),
      point(15, 141),
    ]);
    expect(
      futureLoopPoints(status({predicted: {values: [120, 130, 140]}}), NOW),
    ).toEqual([]);
    expect(futureLoopPoints(status(), NOW + 15 * MIN)).toEqual([]);
  });
  it('matches the AR2 equilibrium fixture and rejects a missing CGM interval', () => {
    expect(nightscoutAr2(point(-5, 140), point(0, 140))).toEqual(
      [5, 10, 15, 20, 25, 30].map(t => point(t, 140)),
    );
    expect(nightscoutAr2(point(-20, 140), point(0, 140))).toEqual([]);
  });
  it('uses Loop startDate and preserves negative IOB and zero COB', () => {
    const result = buildGlucoseForecast({
      nowMs: NOW,
      glucose,
      deviceStatus: [status()],
    });
    expect(result.series.find(s => s.id === 'loop')?.points[5]).toEqual(
      point(30, 147),
    );
    expect(result.context).toMatchObject({iobUnits: -0.2, cobGrams: 0});
    expect(
      result.series.find(s => s.id === 'ensemble')?.calibration.status,
    ).toBe('uncalibrated');
    expect(
      result.series.every(s => s.calibration.within20Percent === undefined),
    ).toBe(true);
  });
  it('never guesses prediction start or interprets glucose effects as insulin/carbs', () => {
    const decoded = decodeForecastDeviceStatus(
      status({
        iob: undefined,
        cob: undefined,
        predicted: {values: [130, 140], IOB: [100, 90], COB: [130, 160]},
      }),
    );
    expect(decoded?.loopPrediction).toBeUndefined();
    expect(decoded?.iobUnits).toBeUndefined();
    expect(decoded?.cobGrams).toBeUndefined();
  });
  it('uses independent Loop/IOB/COB freshness instead of a fresh outer upload', () => {
    const old = new Date(NOW - 30 * MIN).toISOString();
    const result = buildGlucoseForecast({
      nowMs: NOW,
      glucose,
      deviceStatus: [
        status({
          timestamp: old,
          iob: {iob: 2, timestamp: old},
          cob: {cob: 10, timestamp: old},
        }),
      ],
    });
    expect(result.series.map(s => s.id)).toEqual(['nightscout']);
    expect(result.context.iobUnits).toBeUndefined();
    expect(result.context.cobGrams).toBeUndefined();
  });
  it('hides stale glucose and never resets a past Loop target to now', () => {
    expect(
      buildGlucoseForecast({
        nowMs: NOW + 16 * MIN,
        glucose,
        deviceStatus: [status()],
      }).series,
    ).toEqual([]);
    const shifted = status({
      predicted: {
        startDate: new Date(NOW - 5 * MIN).toISOString(),
        values: [100, 110, 120, 130, 140, 150, 160, 170],
      },
    });
    const loop = buildGlucoseForecast({
      nowMs: NOW,
      glucose,
      deviceStatus: [shifted],
    }).series.find(s => s.id === 'loop');
    expect(loop?.points[5]).toEqual(point(30, 170));
  });
  it('ignores future readings/uploads and malformed numbers', () => {
    const clean = buildGlucoseForecast({nowMs: NOW, glucose});
    const mixed = buildGlucoseForecast({
      nowMs: NOW,
      glucose: [...glucose, point(5, 300), point(10, NaN)],
      deviceStatus: [
        {...status(), created_at: new Date(NOW + MIN).toISOString()},
      ],
    });
    expect(mixed.series).toEqual(clean.series);
  });
  it('prefers the newest own source times despite late uploads of older reports', () => {
    const old = new Date(NOW - 10 * MIN).toISOString();
    const newer = {
      ...status(),
      created_at: new Date(NOW - MIN).toISOString(),
      loop: {
        ...status().loop,
        timestamp: new Date(NOW - MIN).toISOString(),
      },
    };
    const delayed = status({
      timestamp: old,
      iob: {timestamp: old, iob: 8},
      cob: {timestamp: old, cob: 50},
      predicted: {startDate: old, values: Array(14).fill(250)},
    });
    const result = buildGlucoseForecast({
      nowMs: NOW,
      glucose,
      deviceStatus: [newer, delayed],
    });
    expect(result.series.find(s => s.id === 'loop')?.points[5]?.sgv).toBe(147);
    expect(result.context).toMatchObject({iobUnits: -0.2, cobGrams: 0});
  });
  it('retains valid near-term Loop points when only a far-future mathematical projection is negative', () => {
    const result = buildGlucoseForecast({
      nowMs: NOW,
      glucose,
      deviceStatus: [
        status({
          predicted: {
            startDate: new Date(NOW).toISOString(),
            values: [135, 137, 139, 141, 143, 145, 147, -20],
          },
        }),
      ],
    });
    expect(result.series.find(s => s.id === 'loop')?.points[5]?.sgv).toBe(147);
  });
});

function history(days: number) {
  const first = NOW - days * DAY;
  const value = (ts: number) =>
    Math.round(140 + 45 * Math.sin(((ts - first) / (90 * MIN)) * 2 * Math.PI));
  const readings: ForecastReading[] = [];
  for (let ts = first; ts <= NOW; ts += 5 * MIN) {
    readings.push({ts, sgv: value(ts)});
  }
  const statuses = readings.map(reading => ({
    ts: reading.ts,
    loopTimestampMs: reading.ts,
    loopPrediction: {
      startMs: reading.ts,
      values: Array.from({length: 7}, (_, i) =>
        value(reading.ts + i * 5 * MIN),
      ),
    },
    iobUnits: -0.3,
    iobTimestampMs: reading.ts,
    cobGrams: 0,
    cobTimestampMs: reading.ts,
  }));
  return {readings, statuses};
}

describe('personal historical evaluation', () => {
  const data = history(16);
  it('uses the most recent activity regardless of the journal list order', () => {
    const events = data.readings
      .filter((_, i) => i % 6 === 0)
      .map(p => ({kind: 'activity' as const, ts: p.ts, recordedAtMs: p.ts}));
    const chronological = buildGlucoseForecast({
      nowMs: NOW,
      glucose: data.readings,
      events,
    });
    const descending = buildGlucoseForecast({
      nowMs: NOW,
      glucose: data.readings,
      events: [...events].reverse(),
    });
    expect(chronological.context.features).toContain('activity');
    expect(descending.series).toEqual(chronological.series);
  });
  it('evaluates each real model, including measured loads, on separate chronological origins', () => {
    const result = buildGlucoseForecast({
      nowMs: NOW,
      glucose: data.readings,
      deviceStatus: data.statuses,
    });
    expect(result.series.map(s => s.id)).toEqual([
      'nightscout',
      'loop',
      'personalized',
      'ensemble',
    ]);
    const loop = result.series.find(s => s.id === 'loop')!;
    const ns = result.series.find(s => s.id === 'nightscout')!;
    expect(loop.calibration.within20Percent).toBe(100);
    expect(loop.calibration.sampleCount).toBeGreaterThanOrEqual(30);
    expect(ns.calibration.within20Percent).toBeLessThan(100);
    expect(result.context.features).toEqual(
      expect.arrayContaining(['time-of-day', 'day-of-week', 'iob', 'cob']),
    );
    expect(
      result.series
        .find(s => s.id === 'personalized')!
        .points.every(p => p.lower !== undefined && p.upper !== undefined),
    ).toBe(true);
    expect(result.context.matchedExamples).toBeGreaterThanOrEqual(20);
  });
  it('does not learn from future outcomes, future journal edits or later uploads', () => {
    const origin = NOW - 2 * DAY;
    const cut = data.readings.filter(p => p.ts <= origin);
    const statuses = data.statuses.filter(s => s.ts <= origin);
    const before = buildGlucoseForecast({
      nowMs: origin,
      glucose: cut,
      deviceStatus: statuses,
    });
    const after = buildGlucoseForecast({
      nowMs: origin,
      glucose: data.readings,
      deviceStatus: data.statuses,
      events: [
        {kind: 'meal', ts: origin - MIN, carbsGrams: 400, recordedAtMs: NOW},
      ],
    });
    expect(after).toEqual(before);
  });
  it('declines personalized forecasts from a sparse long span or less than seven days', () => {
    const short = history(4);
    expect(
      buildGlucoseForecast({nowMs: NOW, glucose: short.readings}).series.some(
        s => s.id === 'personalized',
      ),
    ).toBe(false);
    const sparse = [data.readings[0]!, ...glucose];
    const result = buildGlucoseForecast({nowMs: NOW, glucose: sparse});
    expect(result.series.some(s => s.id === 'personalized')).toBe(false);
    expect(result.series[0]?.calibration.within20Percent).toBeUndefined();
  });
});
