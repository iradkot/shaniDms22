import type {JournalWorkspace} from 'app/modules/journal';
import {
  BrowserNightscoutClient,
  createBrowserNightscoutDataSources,
  loadBrowserCurrentSnapshot,
} from 'app/platform/web';
import {
  CORE_DESTINATION_IDS,
  coreDestinationRegistry,
  createStoredDestinationTarget,
  resolveDestinationTarget,
} from 'app/product/destinations';

const HOUR = 60 * 60 * 1000;

const dayStartMs = new Date(2026, 7, 20).getTime();
const dayEndMs = dayStartMs + 24 * HOUR;
const range = <T>(records: T[]) => ({
  records,
  freshness: {kind: 'fresh' as const, fetchedAtMs: dayEndMs},
});
const journal = {
  meals: {
    getListSnapshot: () => ({
      items: [{id: 'meal-1', mealStart: dayStartMs + HOUR, name: 'Breakfast'}],
    }),
  },
  activities: {getListSnapshot: () => ({items: []})},
} as unknown as JournalWorkspace;
const clientFixture = () => ({
  readEntries: jest.fn(async () =>
    range([{_id: 'g1', date: dayStartMs + HOUR, sgv: 120}]),
  ),
  readTreatments: jest.fn(async () =>
    range([
      {
        _id: 'prior-bolus',
        created_at: new Date(dayStartMs - HOUR).toISOString(),
        eventType: 'Correction Bolus',
        insulin: 9,
      },
      {
        _id: 'carryover',
        created_at: new Date(dayStartMs - HOUR / 2).toISOString(),
        eventType: 'Temp Basal',
        rate: 2,
        duration: 60,
      },
      {
        _id: 'bolus',
        created_at: new Date(dayStartMs + HOUR).toISOString(),
        eventType: 'Correction Bolus',
        insulin: 3,
      },
    ]),
  ),
  readDeviceStatusesForRange: jest.fn(async () => range([])),
  readBasalProfile: jest.fn(async () =>
    range([{entries: [{secondsFromMidnight: 0, rateUnitsPerHour: 1}]}]),
  ),
});
const sources = (client: ReturnType<typeof clientFixture>) =>
  createBrowserNightscoutDataSources({
    client: client as unknown as BrowserNightscoutClient,
    sourceId: 'source-1',
    locale: 'en',
    journal,
  });

