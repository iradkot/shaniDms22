import type {InsulinContext} from 'app/services/insulin/insulinDataSource';
import {calculateInsulinContextMetrics} from 'app/services/insulin/insulinRangeMetrics';
import type {BasalProfile} from 'app/types/insulin.types';
const start = new Date('2026-09-06T08:00:00.000Z');
const end = new Date('2026-09-06T09:00:00.000Z');
const context = (
  basalProfileData: BasalProfile = [{time: '00:00', value: 1}],
): InsulinContext => ({
  treatments: [],
  deviceStatus: [],
  profileData: null,
  insulinData: [],
  basalProfileData,
  carbTreatments: [],
  loadSamples: [],
  availability: {
    treatments: 'available',
    profile: 'available',
    deviceStatus: 'available',
  },
  freshness: {kind: 'fresh', fetchedAtMs: end.getTime()},
});

test.each(['treatments', 'profile'] as const)(
  'does not publish current totals from stale %s evidence',
  resource => {
    const stale = context();
    expect(() =>
      calculateInsulinContextMetrics(
        {...stale, availability: {...stale.availability, [resource]: 'stale'}},
        start,
        end,
      ),
    ).toThrow();
  },
);

test.each([
  {time: '00:00', value: Number.NaN},
  {time: '00:00', value: -1},
  {time: '00:00', value: Number.POSITIVE_INFINITY},
  {time: 'invalid', value: 1},
  {time: '24:00', value: 1},
  {time: '12:75', value: 1},
  {time: '00:00', timeAsSeconds: -1, value: 1},
  {time: '00:00', timeAsSeconds: 86_400, value: 1},
  {time: '00:00', timeAsSeconds: Number.NaN, value: 1},
])(
  'does not turn an invalid basal schedule entry into a zero or clamped delivery total: %j',
  entry => {
    expect(() =>
      calculateInsulinContextMetrics(context([entry]), start, end),
    ).toThrow();
  },
);

test('keeps a valid zero basal schedule and confirmed empty treatments as a known zero total', () => {
  expect(
    calculateInsulinContextMetrics(
      context([{time: '00:00', timeAsSeconds: 0, value: 0}]),
      start,
      end,
    ),
  ).toMatchObject({totalBasal: 0, totalBolus: 0, totalInsulin: 0});
});

test('identifies profile-derived totals as modeled even when the inputs are fresh', () => {
  expect(calculateInsulinContextMetrics(context(), start, end)).toMatchObject({
    totalBasal: 1,
    basalEstimated: true,
  });
});

test('does not treat an unknown or unfinished bolus amount as zero in a modeled total', () => {
  expect(() =>
    calculateInsulinContextMetrics(
      {...context(), recordedInsulin: {quality: 'partial', basalUnits: 1}},
      start,
      end,
    ),
  ).toThrow();
});

test('uses the same verified history estimate as daily summaries instead of an old single schedule', () => {
  const withHistory = {
    ...context(),
    recordedInsulinPeriod: {startMs: start.getTime(), endMs: end.getTime()},
    recordedInsulin: {
      quality: 'partial' as const,
      bolusUnits: 2,
      estimatedBasalUnits: 4,
      estimatedTotalUnits: 6,
    },
  };
  expect(calculateInsulinContextMetrics(withHistory, start, end)).toMatchObject(
    {totalBasal: 4, totalBolus: 2, totalInsulin: 6, totalTempBasal: null},
  );
  expect(() =>
    calculateInsulinContextMetrics(
      {...withHistory, recordedInsulin: {quality: 'partial', bolusUnits: 2}},
      start,
      end,
    ),
  ).toThrow();
  expect(() =>
    calculateInsulinContextMetrics(
      withHistory,
      start,
      new Date(end.getTime() + 1),
    ),
  ).toThrow();
  expect(() =>
    calculateInsulinContextMetrics(
      {
        ...withHistory,
        recordedInsulin: {
          ...withHistory.recordedInsulin,
          estimatedTotalUnits: 99,
        },
      },
      start,
      end,
    ),
  ).toThrow();
});

test('does not attach an old programmed temp-basal subtotal to verified recorded basal delivery', () => {
  const base = {
    ...context(),
    insulinData: [{type: 'tempBasal' as const, rate: 1, duration: 60, startTime: start.toISOString(), endTime: end.toISOString()}],
  };
  const verified: InsulinContext = {
    ...base,
    recordedInsulinPeriod: {startMs: start.getTime(), endMs: end.getTime()},
    recordedInsulin: {quality: 'available', basalUnits: 0.8, bolusUnits: 0, basalEvidence: 'recorded', basalCoveredMs: end.getTime() - start.getTime(), basalCoveragePercent: 100},
  };
  expect(calculateInsulinContextMetrics(verified, start, end)).toMatchObject({totalBasal: 0.8, totalTempBasal: null, totalInsulin: 0.8});
  expect(calculateInsulinContextMetrics(base, start, end)).toMatchObject({totalBasal: 1, totalTempBasal: 1});
});
