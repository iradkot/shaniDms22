import {
  buildDayGraph,
  type DayGraphGlucoseSample,
  type DayGraphTimelineItem,
} from 'app/modules/dayGraph';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * 60 * MINUTE;

const externalCarb = (
  recordId: string,
  timestampMs: number,
  sourceId = 'nightscout:primary',
): DayGraphTimelineItem => ({
  kind: 'external-carb',
  identity: {sourceId, recordId},
  sourceLabel: 'Nightscout',
  timestampMs,
  title: 'Carbohydrates',
  carbohydratesGrams: 5,
});

describe('buildDayGraph', () => {
  it('removes only repeated stable identities and keeps nearby carb records distinct', () => {
    const first = externalCarb('carb-1', 10 * MINUTE);
    const duplicate = {...first, title: 'Duplicate delivery'};
    const nearbyDistinct = externalCarb('carb-2', 11 * MINUTE);
    const sameRecordFromAnotherSource = externalCarb(
      'carb-1',
      10 * MINUTE,
      'nightscout:secondary',
    );

    const model = buildDayGraph({
      period: {dayStartMs: 0, dayEndMs: DAY},
      expectedSampleIntervalMs: 5 * MINUTE,
      glucoseSamples: [],
      timelineItems: [
        first,
        nearbyDistinct,
        duplicate,
        sameRecordFromAnotherSource,
      ],
    });

    expect(model.timelineItems.map(item => item.identity)).toEqual([
      {sourceId: 'nightscout:primary', recordId: 'carb-1'},
      {sourceId: 'nightscout:secondary', recordId: 'carb-1'},
      {sourceId: 'nightscout:primary', recordId: 'carb-2'},
    ]);
    expect(model.quality.duplicateTimelineItemCount).toBe(1);
  });

  it('keeps same-time glucose records with different IDs and splits the line at visible gaps', () => {
    const glucoseSamples: readonly DayGraphGlucoseSample[] = [
      {
        identity: {sourceId: 'nightscout:primary', recordId: 'sgv-1'},
        timestampMs: 5 * MINUTE,
        valueMgDl: 100,
      },
      {
        identity: {sourceId: 'nightscout:primary', recordId: 'sgv-2'},
        timestampMs: 5 * MINUTE,
        valueMgDl: 102,
      },
      {
        identity: {sourceId: 'nightscout:primary', recordId: 'sgv-2'},
        timestampMs: 5 * MINUTE,
        valueMgDl: 102,
      },
      {
        identity: {sourceId: 'nightscout:primary', recordId: 'sgv-3'},
        timestampMs: 10 * MINUTE,
        valueMgDl: 110,
      },
      {
        identity: {sourceId: 'nightscout:primary', recordId: 'sgv-4'},
        timestampMs: 40 * MINUTE,
        valueMgDl: 130,
      },
    ];

    const model = buildDayGraph({
      period: {dayStartMs: 0, dayEndMs: DAY},
      expectedSampleIntervalMs: 5 * MINUTE,
      glucoseSamples,
      timelineItems: [],
    });

    expect(
      model.glucoseSamples.map(sample => sample.identity.recordId),
    ).toEqual(['sgv-1', 'sgv-2', 'sgv-3', 'sgv-4']);
    expect(model.glucoseSegments.map(segment => segment.length)).toEqual([
      3, 1,
    ]);
    expect(model.dataGaps).toEqual([
      {startMs: 10 * MINUTE, endMs: 40 * MINUTE, durationMs: 30 * MINUTE},
    ]);
    expect(model.quality.duplicateGlucoseSampleCount).toBe(1);
  });

  it('filters records outside the selected day and reports factual glucose bounds', () => {
    const model = buildDayGraph({
      period: {dayStartMs: DAY, dayEndMs: 2 * DAY},
      expectedSampleIntervalMs: 5 * MINUTE,
      glucoseSamples: [
        {
          identity: {sourceId: 'nightscout:primary', recordId: 'before'},
          timestampMs: DAY - 1,
          valueMgDl: 40,
        },
        {
          identity: {sourceId: 'nightscout:primary', recordId: 'min'},
          timestampMs: DAY + MINUTE,
          valueMgDl: 72,
        },
        {
          identity: {sourceId: 'nightscout:primary', recordId: 'max'},
          timestampMs: DAY + 2 * MINUTE,
          valueMgDl: 188,
        },
        {
          identity: {sourceId: 'nightscout:primary', recordId: 'invalid'},
          timestampMs: DAY + 3 * MINUTE,
          valueMgDl: Number.NaN,
        },
      ],
      timelineItems: [externalCarb('outside', 2 * DAY)],
    });

    expect(model.glucoseSummary).toEqual({
      sampleCount: 2,
      minimumMgDl: 72,
      maximumMgDl: 188,
      first: {timestampMs: DAY + MINUTE, valueMgDl: 72},
      last: {timestampMs: DAY + 2 * MINUTE, valueMgDl: 188},
    });
    expect(model.timelineItems).toHaveLength(0);
    expect(model.quality.excludedGlucoseSampleCount).toBe(2);
    expect(model.quality.excludedTimelineItemCount).toBe(1);
  });

  it('builds chart-ready load, insulin, and basal context without inventing missing values', () => {
    const model = buildDayGraph({
      period: {dayStartMs: 0, dayEndMs: DAY},
      expectedSampleIntervalMs: 5 * MINUTE,
      glucoseSamples: [
        {
          identity: {sourceId: 'nightscout:primary', recordId: 'sgv-1'},
          timestampMs: 60 * MINUTE,
          valueMgDl: 108,
          direction: 'FortyFiveUp',
        },
        {
          identity: {sourceId: 'nightscout:primary', recordId: 'sgv-2'},
          timestampMs: 65 * MINUTE,
          valueMgDl: 116,
        },
      ],
      activeLoadSamples: [
        {
          timestampMs: 59 * MINUTE,
          iobUnits: -0.2,
          basalIobUnits: -0.3,
          bolusIobUnits: 0.1,
          cobGrams: 18,
        },
        {
          timestampMs: 5 * HOUR,
          iobUnits: 9,
          cobGrams: 90,
        },
      ],
      insulinEvents: [
        {kind: 'bolus', timestampMs: 70 * MINUTE, units: 1.25},
        {
          kind: 'temp-basal',
          startMs: -10 * MINUTE,
          endMs: 20 * MINUTE,
          rateUnitsPerHour: 0.85,
        },
      ],
      basalSchedule: [
        {secondsFromMidnight: 12 * 60 * 60, rateUnitsPerHour: 0.9},
        {secondsFromMidnight: 0, rateUnitsPerHour: 0.75},
      ],
      timelineItems: [],
    });

    expect(model.glucoseSamples[0]).toMatchObject({
      direction: 'FortyFiveUp',
      iobUnits: -0.2,
      basalIobUnits: -0.3,
      bolusIobUnits: 0.1,
      cobGrams: 18,
    });
    expect(model.glucoseSamples[1]).toMatchObject({
      timestampMs: 65 * MINUTE,
      iobUnits: -0.2,
      cobGrams: 18,
    });
    expect(model.glucoseSamples[1]).not.toHaveProperty('direction');
    expect(model.insulinEvents).toEqual([
      {
        kind: 'temp-basal',
        startMs: -10 * MINUTE,
        endMs: 20 * MINUTE,
        rateUnitsPerHour: 0.85,
      },
      {kind: 'bolus', timestampMs: 70 * MINUTE, units: 1.25},
    ]);
    expect(model.basalSchedule).toEqual([
      {secondsFromMidnight: 0, rateUnitsPerHour: 0.75},
      {secondsFromMidnight: 12 * 60 * 60, rateUnitsPerHour: 0.9},
    ]);
  });
});
