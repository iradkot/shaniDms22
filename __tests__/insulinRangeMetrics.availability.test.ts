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
