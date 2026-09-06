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
          : treatments
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

  it('reports the same delivered basal and bolus in the chart, range metrics and AI tool', async () => {
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
      totalBasal: 1.5,
      totalBolus: 1.25,
      totalInsulin: 2.75,
    });

    const evidence = await runAiAnalystTool(scope, 'getInsulinDeliveryStats', {
      startDate: new Date(startMs).toISOString(),
      endDate: new Date(endMs).toISOString(),
    });
    expect(evidence).toMatchObject({
      ok: true,
      result: {
        totals: {
          bolusU: 1.25,
          basalU: 1.5,
          tempBasalU: 1,
          totalU: metrics.totalInsulin,
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
