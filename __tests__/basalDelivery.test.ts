import {buildBasalDeliveryTimeline} from '../src/utils/insulin.utils/basalDeliveryTimeline';
import {calculateScheduledBasalInsulin} from '../src/utils/insulin.utils/calculateScheduledBasalInsulin';
import {calculateTotalInsulin} from '../src/utils/insulin.utils/calculateTotalInsulin';
import type {BasalProfile, InsulinDataEntry} from '../src/types/insulin.types';

const profile: BasalProfile = [
  {time: '00:00', timeAsSeconds: 0, value: 0.5},
  {time: '06:00', timeAsSeconds: 6 * 3600, value: 1},
  {time: '22:00', timeAsSeconds: 22 * 3600, value: 0.75},
];

describe('basal delivery calculations', () => {
  it('includes the complete final hour of a calendar day', () => {
    const start = new Date(2026, 5, 6, 0, 0, 0, 0);
    const end = new Date(2026, 5, 7, 0, 0, 0, 0);

    expect(calculateScheduledBasalInsulin(profile, start, end)).toBeCloseTo(20.5);
  });

  it('calculates partial ranges from the actual clock time', () => {
    const start = new Date(2026, 5, 6, 21, 30, 0, 0);
    const end = new Date(2026, 5, 6, 22, 30, 0, 0);

    expect(calculateScheduledBasalInsulin(profile, start, end)).toBeCloseTo(0.875);
  });

  it('uses the latest temp basal as an override instead of double counting overlaps', () => {
    const start = new Date(2026, 5, 6, 10, 0, 0, 0);
    const end = new Date(2026, 5, 6, 12, 0, 0, 0);
    const insulinData: InsulinDataEntry[] = [
      {
        type: 'tempBasal',
        rate: 2,
        duration: 120,
        timestamp: new Date(2026, 5, 6, 10, 0, 0, 0).toISOString(),
      },
      {
        type: 'tempBasal',
        rate: 0.5,
        duration: 60,
        timestamp: new Date(2026, 5, 6, 11, 0, 0, 0).toISOString(),
      },
    ];

    const segments = buildBasalDeliveryTimeline({
      basalProfile: profile,
      insulinData,
      startDate: start,
      endDate: end,
    });
    expect(segments.map(({rate}) => rate)).toEqual([2, 0.5]);
    expect(calculateTotalInsulin(insulinData, profile, start, end).totalBasal).toBeCloseTo(2.5);
  });
});
