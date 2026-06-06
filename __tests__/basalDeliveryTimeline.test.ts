import {
  buildBasalDeliveryTimeline,
  sumBasalDelivery,
} from '../src/utils/insulin.utils/basalDeliveryTimeline';
import {calculateTotalInsulin} from '../src/utils/insulin.utils/calculateTotalInsulin';
import type {BasalProfile, InsulinDataEntry} from '../src/types/insulin.types';

const profile: BasalProfile = [
  {time: '00:00', timeAsSeconds: 0, value: 1},
  {time: '23:00', timeAsSeconds: 23 * 3600, value: 2},
];

function localDate(day: number, hour = 0, minute = 0) {
  return new Date(2026, 0, day, hour, minute, 0, 0);
}

describe('basal delivery timeline', () => {
  it('includes the final hour of a full day', () => {
    const segments = buildBasalDeliveryTimeline({
      basalProfile: profile,
      startDate: localDate(1),
      endDate: localDate(2),
    });

    expect(sumBasalDelivery(segments)).toBeCloseTo(25, 6);
  });

  it('preserves exact partial-hour range boundaries', () => {
    const segments = buildBasalDeliveryTimeline({
      basalProfile: profile,
      startDate: localDate(1, 22, 30),
      endDate: localDate(1, 23, 30),
    });

    expect(sumBasalDelivery(segments)).toBeCloseTo(1.5, 6);
  });

  it('uses temp basal as a replacement for scheduled basal', () => {
    const insulinData: InsulinDataEntry[] = [
      {
        type: 'tempBasal',
        rate: 2,
        duration: 60,
        timestamp: localDate(1, 10).toISOString(),
      },
    ];

    const segments = buildBasalDeliveryTimeline({
      basalProfile: profile,
      insulinData,
      startDate: localDate(1, 9),
      endDate: localDate(1, 12),
    });

    expect(sumBasalDelivery(segments)).toBeCloseTo(4, 6);
  });

  it('truncates an older temp basal when a newer one starts', () => {
    const insulinData: InsulinDataEntry[] = [
      {
        type: 'tempBasal',
        rate: 2,
        duration: 120,
        timestamp: localDate(1, 10).toISOString(),
      },
      {
        type: 'tempBasal',
        rate: 0.5,
        duration: 30,
        timestamp: localDate(1, 11).toISOString(),
      },
    ];

    const segments = buildBasalDeliveryTimeline({
      basalProfile: profile,
      insulinData,
      startDate: localDate(1, 10),
      endDate: localDate(1, 12),
    });

    expect(sumBasalDelivery(segments)).toBeCloseTo(2.75, 6);
  });

  it('clips overrides and boluses to the requested range', () => {
    const insulinData: InsulinDataEntry[] = [
      {
        type: 'tempBasal',
        rate: 3,
        duration: 120,
        timestamp: localDate(1, 9).toISOString(),
      },
      {type: 'bolus', amount: 4, timestamp: localDate(1, 9).toISOString()},
      {type: 'bolus', amount: 2, timestamp: localDate(1, 10, 30).toISOString()},
    ];

    const totals = calculateTotalInsulin(
      insulinData,
      profile,
      localDate(1, 10),
      localDate(1, 11),
    );

    expect(totals.totalBasal).toBeCloseTo(3, 6);
    expect(totals.totalBolus).toBe(2);
  });
});
