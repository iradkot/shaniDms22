import AsyncStorage from '@react-native-async-storage/async-storage';
import {AxiosError, type AxiosAdapter} from 'axios';
import {
  clearNightscoutInstance,
  configureNightscoutInstance,
  nightscoutInstance,
} from 'app/api/shaniNightscoutInstances';
import {runAiAnalystTool} from 'app/services/aiAnalyst/aiAnalystLocalTools';
import type {AiWorkspaceScope} from 'app/services/aiMemory/aiWorkspaceScope';
import {getInsulinRangeMetrics} from 'app/services/insulin/insulinRangeMetrics';
import {loadInsulinContext} from 'app/services/insulin/insulinDataSource';
import {fetchStackedChartsDataForRange} from 'app/utils/stackedChartsData.utils';

const startMs = Date.UTC(2026, 8, 6, 8);
const endMs = startMs + 60 * 60_000;
const sampleMs = startMs + 15 * 60_000;
const timestamp = new Date(sampleMs).toISOString();
const scope = {
  productUserId: 'fixture-owner',
  workspaceId: 'fixture-workspace',
} as AiWorkspaceScope;

// Sanitized versions of the Loop shapes already used by the legacy treatment
// fixtures and nativeDayGraphDataSource tests. No mapper/API helper is mocked.
const glucose = [{date: sampleMs, sgv: 123, dateString: timestamp}];
const treatments = [
  {eventType: 'Correction Bolus', insulin: 1.25, created_at: timestamp},
  {eventType: 'Temp Basal', rate: 2, duration: 30, created_at: timestamp},
];
const deviceStatus = [
  {
    created_at: timestamp,
    loop: {iob: {iob: 1.2, bolusIob: 1.4, basalIob: -0.2}, cob: {cob: 18}},
  },
];
const profiles = [
  {
    defaultProfile: 'Default',
    startDate: new Date(startMs - 86_400_000).toISOString(),
    store: {Default: {basal: [{time: '00:00', timeAsSeconds: 0, value: 1}]}},
  },
];

