import {configureExperimentalBuildForTests} from '../mocks/experimentalBuild';
configureExperimentalBuildForTests();

import {recordedInsulinDataSource} from 'app/services/insulin/recordedInsulinDataSource';
import {getBasalProfileHistoryFromNightscout} from 'app/api/apiRequests';
import {decodeEstimatedBasalProfileHistory} from 'app/services/insulin/estimatedBasalProfile';
import {
  clearNightscoutInstance,
  configureNightscoutInstance,
  nightscoutInstance,
} from 'app/api/shaniNightscoutInstances';
import {
  BrowserNightscoutClient,
  createBrowserNightscoutDataSources,
} from 'app/platform/web';
import type {JournalWorkspace} from 'app/modules/journal';

const HOUR = 3_600_000;
const startMs = new Date(2026, 9, 7).getTime();
const endMs = startMs + 3 * HOUR;
const profile = (hour: number, rate: number) => ({
  startDate: new Date(startMs + hour * HOUR).toISOString(),
  defaultProfile: 'Default',
  store: {Default: {timezone: 'UTC', basal: [{time: '00:00', value: rate}]}},
});
const rows = [profile(-24, 1), profile(1, 1), profile(2, 2)];
const treatments = [
  {
    _id: 'bolus',
    eventType: 'Correction Bolus',
    created_at: new Date(startMs).toISOString(),
    insulin: 2,
  },
];

describe('real daily adapters with effective profile uploads', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(endMs);
    configureNightscoutInstance({baseUrl: 'https://profile-history.example'});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    clearNightscoutInstance();
    jest.useRealTimers();
  });

  it('native selects the midnight carry-in and integrates later effective changes', async () => {
    jest.spyOn(nightscoutInstance, 'get').mockImplementation(async path => {
      if (!String(path).includes('/profiles')) {
        return {data: treatments} as never;
      }
      const query = new URL(String(path), 'https://profile-history.example')
        .searchParams;
      const through = Date.parse(query.get('find[startDate][$lte]')!);
      const after = query.has('find[startDate][$gt]')
        ? Date.parse(query.get('find[startDate][$gt]')!)
        : -Infinity;
      return {
        data: rows
          .filter(
            row =>
              +new Date(row.startDate) <= through &&
              +new Date(row.startDate) > after,
          )
          .reverse()
          .slice(0, Number(query.get('count'))),
      } as never;
    });
    const result = await recordedInsulinDataSource.loadWindow(
      {startMs, endMs},
      {includeEstimates: true},
    );
    expect(result).toMatchObject({quality: 'partial', bolusUnits: 2});
    expect(result.estimatedBasalUnits).toBeCloseTo(4);
    expect(result.estimatedTotalUnits).toBeCloseTo(6);
  });

  it('browser reconstructs the same total through its real transport and daily adapter', async () => {
    const values = new Map<string, string>();
    const client = new BrowserNightscoutClient({
      sourceId: 'source-1',
      workspaceId: 'workspace-1',
      now: () => endMs,
      storage: {
        getItem: async key => values.get(key) ?? null,
        setItem: async (key, value) => {
          values.set(key, value);
        },
        removeItem: async key => {
          values.delete(key);
        },
        getAllKeys: async () => [...values.keys()],
      },
      api: {
        requestJson: async (_path, options) => {
          const body = options?.body as {
            kind: string;
            profileHistory?: boolean;
          };
          return {
            version: 1,
            data:
              body.kind === 'profile'
                ? body.profileHistory
                  ? rows
                  : [rows[rows.length - 1]]
                : body.kind === 'treatments'
                ? treatments
                : [],
          };
        },
      },
    });
    const journal = {
      meals: {getListSnapshot: () => ({items: []})},
      activities: {getListSnapshot: () => ({items: []})},
    } as unknown as JournalWorkspace;
    const result = await createBrowserNightscoutDataSources({
      client,
      journal,
      sourceId: 'source-1',
      locale: 'en',
      now: () => endMs,
    }).dailyOverview.loadDailyOverview({startMs, endMs});
    expect(result.insulinSummary).toMatchObject({
      quality: 'partial',
      bolusUnits: 2,
    });
    expect(result.insulinSummary.estimatedBasalUnits).toBeCloseTo(4);
    expect(result.insulinSummary.estimatedTotalUnits).toBeCloseTo(6);
  });
});

