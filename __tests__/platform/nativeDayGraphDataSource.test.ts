import {createNativeDayGraphDataSource} from 'app/platform/native/product/nativeDayGraphDataSource';
import {clearNightscoutInstance, configureNightscoutInstance} from 'app/api/shaniNightscoutInstances';

const period = {dayStartMs: 1_000, dayEndMs: 10_000};

const journal = {
  scope: {nightscoutSourceId: 'ns_opaque'},
  meals: {
    getListSnapshot: jest.fn(() => ({
      items: [
        {
          id: 'meal_1',
          mealStart: 4_000,
          name: 'Pasta',
          mealCarbohydrates: {kind: 'meal_carbohydrates', grams: 35},
        },
      ],
    })),
  },
  activities: {
    getListSnapshot: jest.fn(() => ({
      items: [
        {
          id: 'activity_1',
          category: 'walking',
          startedAt: 6_000,
          endedAt: 7_000,
          intensity: 'medium',
        },
      ],
    })),
  },
};

describe('createNativeDayGraphDataSource', () => {
  it('loads calendar glucose only, with bounded chunks and a known complete empty response', async () => {
    const fetchGlucoseRecords = jest.fn(async () => []);
    const loadInsulinContext = jest.fn();
    const loadTimelineItems = jest.fn();
    const source = createNativeDayGraphDataSource({
      fetchGlucoseRecords, loadInsulinContext, loadTimelineItems, journal,
      now: () => 123, useE2EFixtures: false,
    });
    jest.clearAllMocks();
    const result = await source.loadCalendarGlucose!({dayStartMs: 0, dayEndMs: 31 * 24 * 60 * 60 * 1000});
    expect(fetchGlucoseRecords).toHaveBeenCalledTimes(5);
    expect(loadInsulinContext).not.toHaveBeenCalled();
    expect(loadTimelineItems).not.toHaveBeenCalled();
    expect(journal.meals.getListSnapshot).not.toHaveBeenCalled();
    expect(journal.activities.getListSnapshot).not.toHaveBeenCalled();
    expect(result).toEqual({glucoseSamples: [], freshness: {kind: 'fresh', fetchedAtMs: 123}, complete: true});
  });

  it('marks stale or unverified calendar reads incomplete while keeping available glucose', async () => {
    const source = createNativeDayGraphDataSource({
      fetchGlucoseRange: async () => ({
        records: [{_id: 'bg_1', date: 2_000, sgv: 110}],
        freshness: {kind: 'stale', fetchedAtMs: 123, reason: 'network-unavailable'},
        complete: true,
      }),
      useE2EFixtures: false,
    });
    const result = await source.loadCalendarGlucose!(period);
    expect(result.glucoseSamples).toHaveLength(1);
    expect(result.complete).toBe(false);
    expect(result.freshness.kind).toBe('stale');
  });

  it('rejects a Nightscout source change during calendar chunk loading', async () => {
    configureNightscoutInstance({baseUrl: 'https://first.example'});
    try {
      const source = createNativeDayGraphDataSource({
        fetchGlucoseRecords: async () => {
          configureNightscoutInstance({baseUrl: 'https://second.example'});
          return [];
        },
        useE2EFixtures: false,
      });
      await expect(source.loadCalendarGlucose!(period)).rejects.toThrow('source changed');
    } finally {
      clearNightscoutInstance();
    }
  });

  it('combines Nightscout and local Journal records without proximity merging', async () => {
    const source = createNativeDayGraphDataSource({
      nightscoutSourceId: 'ns_opaque',
      fetchGlucoseRecords: async () => [{_id: 'bg_1', date: 2_000, sgv: 110}],
      fetchTreatmentRecords: async () => [
        {_id: 'carb_1', created_at: new Date(3_000).toISOString(), carbs: 5},
        {_id: 'carb_2', created_at: new Date(3_001).toISOString(), carbs: 5},
      ],
      fetchDeviceStatusRecords: async () => [],
      fetchProfile: async () => ({}),
      extractBasalProfile: () => [],
      journal,
      now: () => 9_000,
      useE2EFixtures: false,
    });

    const result = await source.loadDayGraph(period);

    expect(result.glucoseSamples).toEqual([
      {
        identity: {sourceId: 'ns_opaque', recordId: 'bg_1'},
        timestampMs: 2_000,
        valueMgDl: 110,
      },
    ]);
    expect(result.timelineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'external-carb',
          identity: {sourceId: 'ns_opaque', recordId: 'carb_1'},
          carbohydratesGrams: 5,
        }),
        expect.objectContaining({
          kind: 'external-carb',
          identity: {sourceId: 'ns_opaque', recordId: 'carb_2'},
          carbohydratesGrams: 5,
        }),
        expect.objectContaining({
          kind: 'journal-meal',
          identity: {sourceId: 'journal', recordId: 'meal_1'},
          carbohydratesGrams: 35,
        }),
        expect.objectContaining({
          kind: 'journal-activity',
          identity: {sourceId: 'journal', recordId: 'activity_1'},
          endTimestampMs: 7_000,
        }),
      ]),
    );
    expect(result.freshness).toEqual({kind: 'fresh', fetchedAtMs: 9_000});
    expect(journal.meals.getListSnapshot).toHaveBeenCalledWith({
      timeRange: {fromInclusive: 1_000, toExclusive: 10_000},
    });
  });

  it('keeps unidentified same-time source records distinct', async () => {
    const source = createNativeDayGraphDataSource({
      nightscoutSourceId: 'ns_opaque',
      fetchGlucoseRecords: async () => [
        {date: 2_000, sgv: 110},
        {date: 2_000, sgv: 110},
      ],
      fetchTreatmentRecords: async () => [],
      now: () => 9_000,
      useE2EFixtures: false,
    });

    const result = await source.loadDayGraph(period);
    expect(result.glucoseSamples).toHaveLength(2);
    expect(result.glucoseSamples[0]?.identity.recordId).not.toBe(
      result.glucoseSamples[1]?.identity.recordId,
    );
  });

  it('never uses a Nightscout URL or API token as a source identity', () => {
    expect(() =>
      createNativeDayGraphDataSource({
        nightscoutSourceId: 'https://secret.example/api?token=abc',
      }),
    ).toThrow(/opaque/i);
  });

  it('marks cached glucose or treatments stale instead of labeling them fresh', async () => {
    const source = createNativeDayGraphDataSource({
      nightscoutSourceId: 'ns_opaque',
      fetchGlucoseRange: async () => ({
        records: [{_id: 'bg_cached', date: 2_000, sgv: 110}],
        freshness: {
          kind: 'stale',
          fetchedAtMs: 8_000,
          reason: 'network-unavailable',
        },
      }),
      fetchTreatmentRange: async () => ({
        records: [],
        freshness: {kind: 'fresh', fetchedAtMs: 9_000},
      }),
      now: () => 10_000,
      useE2EFixtures: false,
    });

    await expect(source.loadDayGraph(period)).resolves.toMatchObject({
      freshness: {
        kind: 'stale',
        fetchedAtMs: 8_000,
        reason: expect.stringMatching(/out of date|unavailable/i),
      },
    });
  });

  it('marks the timeline incomplete when treatments have no network or cache result', async () => {
    const source = createNativeDayGraphDataSource({
      nightscoutSourceId: 'ns_opaque',
      fetchGlucoseRange: async () => ({
        records: [{_id: 'bg_fresh', date: 2_000, sgv: 110}],
        freshness: {kind: 'fresh', fetchedAtMs: 9_000},
      }),
      fetchTreatmentRange: async () => {
        throw new Error('offline without treatment cache');
      },
      journal,
      now: () => 10_000,
      useE2EFixtures: false,
    });

    const result = await source.loadDayGraph(period);
    expect(result.freshness.kind).toBe('stale');
    expect(result.timelineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({kind: 'journal-meal'}),
        expect.objectContaining({kind: 'journal-activity'}),
      ]),
    );
    expect(result.timelineItems.some(item => item.kind === 'treatment')).toBe(
      false,
    );
  });

  it('loads optional chart context without making glucose depend on it', async () => {
    const fetchDeviceStatusRecords = jest.fn(async () => [
      {
        mills: 2_100,
        loop: {
          iob: {iob: -0.2, bolusIob: 0.1, basalIob: -0.3},
          cob: {cob: 18},
        },
      },
    ]);
    const fetchProfile = jest.fn(async () => ({profile: 'opaque'}));
    const source = createNativeDayGraphDataSource({
      nightscoutSourceId: 'ns_opaque',
      fetchGlucoseRecords: async () => [
        {
          _id: 'bg_1',
          date: 2_000,
          sgv: 110,
          direction: 'SingleUp',
          device: 'Loop',
        },
      ],
      fetchTreatmentRecords: async () => [
        {
          _id: 'bolus_1',
          created_at: new Date(3_000).toISOString(),
          eventType: 'Correction Bolus',
          insulin: 1.25,
        },
        {
          _id: 'basal_1',
          created_at: new Date(4_000).toISOString(),
          eventType: 'Temp Basal',
          rate: 0.9,
          duration: 30,
        },
      ],
      fetchDeviceStatusRecords,
      fetchProfile,
      extractBasalProfile: () => [
        {time: '00:00', timeAsSeconds: 0, value: 0.75},
      ],
      now: () => 9_000,
      useE2EFixtures: false,
    });

    const result = await source.loadDayGraph(period);

    expect(result.glucoseSamples[0]).toMatchObject({
      direction: 'SingleUp',
      device: 'Loop',
    });
    expect(result.activeLoadSamples).toEqual([
      {
        timestampMs: 2_100,
        iobUnits: -0.2,
        bolusIobUnits: 0.1,
        basalIobUnits: -0.3,
        cobGrams: 18,
      },
    ]);
    expect(result.insulinEvents).toEqual([
      {kind: 'bolus', timestampMs: 3_000, units: 1.25},
      {
        kind: 'temp-basal',
        startMs: 4_000,
        endMs: 1_804_000,
        rateUnitsPerHour: 0.9,
      },
    ]);
    expect(result.basalSchedule).toEqual([
      {secondsFromMidnight: 0, rateUnitsPerHour: 0.75},
    ]);
    expect(fetchDeviceStatusRecords).toHaveBeenCalled();
    expect(fetchProfile).toHaveBeenCalledWith(new Date(1_000).toISOString());
  });
});
