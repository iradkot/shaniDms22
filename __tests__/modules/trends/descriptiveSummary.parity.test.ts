import {buildDailyOverview, getLocalDayPeriod} from 'app/modules/dailyOverview';
import {
  buildPreviousDaySummary,
  getPreviousDaySummaryWindow,
  type PreviousDayLocalCalendar,
} from 'app/modules/previousDaySummary';
import {
  buildTrendsOverview,
  type TrendsGlucoseSample,
  type TrendsPeriod,
} from 'app/modules/trends';

// Jest runs in Node, while the shared app's strict typecheck intentionally has
// no Node typings. Describe only the built-in hashing seam this test consumes.
const {createHash} = require('node:crypto') as {
  readonly createHash: (algorithm: 'sha256') => {
    readonly update: (value: string) => {
      readonly digest: (encoding: 'hex') => string;
    };
  };
};

const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
const UTC_CALENDAR: PreviousDayLocalCalendar = {
  startOfDay: timestampMs => Math.floor(timestampMs / DAY_MS) * DAY_MS,
  moveDays: (dayStartMs, dayDelta) => dayStartMs + dayDelta * DAY_MS,
  atHour: (dayStartMs, hour) => dayStartMs + hour * HOUR_MS,
};
const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
};

const seededSamples = (
  seed: number,
  period: TrendsPeriod,
): readonly TrendsGlucoseSample[] => {
  let state = seed;
  const next = (): number => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state;
  };
  const cadenceMs = (period.endMs - period.startMs) / 60;
  const result: TrendsGlucoseSample[] = [];
  for (let index = 0; index < 60; index += 1) {
    if (next() % 5 === 0) {
      continue;
    }
    const sample = {
      timestampMs: period.startMs + index * cadenceMs,
      valueMgDl: (next() % 35000) / 100 + 20,
    };
    result.unshift(sample);
    if (index % 7 === 0) {
      result.push({...sample, valueMgDl: 400});
    }
  }
  return [
    ...result,
    {timestampMs: period.startMs - 1, valueMgDl: 100},
    {timestampMs: period.endMs, valueMgDl: 120},
    {timestampMs: period.startMs + 1, valueMgDl: NaN},
    {timestampMs: period.startMs + 2, valueMgDl: 0},
    {timestampMs: Infinity, valueMgDl: 100},
  ];
};

const digest = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');

describe('descriptive glucose public-output parity', () => {
  it('preserves seeded outputs captured before replacing the repeated metric pipeline', () => {
    const dailyPeriod = getLocalDayPeriod(new Date(2026, 0, 15, 12).getTime());
    const window = getPreviousDaySummaryWindow({
      anchorDayStartMs: 100 * DAY_MS,
      nowMs: 102 * DAY_MS,
      calendar: UTC_CALENDAR,
    });
    const referenceWindow = getPreviousDaySummaryWindow({
      anchorDayStartMs: 99 * DAY_MS,
      nowMs: 102 * DAY_MS,
      calendar: UTC_CALENDAR,
    });
    const outputs = Array.from({length: 24}, (_, index) => {
      const seed = index + 1;
      const selectedThresholds =
        seed % 2 === 0
          ? {...thresholds, targetMinMgDl: 80, targetMaxMgDl: 160}
          : thresholds;
      const period = {
        startMs: 20 * DAY_MS,
        endMs: (seed % 3 === 0 ? 21 : 34) * DAY_MS,
      };
      const daily = buildDailyOverview({
        period: dailyPeriod,
        expectedSampleIntervalMs: DAY_MS / 60,
        thresholds: selectedThresholds,
        source: {
          glucoseSamples: seededSamples(seed, dailyPeriod),
          insulinSummary: {
            quality: 'available',
            basalUnits: 7.23,
            bolusUnits: 4.86,
          },
        },
      });
      return {
        trends: buildTrendsOverview({
          period,
          samples: seededSamples(seed, period),
          expectedSampleIntervalMs: (period.endMs - period.startMs) / 60,
          thresholds: selectedThresholds,
          timeZoneOffsetMinutes: seed % 2 === 0 ? -210 : 330,
        }),
        // Keep the captured daily result independent of the host timezone.
        daily: {
          ...daily,
          period: {startMs: 0, endMs: dailyPeriod.endMs - dailyPeriod.startMs},
          lastReadingTimestampMs:
            daily.lastReadingTimestampMs === undefined
              ? undefined
              : daily.lastReadingTimestampMs - dailyPeriod.startMs,
        },
        previous: buildPreviousDaySummary({
          window,
          expectedSampleIntervalMs: HOUR_MS / 2,
          thresholds: selectedThresholds,
          source: {
            glucoseSamples: seededSamples(seed, window.period),
            insulinSummary: {quality: 'unavailable'},
            events: [
              {
                id: 'meal',
                kind: 'meal',
                title: 'Meal',
                timestampMs: window.period.startMs + 12 * HOUR_MS,
              },
            ],
          },
          comparison: {
            window: referenceWindow,
            source: {
              glucoseSamples: seededSamples(seed + 10, referenceWindow.period),
              insulinSummary: {quality: 'unavailable'},
              events: [],
            },
          },
        }),
      };
    });

    // Golden hashes cover every public field over 24 reproducible fixtures;
    // the neighboring domain tests document individual medical expectations.
    expect({
      trends: digest(outputs.map(output => output.trends)),
      daily: digest(outputs.map(output => output.daily)),
      previous: digest(outputs.map(output => output.previous)),
    }).toMatchInlineSnapshot(`
      {
        "daily": "46e82db7bf1067c1d20af58f6e11a352742f071f9e9d7f842ec711376b9b08af",
        "previous": "bc34c3f22ce8b5ec411c0979d8d55be9965b616075582e0c7136d64b92ddb37d",
        "trends": "79bad2e856e2b4831963dd7bac03fdf9eaa547e958c26a9687a4a75c0be46df6",
      }
    `);
  });
});
