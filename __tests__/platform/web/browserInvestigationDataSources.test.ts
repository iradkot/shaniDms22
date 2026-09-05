import {
  createBrowserInvestigationDataSources,
  type BrowserNightscoutRange,
  type BrowserNightscoutEntry,
  type BrowserNightscoutTreatment,
} from '../../../src/platform/web';

const DAY_MS = 24 * 60 * 60 * 1_000;
const freshness = {kind: 'fresh' as const, fetchedAtMs: 1_700_000_000_000};

const range = <T>(records: readonly T[]): BrowserNightscoutRange<T> => ({
  records,
  freshness,
});

describe('browser investigation data sources', () => {
  it('loads Similar Events from the factual Nightscout glucose source with cancellation', async () => {
    const readEntries = jest
      .fn<
        Promise<BrowserNightscoutRange<BrowserNightscoutEntry>>,
        [number, number, AbortSignal?]
      >()
      .mockResolvedValue(
        range([
          {_id: 'entry-1', date: 1_700_000_000_000, sgv: 68},
          {_id: 'entry-2', date: 1_700_000_300_000, sgv: 74},
        ]),
      );
    const sources = createBrowserInvestigationDataSources({
      client: {
        readEntries,
        readTreatments: jest.fn(),
      },
      trends: {loadGlucoseSamples: jest.fn()},
      locale: 'en',
    });
    const controller = new AbortController();
    const period = {
      startMs: 1_699_999_900_000,
      endMs: 1_700_000_600_000,
    };

    await expect(
      sources.similarEvents.loadGlucoseSamples(period, controller.signal),
    ).resolves.toEqual([
      {timestampMs: 1_700_000_000_000, valueMgDl: 68},
      {timestampMs: 1_700_000_300_000, valueMgDl: 74},
    ]);
    expect(readEntries).toHaveBeenCalledWith(
      period.startMs,
      period.endMs,
      controller.signal,
    );

    controller.abort();
    await expect(
      sources.similarEvents.loadGlucoseSamples(period, controller.signal),
    ).rejects.toMatchObject({name: 'AbortError'});
    expect(readEntries).toHaveBeenCalledTimes(1);
  });

  it('chunks Loop history and exposes only observed profile-switch facts', async () => {
    const endMs = 1_800_000_000_000;
    const startMs = endMs - 61 * DAY_MS;
    const switchAtMs = startMs + DAY_MS;
    const repeated: BrowserNightscoutTreatment = {
      _id: 'profile-switch-1',
      date: switchAtMs,
      eventType: 'Profile Switch',
      profile: 'Exercise',
      enteredBy: 'AndroidAPS',
    };
    const readTreatments = jest
      .fn<
        Promise<BrowserNightscoutRange<BrowserNightscoutTreatment>>,
        [number, number, AbortSignal?]
      >()
      .mockResolvedValueOnce(
        range([repeated, {date: switchAtMs, eventType: 'Meal Bolus'}]),
      )
      .mockResolvedValueOnce(range([repeated]))
      .mockResolvedValueOnce(range([]));
    const glucose = [{timestampMs: switchAtMs, valueMgDl: 101}];
    const loadGlucoseSamples = jest.fn().mockResolvedValue(glucose);
    const sources = createBrowserInvestigationDataSources({
      client: {readEntries: jest.fn(), readTreatments},
      trends: {loadGlucoseSamples},
      locale: 'en',
    });

    await expect(
      sources.loopChanges.loadChanges({startMs, endMs}),
    ).resolves.toEqual([
      {
        id: 'profile-switch-1',
        changedAtMs: switchAtMs,
        kind: 'other',
        summary: 'Switched to profile Exercise',
        source: {
          authority: 'observed',
          kind: 'androidaps',
          label: 'AndroidAPS via Nightscout',
        },
      },
    ]);
    expect(readTreatments).toHaveBeenCalledTimes(3);
    expect(
      readTreatments.mock.calls.every(
        ([chunkStartMs, chunkEndMs]) =>
          chunkEndMs - chunkStartMs <= 30 * DAY_MS,
      ),
    ).toBe(true);
    await expect(
      sources.loopChanges.loadGlucoseSamples({startMs, endMs}),
    ).resolves.toBe(glucose);
  });

  it('returns an honest empty Loop history when Nightscout has no profile switches', async () => {
    const sources = createBrowserInvestigationDataSources({
      client: {
        readEntries: jest.fn(),
        readTreatments: jest
          .fn()
          .mockResolvedValue(
            range([{date: 1_700_000_000_000, eventType: 'Meal Bolus'}]),
          ),
      },
      trends: {loadGlucoseSamples: jest.fn()},
      locale: 'he',
    });

    await expect(
      sources.loopChanges.loadChanges({
        startMs: 1_699_999_000_000,
        endMs: 1_700_001_000_000,
      }),
    ).resolves.toEqual([]);
  });
});
