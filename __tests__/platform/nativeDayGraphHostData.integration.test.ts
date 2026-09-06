import AsyncStorage from '@react-native-async-storage/async-storage';
import type {AxiosAdapter} from 'axios';
import {
  configureNightscoutInstance,
  clearNightscoutInstance,
  nightscoutInstance,
} from 'app/api/shaniNightscoutInstances';
import {
  createNativeDayGraphDataSource,
  createNativeDayGraphTimelineLoader,
} from 'app/platform/native/product/nativeDayGraphDataSource';

const at = Date.UTC(2026, 8, 6, 8);
const period = {dayStartMs: at - 60 * 60_000, dayEndMs: at + 60 * 60_000};
const fixtures = {
  glucose: [{_id: 'bg', date: at, sgv: 123}],
  treatments: [
    {
      _id: 'bolus',
      eventType: 'Correction Bolus',
      created_at: new Date(at).toISOString(),
      insulin: 2,
    },
    {
      _id: 'basal',
      eventType: 'Temp Basal',
      created_at: new Date(at).toISOString(),
      absolute: 0.6,
      duration: 30,
    },
    {
      _id: 'carbs',
      eventType: 'Carb Correction',
      created_at: new Date(at).toISOString(),
      carbs: 25,
    },
  ],
  statuses: [
    {
      created_at: new Date(at).toISOString(),
      loop: {iob: {iob: 1.4}, cob: {cob: 18}},
    },
  ],
  profiles: [
    {
      defaultProfile: 'Default',
      store: {
        Default: {basal: [{time: '00:00', timeAsSeconds: 0, value: 0.8}]},
      },
    },
  ],
};

describe('the actual native Product Day Graph host composition', () => {
  const previousAdapter = nightscoutInstance.defaults.adapter;
  beforeEach(async () => {
    await AsyncStorage.clear();
    configureNightscoutInstance({
      baseUrl: 'https://fixture.example',
      apiSecretSha1: 'a'.repeat(40),
      ownerUserId: 'fixture-user',
    });
    const transport: AxiosAdapter = async request => {
      const path = request.url ?? '';
      const data = path.includes('/entries')
        ? fixtures.glucose
        : path.includes('/treatments')
        ? fixtures.treatments
        : path.includes('/devicestatus')
        ? fixtures.statuses
        : path.includes('/profile')
        ? fixtures.profiles
        : [];
      return {
        config: request,
        data,
        status: 200,
        statusText: 'OK',
        headers: {},
      };
    };
    nightscoutInstance.defaults.adapter = transport;
  });
  afterEach(() => {
    clearNightscoutInstance();
    nightscoutInstance.defaults.adapter = previousAdapter;
  });

  it('keeps bolus, basal, IOB and COB when the host supplies its shared timeline', async () => {
    // This is the composition used by ProductExperienceScreen, unlike the
    // default-adapter-only tests which missed the missing insulin regression.
    const options = {
      nightscoutSourceId: 'fixture-source',
      useE2EFixtures: false,
    };
    const loadTimelineItems = createNativeDayGraphTimelineLoader(options);
    const source = createNativeDayGraphDataSource({
      ...options,
      loadTimelineItems,
    });
    const result = await source.loadDayGraph(period);

    expect(result.glucoseSamples).toHaveLength(1);
    expect(result.timelineItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'external-carb',
          carbohydratesGrams: 25,
        }),
      ]),
    );
    expect(result.insulinEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({kind: 'bolus', units: 2}),
        expect.objectContaining({kind: 'temp-basal', rateUnitsPerHour: 0.6}),
      ]),
    );
    expect(result.basalSchedule).toEqual([
      {secondsFromMidnight: 0, rateUnitsPerHour: 0.8},
    ]);
    expect(result.activeLoadSamples).toEqual([
      {timestampMs: at, iobUnits: 1.4, cobGrams: 18},
    ]);
  });

  it('loads current insulin on explicit refresh even inside the shared cache window', async () => {
    const source = createNativeDayGraphDataSource({useE2EFixtures: false});
    const initial = await source.loadDayGraph(period);
    expect(initial.insulinEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({kind: 'bolus', units: 2}),
      ]),
    );
    const previous = nightscoutInstance.defaults.adapter as AxiosAdapter;
    nightscoutInstance.defaults.adapter = async config => {
      const response = await previous(config);
      return config.url?.includes('/treatments')
        ? {
            ...response,
            data: fixtures.treatments.map(item =>
              item._id === 'bolus' ? {...item, insulin: 4} : item,
            ),
          }
        : response;
    };
    const refreshed = await source.loadDayGraph(period, {forceRefresh: true});
    expect(refreshed.insulinEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({kind: 'bolus', units: 4}),
      ]),
    );
  });
});
