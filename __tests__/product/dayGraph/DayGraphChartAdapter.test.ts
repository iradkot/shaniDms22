import {buildDayGraph} from 'app/modules/dayGraph';
import {buildDayGraphChartPresentation} from 'app/product/dayGraph/DayGraphChartAdapter';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('buildDayGraphChartPresentation', () => {
  it('projects the normalized Day Graph model into the existing rich chart inputs', () => {
    const model = buildDayGraph({
      period: {dayStartMs: 0, dayEndMs: DAY},
      expectedSampleIntervalMs: 5 * MINUTE,
      glucoseSamples: [
        {
          identity: {sourceId: 'ns', recordId: 'g-1'},
          timestampMs: HOUR,
          valueMgDl: 123,
          direction: 'SingleUp',
          device: 'Loop',
        },
      ],
      activeLoadSamples: [
        {
          timestampMs: HOUR,
          iobUnits: 1.4,
          bolusIobUnits: 1.1,
          basalIobUnits: 0.3,
          cobGrams: 22,
        },
      ],
      insulinEvents: [
        {kind: 'bolus', timestampMs: HOUR + MINUTE, units: 1.2},
        {
          kind: 'temp-basal',
          startMs: HOUR,
          endMs: 2 * HOUR,
          rateUnitsPerHour: 0.95,
        },
        {kind: 'suspend', startMs: 3 * HOUR, endMs: 3 * HOUR + 15 * MINUTE},
      ],
      basalSchedule: [
        {secondsFromMidnight: 0, rateUnitsPerHour: 0.7},
        {secondsFromMidnight: 12 * 60 * 60, rateUnitsPerHour: 0.85},
      ],
      timelineItems: [
        {
          kind: 'external-carb',
          identity: {sourceId: 'ns', recordId: 'carb-1'},
          sourceLabel: 'Nightscout',
          timestampMs: HOUR + 2 * MINUTE,
          title: 'Breakfast carbs',
          carbohydratesGrams: 30,
        },
        {
          kind: 'journal-activity',
          identity: {sourceId: 'journal', recordId: 'activity-1'},
          sourceLabel: 'Journal',
          timestampMs: 4 * HOUR,
          title: 'Walk',
        },
      ],
    });

    const chart = buildDayGraphChartPresentation(model);

    expect(chart.bgSamples).toEqual([
      expect.objectContaining({
        sgv: 123,
        date: HOUR,
        direction: 'SingleUp',
        device: 'Loop',
        iob: 1.4,
        iobBolus: 1.1,
        iobBasal: 0.3,
        cob: 22,
      }),
    ]);
    expect(chart.foodItems).toEqual([
      expect.objectContaining({
        id: '2:ns6:carb-1',
        carbs: 30,
        name: 'Breakfast carbs',
        timestamp: HOUR + 2 * MINUTE,
      }),
    ]);
    expect(chart.insulinData).toEqual([
      {
        type: 'tempBasal',
        rate: 0.95,
        duration: 60,
        startTime: new Date(HOUR).toISOString(),
        endTime: new Date(2 * HOUR).toISOString(),
        timestamp: new Date(HOUR).toISOString(),
      },
      {
        type: 'bolus',
        amount: 1.2,
        timestamp: new Date(HOUR + MINUTE).toISOString(),
      },
      {
        type: 'suspendPump',
        suspend: true,
        duration: 15,
        startTime: new Date(3 * HOUR).toISOString(),
        endTime: new Date(3 * HOUR + 15 * MINUTE).toISOString(),
        timestamp: new Date(3 * HOUR).toISOString(),
      },
    ]);
    expect(chart.basalProfileData).toEqual([
      {time: '00:00', timeAsSeconds: 0, value: 0.7},
      {time: '12:00', timeAsSeconds: 43_200, value: 0.85},
    ]);
    expect(chart.availability).toEqual({
      activeInsulin: true,
      activeCarbohydrates: true,
      boluses: true,
      basal: true,
    });
    expect(chart.xDomain).toEqual([new Date(0), new Date(DAY)]);
  });
});