describe('same-time profile history transport', () => {
  beforeEach(() => {
    configureNightscoutInstance({baseUrl: 'https://profile-history.example'});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    clearNightscoutInstance();
  });

  const serveProfiles = (profiles: ReturnType<typeof profile>[]) =>
    jest.spyOn(nightscoutInstance, 'get').mockImplementation(async path => {
      const query = new URL(String(path), 'https://profile-history.example')
        .searchParams;
      const through = Date.parse(query.get('find[startDate][$lte]')!);
      const after = query.has('find[startDate][$gt]')
        ? Date.parse(query.get('find[startDate][$gt]')!)
        : -Infinity;
      const atOrAfter = query.has('find[startDate][$gte]')
        ? Date.parse(query.get('find[startDate][$gte]')!)
        : -Infinity;
      return {
        data: profiles
          .filter(row => {
            const effectiveMs = Date.parse(row.startDate);
            return (
              effectiveMs <= through &&
              effectiveMs > after &&
              effectiveMs >= atOrAfter
            );
          })
          .sort(
            (left, right) =>
              Date.parse(right.startDate) - Date.parse(left.startDate),
          )
          .slice(0, Number(query.get('count'))),
      } as never;
    });

  it.each([false, true])(
    'exposes conflicting carry-in schedules instead of selecting one (intraday update=%s)',
    async hasUpdate => {
      const values = [
        profile(-1, 1),
        profile(-1, 2),
        ...(hasUpdate ? [profile(1, 3)] : []),
      ];
      const transport = serveProfiles(values);
      const history = await getBasalProfileHistoryFromNightscout(
        new Date(startMs),
        new Date(endMs),
      );
      expect(history).toHaveLength(values.length);
      expect(
        decodeEstimatedBasalProfileHistory(history, startMs, endMs),
      ).toBeUndefined();
      const tiedReads = transport.mock.calls.filter(([path]) =>
        String(path).includes('[$gte]'),
      );
      expect(tiedReads).toHaveLength(1);
      expect(String(tiedReads[0]![0])).toContain(
        `find[startDate][$lte]=${values[0]!.startDate}`,
      );
    },
  );

  it.each([false, true])(
    'retains identical carry-in copies without disabling a verified estimate (intraday update=%s)',
    async hasUpdate => {
      const values = [
        profile(-1, 1),
        profile(-1, 1),
        ...(hasUpdate ? [profile(1, 3)] : []),
      ];
      serveProfiles(values);
      const history = await getBasalProfileHistoryFromNightscout(
        new Date(startMs),
        new Date(endMs),
      );
      const decoded = decodeEstimatedBasalProfileHistory(
        history,
        startMs,
        endMs,
      );
      expect(decoded?.history).toHaveLength(hasUpdate ? 2 : 1);
    },
  );

  it('fails closed when the same-time query stays saturated at its bounded maximum', async () => {
    const counts: number[] = [];
    jest.spyOn(nightscoutInstance, 'get').mockImplementation(async path => {
      const query = new URL(String(path), 'https://profile-history.example')
        .searchParams;
      const count = Number(query.get('count'));
      if (query.has('find[startDate][$gte]')) {
        counts.push(count);
      }
      return {data: Array.from({length: count}, () => profile(-1, 1))} as never;
    });
    await expect(
      getBasalProfileHistoryFromNightscout(new Date(startMs), new Date(endMs)),
    ).rejects.toThrow('Incomplete same-time');
    expect(counts).toEqual([100, 200, 400, 800, 1000]);
  });

  it('does not use a count-two probe after a failed equality read', async () => {
    jest.spyOn(nightscoutInstance, 'get').mockImplementation(async path => {
      if (String(path).includes('[$gte]')) {
        throw new Error('equality offline');
      }
      return {data: [profile(-1, 1), profile(-1, 2)]} as never;
    });
    await expect(
      getBasalProfileHistoryFromNightscout(new Date(startMs), new Date(endMs)),
    ).rejects.toThrow('equality offline');
  });

  it.each([[], [profile(-2, 1)]].map(tied => ({tied})))(
    'rejects empty or out-of-range equality evidence %j',
    async ({tied}) => {
      jest.spyOn(nightscoutInstance, 'get').mockImplementation(
        async path =>
          ({
            data: String(path).includes('[$gte]')
              ? tied
              : [profile(-1, 1), profile(-1, 2)],
          } as never),
      );
      await expect(
        getBasalProfileHistoryFromNightscout(
          new Date(startMs),
          new Date(endMs),
        ),
      ).rejects.toThrow('Invalid same-time');
    },
  );
});
