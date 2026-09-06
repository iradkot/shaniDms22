import {buildDayGraph} from 'app/modules/dayGraph';
import {buildDayGraphChartPresentation} from 'app/product/dayGraph/DayGraphChartAdapter';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('buildDayGraphChartPresentation', () => {
  it('anchors to the latest real load when glucose has stopped, without counting missing markers as data', () => {
    const chart = buildDayGraphChartPresentation(
      buildDayGraph({
        period: {dayStartMs: 0, dayEndMs: DAY},
        expectedSampleIntervalMs: 5 * MINUTE,
        glucoseSamples: [
          {
            identity: {sourceId: 'ns', recordId: 'glucose'},
            timestampMs: HOUR,
            valueMgDl: 123,
          },
        ],
        timelineItems: [],
        activeLoadSamples: [
          {timestampMs: 2 * HOUR, iobUnits: 0},
          {timestampMs: 3 * HOUR},
        ],
      }),
    );
    expect(chart.fallbackAnchorTimeMs).toBe(2 * HOUR);
    expect(chart.loadSamples).toEqual([
      {timestampMs: 2 * HOUR, iob: 0},
      {timestampMs: 3 * HOUR},
    ]);
  });

  it('exposes load-only history without generating glucose readings and keeps failure states distinct from no data', () => {
    const dataAvailability = {
      treatments: 'unavailable',
      deviceStatus: 'stale',
      profile: 'available',
    } as const;
    const chart = buildDayGraphChartPresentation(
      buildDayGraph({
        period: {dayStartMs: 0, dayEndMs: DAY},
        expectedSampleIntervalMs: 5 * MINUTE,
        glucoseSamples: [],
        timelineItems: [],
        dataAvailability,
        activeLoadSamples: [
          {
            timestampMs: HOUR + MINUTE,
            iobUnits: -0.2,
            basalIobUnits: -0.2,
            cobGrams: 0,
          },
        ],
      }),
    );
    expect(chart.bgSamples).toEqual([]);
    expect(chart.loadSamples).toEqual([
      {timestampMs: HOUR + MINUTE, iob: -0.2, iobBasal: -0.2, cob: 0},
    ]);
    expect(chart.loadSamples[0]).not.toHaveProperty('sgv');
    expect(chart.availability).toMatchObject({
      activeInsulin: true,
      activeCarbohydrates: true,
    });
    expect(chart.dataAvailability).toEqual(dataAvailability);
    expect(chart.fallbackAnchorTimeMs).toBe(HOUR + MINUTE);
  });

  it('keeps independent load timestamps even when glucose is sampled a minute later', () => {
    const chart = buildDayGraphChartPresentation(
      buildDayGraph({
        period: {dayStartMs: 0, dayEndMs: DAY},
        expectedSampleIntervalMs: 5 * MINUTE,
        glucoseSamples: [
          {
            identity: {sourceId: 'ns', recordId: 'glucose'},
            timestampMs: HOUR + MINUTE,
            valueMgDl: 123,
          },
        ],
        timelineItems: [],
        activeLoadSamples: [{timestampMs: HOUR, iobUnits: 1.2}],
      }),
    );
    expect(chart.loadSamples).toEqual([{timestampMs: HOUR, iob: 1.2}]);
    expect(chart.bgSamples[0]?.date).toBe(HOUR + MINUTE);
  });

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