describe('createBrowserNightscoutDataSources Day Graph', () => {
  it('does not display an old IOB/COB reading as current alongside fresh glucose', async () => {
    const nowMs = dayStartMs + HOUR;
    const client = clientFixture();
    const target = resolveDestinationTarget(
      coreDestinationRegistry,
      createStoredDestinationTarget(CORE_DESTINATION_IDS.dayGraph),
      undefined,
      {platform: 'web'},
    );
    const snapshot = await loadBrowserCurrentSnapshot({
      client: {
        ...client,
        readDeviceStatuses: async () =>
          range([{createdAtMs: nowMs - 30 * 60000, iobUnits: 3, cobGrams: 25}]),
      },
      target,
      locale: 'en',
      nowMs,
    });
    expect(snapshot).toMatchObject({
      status: 'ready',
      glucoseLabel: '120 mg/dL',
    });
    expect(snapshot).not.toHaveProperty('iobLabel');
    expect(snapshot).not.toHaveProperty('cobLabel');
  });
  it('keeps glucose and local journal entries visible when treatments fail', async () => {
    const client = clientFixture();
    client.readTreatments.mockRejectedValue(new Error('offline'));
    const result = await sources(client).dayGraph.loadDayGraph({
      dayStartMs,
      dayEndMs,
    });
    expect(result.glucoseSamples).toHaveLength(1);
    expect(result.timelineItems).toEqual([
      expect.objectContaining({kind: 'journal-meal', title: 'Breakfast'}),
    ]);
    expect(result.insulinEvents).toEqual([]);
    expect(result.freshness.kind).toBe('stale');
  });

  it('reports missing chart enrichment without erasing glucose', async () => {
    const client = clientFixture();
    client.readDeviceStatusesForRange.mockRejectedValue(new Error('offline'));
    const result = await sources(client).dayGraph.loadDayGraph({
      dayStartMs,
      dayEndMs,
    });
    expect(result.glucoseSamples).toHaveLength(1);
    expect(result.freshness.kind).toBe('stale');
  });

  it('calculates browser insulin totals with basal carryover and excludes earlier boluses', async () => {
    const client = clientFixture();
    const result = await sources(client).dailyOverview.loadDailyOverview({
      startMs: dayStartMs,
      endMs: dayEndMs,
    });
    expect(result.insulinSummary).toEqual({
      quality: 'available',
      basalUnits: 24.5,
      bolusUnits: 3,
    });
    expect(client.readTreatments).toHaveBeenCalledWith(
      dayStartMs - 24 * HOUR,
      dayEndMs,
    );
  });

  it('does not turn missing or stale insulin evidence into an available zero', async () => {
    const client = clientFixture();
    client.readBasalProfile.mockResolvedValue(range([]));
    expect(
      (
        await sources(client).dailyOverview.loadDailyOverview({
          startMs: dayStartMs,
          endMs: dayEndMs,
        })
      ).insulinSummary,
    ).toEqual({quality: 'unavailable'});
    client.readBasalProfile.mockRejectedValue(new Error('offline'));
    expect(
      (
        await sources(client).dailyOverview.loadDailyOverview({
          startMs: dayStartMs,
          endMs: dayEndMs,
        })
      ).glucoseSamples,
    ).toHaveLength(1);
  });

  it('preserves local summary events during a treatment outage and uses the same insulin totals when available', async () => {
    const client = clientFixture();
    const source = sources(client).previousDaySummary;
    expect(
      (
        await source.loadPreviousDaySummary({
          startMs: dayStartMs,
          endMs: dayEndMs,
        })
      ).insulinSummary,
    ).toEqual({quality: 'available', basalUnits: 24.5, bolusUnits: 3});
    client.readTreatments.mockRejectedValue(new Error('offline'));
    const result = await source.loadPreviousDaySummary({
      startMs: dayStartMs,
      endMs: dayEndMs,
    });
    expect(result.glucoseSamples).toHaveLength(1);
    expect(result.events).toEqual([
      expect.objectContaining({id: 'journal:meal-1', kind: 'meal'}),
    ]);
    expect(result.insulinSummary).toEqual({quality: 'unavailable'});
  });

  it('projects browser Nightscout facts into the complete rich chart context', async () => {
    const readTreatments = jest.fn(async () => ({
      records: [
        {
          _id: 'bolus-1',
          created_at: new Date(dayStartMs + HOUR).toISOString(),
          eventType: 'Correction Bolus',
          insulin: 1.25,
        },
        {
          _id: 'temp-1',
          created_at: new Date(dayStartMs + 2 * HOUR).toISOString(),
          eventType: 'Temp Basal',
          rate: 0.9,
          duration: 30,
        },
        {
          _id: 'carb-1',
          created_at: new Date(dayStartMs + 3 * HOUR).toISOString(),
          eventType: 'Carb Correction',
          carbs: 20,
        },
      ],
      freshness: {kind: 'fresh' as const, fetchedAtMs: dayEndMs},
    }));
    const client = {
      readEntries: jest.fn(async () => ({
        records: [
          {
            _id: 'sgv-1',
            date: dayStartMs + HOUR,
            sgv: 120,
            direction: 'FortyFiveUp',
            device: 'Loop',
          },
        ],
        freshness: {kind: 'fresh' as const, fetchedAtMs: dayEndMs},
      })),
      readTreatments,
      readDeviceStatusesForRange: jest.fn(async () => ({
        records: [
          {
            _id: 'status-1',
            createdAtMs: dayStartMs + HOUR,
            iobUnits: 1.4,
            bolusIobUnits: 1.1,
            basalIobUnits: 0.3,
            cobGrams: 20,
          },
        ],
        freshness: {kind: 'fresh' as const, fetchedAtMs: dayEndMs},
      })),
      readBasalProfile: jest.fn(async () => ({
        records: [
          {
            entries: [{secondsFromMidnight: 0, rateUnitsPerHour: 0.75}],
          },
        ],
        freshness: {kind: 'fresh' as const, fetchedAtMs: dayEndMs},
      })),
    } as unknown as BrowserNightscoutClient;
    const emptyJournal = {
      meals: {getListSnapshot: () => ({items: []})},
      activities: {getListSnapshot: () => ({items: []})},
    } as unknown as JournalWorkspace;
    const source = createBrowserNightscoutDataSources({
      client,
      sourceId: 'source-1',
      locale: 'en',
      journal: emptyJournal,
    }).dayGraph;

    const result = await source.loadDayGraph({dayStartMs, dayEndMs});

    expect(result.glucoseSamples[0]).toMatchObject({
      direction: 'FortyFiveUp',
      device: 'Loop',
    });
    expect(result.activeLoadSamples).toEqual([
      {
        timestampMs: dayStartMs + HOUR,
        iobUnits: 1.4,
        bolusIobUnits: 1.1,
        basalIobUnits: 0.3,
        cobGrams: 20,
      },
    ]);
    expect(result.insulinEvents).toEqual([
      {kind: 'bolus', timestampMs: dayStartMs + HOUR, units: 1.25},
      {
        kind: 'temp-basal',
        startMs: dayStartMs + 2 * HOUR,
        endMs: dayStartMs + 2.5 * HOUR,
        rateUnitsPerHour: 0.9,
      },
    ]);
    expect(result.basalSchedule).toEqual([
      {secondsFromMidnight: 0, rateUnitsPerHour: 0.75},
    ]);
    expect(readTreatments).toHaveBeenCalledWith(
      dayStartMs - 24 * HOUR,
      dayEndMs,
    );
  });
});