describe('native insulin evidence is consistent between legacy UI and AI', () => {
  const previousAdapter = nightscoutInstance.defaults.adapter;
  let failedResource: 'treatments' | 'profiles' | 'devicestatus' | undefined;
  let emptyTreatments = false;
  let explicitMissingLoads = false;
  let doseRecords: readonly Record<string, unknown>[] = treatments;
  let resources: string[];

  beforeEach(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(Date, 'now').mockReturnValue(endMs);
    await AsyncStorage.clear();
    clearNightscoutInstance();
    failedResource = undefined;
    emptyTreatments = false;
    explicitMissingLoads = false;
    doseRecords = treatments;
    resources = [];
    configureNightscoutInstance({
      baseUrl: 'https://fixture.example',
      ownerUserId: 'fixture-owner',
      apiSecretSha1: 'a'.repeat(40),
    });
    const transport: AxiosAdapter = async request => {
      const resource = new URL(request.url!, request.baseURL).pathname
        .split('/')
        .pop();
      resources.push(resource ?? '');
      if (failedResource === resource) {
        throw new AxiosError(
          'Fixture source unavailable',
          'ERR_BAD_RESPONSE',
          request,
          null,
          {
            status: 503,
            statusText: 'Unavailable',
            data: {},
            headers: {},
            config: request,
          },
        );
      }
      const data = resource?.startsWith('entries')
        ? glucose
        : resource?.startsWith('treatments')
        ? emptyTreatments
          ? []
          : doseRecords
        : resource?.startsWith('devicestatus')
        ? explicitMissingLoads
          ? [
              {
                created_at: new Date(sampleMs - 5 * 60_000).toISOString(),
                iob: 1.2,
                cob: 18,
              },
              {
                created_at: timestamp,
                loop: {iob: {iob: null}, cob: {cob: null}},
              },
              {
                created_at: new Date(sampleMs + 60_000).toISOString(),
                uploader: {battery: 80},
              },
              {
                created_at: new Date(sampleMs + 5 * 60_000).toISOString(),
                iob: 1,
                cob: 16,
              },
            ]
          : deviceStatus
        : resource?.startsWith('profile')
        ? profiles
        : [];
      return {
        status: 200,
        statusText: 'OK',
        data,
        headers: {},
        config: request,
      };
    };
    nightscoutInstance.defaults.adapter = transport;
  });

  afterEach(() => {
    clearNightscoutInstance();
    nightscoutInstance.defaults.adapter = previousAdapter;
    jest.restoreAllMocks();
  });

  it('labels the shared chart and AI basal model as an estimate', async () => {
    const chart = await fetchStackedChartsDataForRange({startMs, endMs});
    expect(chart.bgSamples[0]).toMatchObject({sgv: 123, iob: 1.2, cob: 18});
    expect(chart.insulinData).toEqual(
      expect.arrayContaining([
        expect.objectContaining({type: 'bolus', amount: 1.25}),
        expect.objectContaining({type: 'tempBasal', rate: 2, duration: 30}),
      ]),
    );
    expect(chart.basalProfileData).toEqual([
      {time: '00:00', timeAsSeconds: 0, value: 1},
    ]);
    const metrics = await getInsulinRangeMetrics(
      new Date(startMs),
      new Date(endMs),
    );
    expect(metrics).toMatchObject({
      totalBasal: expect.closeTo(1.5, 9),
      totalBolus: 1.25,
      totalInsulin: expect.closeTo(2.75, 9),
    });

    const evidence = await runAiAnalystTool(scope, 'getInsulinDeliveryStats', {
      startDate: new Date(startMs).toISOString(),
      endDate: new Date(endMs).toISOString(),
    });
    expect(evidence).toMatchObject({
      ok: true,
      result: {
        calculation: 'profile-model',
        basalEstimated: true,
        totals: {
          bolusU: 1.25,
          basalU: expect.closeTo(1.5, 9),
          tempBasalU: null,
          totalU: expect.closeTo(metrics.totalInsulin, 9),
        },
      },
    });
    expect(
      resources.filter(resource => resource.startsWith('treatments')),
    ).toHaveLength(1);
    expect(
      resources.filter(resource => resource.startsWith('devicestatus')),
    ).toHaveLength(1);
    expect(
      resources.filter(resource => resource.startsWith('profile')),
    ).toHaveLength(2); // Chart schedule plus verified delivery-summary history.
  });

  it('passes the original insulin observation and completeness into AI period comparisons', async () => {
    doseRecords = [
      {
        _id: 'unfinished-comparison-dose',
        eventType: 'Correction Bolus',
        created_at: timestamp,
        insulin: 2,
        duration: 60,
      },
    ];
    const comparison = await runAiAnalystTool(
      scope,
      'analyzeAgpPeriodComparison',
      {
        currentStart: new Date(startMs).toISOString(),
        currentEnd: new Date(endMs).toISOString(),
        previousStart: new Date(startMs - 86_400_000).toISOString(),
        previousEnd: new Date(endMs - 86_400_000).toISOString(),
      },
    );
    expect(comparison).toMatchObject({
      ok: true,
      result: {
        dataQuality: {currentBolusEvidenceComplete: false},
        corrections: {currentCount: null, currentAvgDrop3h: null},
      },
    });
  });

  it('keeps an unverified temp-basal breakdown null when the delivered total uses recorded evidence', async () => {
    doseRecords = [{eventType: 'Temp Basal', enteredBy: 'loop://phone', created_at: new Date(startMs).toISOString(), duration: 60, rate: 1, amount: 0.8}];
    const evidence = await runAiAnalystTool(scope, 'getInsulinDeliveryStats', {
      startDate: new Date(startMs).toISOString(), endDate: new Date(endMs).toISOString(),
    });
    expect(evidence).toMatchObject({ok: true, result: {
      tempBasalBreakdown: {quality: 'unavailable', explanation: expect.stringContaining('Null means unknown, not zero')},
      totals: {basalU: 0.8, tempBasalU: null, totalU: 0.8},
      dailyAverages: {tempBasalU: null}, ratio: {tempBasalPercent: null},
    }});
  });

  it('clips completed interval boluses to the requested range and allocates their hourly delivery', async () => {
    const rangeStart = startMs + 30 * 60_000;
    const rangeEnd = endMs + 30 * 60_000;
    jest.spyOn(Date, 'now').mockReturnValue(endMs + 60 * 60_000);
    doseRecords = [
      {_id: 'completed-interval', eventType: 'Extended Bolus', created_at: new Date(startMs + 15 * 60_000).toISOString(), endDate: new Date(endMs + 45 * 60_000).toISOString(), deliveredUnits: 6, insulin: 9},
      {_id: 'outside-request', eventType: 'Correction Bolus', created_at: new Date(startMs + 20 * 60_000).toISOString(), insulin: 7},
    ];
    const evidence = await runAiAnalystTool(scope, 'getInsulinDeliveryStats', {
      startDate: new Date(rangeStart).toISOString(), endDate: new Date(rangeEnd).toISOString(),
    });
    expect(evidence).toMatchObject({ok: true, result: {
      totals: {bolusU: 4},
      counts: {bolusCount: 1},
      patterns: {hourlyBolusDistribution: [
        {hour: new Date(startMs).getHours(), totalU: 2},
        {hour: new Date(endMs).getHours(), totalU: 2},
      ].sort((a, b) => a.hour - b.hour)},
    }});
  });

  it('keeps rounded hourly amounts equal to the bolus total for small completed interval doses', async () => {
    const rangeStart = startMs + 30 * 60_000;
    const rangeEnd = endMs + 30 * 60_000;
    jest.spyOn(Date, 'now').mockReturnValue(endMs + 60 * 60_000);
    doseRecords = [{eventType: 'Extended Bolus', created_at: new Date(rangeStart).toISOString(), endDate: new Date(rangeEnd).toISOString(), deliveredUnits: 0.05, insulin: 0.5}];
    const evidence = await runAiAnalystTool(scope, 'getInsulinDeliveryStats', {
      startDate: new Date(rangeStart).toISOString(), endDate: new Date(rangeEnd).toISOString(),
    });
    const firstHour = new Date(startMs).getHours();
    const secondHour = new Date(endMs).getHours();
    expect(evidence).toMatchObject({ok: true, result: {
      totals: {bolusU: 0.05},
      patterns: {hourlyBolusDistribution: [
        {hour: firstHour, totalU: firstHour < secondHour ? 0.03 : 0.02},
        {hour: secondHour, totalU: firstHour < secondHour ? 0.02 : 0.03},
      ].sort((a, b) => a.hour - b.hour)},
    }});
  });

  it('reuses recorded dose rules for AI bolus totals without another treatment read', async () => {
    const dose = {
      _id: 'one-dose',
      syncIdentifier: '',
      eventType: 'Correction Bolus',
      insulin: 2,
      deliveredUnits: 0.4,
      created_at: timestamp,
    };
    doseRecords = [dose, {...dose}];
    const range = {startMs: endMs - 86_400_000, endMs};
    const context = await loadInsulinContext(range);
    const evidence = await runAiAnalystTool(scope, 'getInsulinSummary', {
      rangeDays: 1,
    });
    expect(context.recordedInsulin).toMatchObject({
      quality: 'partial',
      bolusUnits: 0.4,
    });
    expect(evidence).toMatchObject({
      ok: true,
      result: {
        totals: {bolusU: 0.4},
        recordedInsulin: {quality: 'partial', bolusUnits: 0.4},
      },
    });
    expect(
      resources.filter(resource => resource.startsWith('treatments')),
    ).toHaveLength(1);
  });

  it('does not tell AI that insulin delivery was zero when treatments could not be loaded', async () => {
    failedResource = 'treatments';
    const evidence = await runAiAnalystTool(scope, 'getInsulinSummary', {
      rangeDays: 1,
    });
    expect(evidence.ok).toBe(false);
  });

  it('does not present cached treatment totals as current after a failed refresh', async () => {
    const range = {startMs: endMs - 86_400_000, endMs};
    const original = await runAiAnalystTool(scope, 'getInsulinSummary', {
      rangeDays: 1,
    });
    expect(original.ok).toBe(true);
    failedResource = 'treatments';
    const stale = await loadInsulinContext({...range, forceRefresh: true});
    expect(stale.availability.treatments).toBe('stale');
    expect(stale.insulinData).not.toHaveLength(0);
    const evidence = await runAiAnalystTool(scope, 'getInsulinSummary', {
      rangeDays: 1,
    });
    expect(evidence.ok).toBe(false);
  });

  it('shares active insulin and carbohydrate evidence with AI without separate parsing', async () => {
    const rangeStartMs = endMs - 86_400_000;
    const chart = await fetchStackedChartsDataForRange({
      startMs: rangeStartMs,
      endMs,
    });
    const evidence = await runAiAnalystTool(scope, 'getCgmData', {
      rangeDays: 1,
      includeDeviceStatus: true,
    });
    expect(evidence).toMatchObject({
      ok: true,
      result: {
        samples: [{iobU: chart.bgSamples[0].iob, cobG: chart.bgSamples[0].cob}],
      },
    });
    expect(
      resources.filter(resource => resource.startsWith('devicestatus')),
    ).toHaveLength(1);
  });

  it('preserves an explicit missing load report as a graph gap and null AI sample', async () => {
    explicitMissingLoads = true;
    const range = {startMs: endMs - 86_400_000, endMs};
    const context = await loadInsulinContext(range);
    expect(context.loadSamples).toHaveLength(3);
    expect(context.loadSamples[1]).toEqual({timestampMs: sampleMs});
    const chart = await fetchStackedChartsDataForRange(range);
    expect(chart.bgSamples[0].iob).toBeUndefined();
    expect(chart.bgSamples[0].cob).toBeUndefined();
    const evidence = await runAiAnalystTool(scope, 'getCgmData', {
      rangeDays: 1,
      includeDeviceStatus: true,
    });
    expect(evidence).toMatchObject({
      ok: true,
      result: {samples: [{tMs: sampleMs, iobU: null, cobG: null}]},
    });
  });

  it('keeps successful empty treatments available instead of reporting a fetch error', async () => {
    emptyTreatments = true;
    const evidence = await runAiAnalystTool(scope, 'getInsulinSummary', {
      rangeDays: 1,
    });
    expect(evidence).toMatchObject({
      ok: true,
      result: {
        totals: {bolusU: 0, carbsG: 0},
        availability: {treatments: 'available'},
      },
    });
  });

  it('does not invent a basal total when the basal profile request fails', async () => {
    failedResource = 'profiles';
    const evidence = await runAiAnalystTool(scope, 'getInsulinDeliveryStats', {
      startDate: new Date(startMs).toISOString(),
      endDate: new Date(endMs).toISOString(),
    });
    expect(evidence.ok).toBe(false);
  });

  it('keeps absent active insulin unknown in the chart and rejects a requested AI load summary', async () => {
    failedResource = 'devicestatus';
    const chart = await fetchStackedChartsDataForRange({
      startMs: endMs - 86_400_000,
      endMs,
    });
    expect(chart.bgSamples[0].iob).toBeUndefined();
    expect(chart.availability?.deviceStatus).toBe('unavailable');
    const evidence = await runAiAnalystTool(scope, 'getCgmData', {
      rangeDays: 1,
      includeDeviceStatus: true,
    });
    expect(evidence.ok).toBe(false);
  });
});
