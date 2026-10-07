import type {JournalWorkspace} from 'app/modules/journal';
import {createBrowserNightscoutDataSources} from 'app/platform/web/nightscout/browserNightscoutDataSources';
import type {BrowserNightscoutClient} from 'app/platform/web/nightscout/browserNightscoutClient';

const startMs = Date.parse('2026-10-07T00:00:00Z');
const period = {startMs, endMs: startMs + 24 * 60 * 60_000};
const journal = {
  meals: {getListSnapshot: () => ({items: []})},
  activities: {getListSnapshot: () => ({items: []})},
} as unknown as JournalWorkspace;

const create = (failure?: 'stale' | 'incomplete') => {
  const raw = {
    records: [
      {
        _id: 'dose',
        eventType: 'Correction Bolus',
        created_at: new Date(startMs + 60_000).toISOString(),
        insulin: 0.5,
        deliveredUnits: 0.05,
      },
    ],
    complete: failure !== 'incomplete',
    freshness:
      failure === 'stale'
        ? {
            kind: 'stale' as const,
            fetchedAtMs: period.endMs,
            reason: 'network-unavailable',
          }
        : {kind: 'fresh' as const, fetchedAtMs: period.endMs},
  };
  const client = {
    readEntries: jest.fn(async () => ({
      records: [],
      freshness: {kind: 'fresh', fetchedAtMs: period.endMs},
    })),
    readRecordedTreatments: jest.fn(async () => raw),
    readTreatments: jest.fn(async () => {
      throw new Error('Normalized treatments omit delivery evidence.');
    }),
    assertCurrentSource: jest.fn(),
  };
  return {
    client,
    source: createBrowserNightscoutDataSources({
      client: client as unknown as BrowserNightscoutClient,
      sourceId: 'source',
      locale: 'en',
      journal,
    }).therapyContext,
  };
};

it('uses raw delivered evidence for browser therapy context and preserves partial coverage', async () => {
  const {source, client} = create();
  const snapshot = await source.loadTherapyContext(period);
  expect(client.readTreatments).not.toHaveBeenCalled();
  expect(snapshot.insulinSummary).toMatchObject({
    quality: 'partial',
    bolusUnits: 0.05,
    basalCoveragePercent: 0,
  });
  expect(snapshot.totals.insulinUnits).toBeUndefined();
  expect(client.assertCurrentSource).toHaveBeenCalled();
});

it.each(['stale', 'incomplete'] as const)(
  'rejects %s browser treatment history',
  async failure => {
    await expect(
      create(failure).source.loadTherapyContext(period),
    ).rejects.toThrow(/fresh.*complete/i);
  },
);

it('rejects cached browser glucose before presenting reliable therapy analysis', async () => {
  const {source, client} = create();
  client.readEntries.mockResolvedValue({
    records: [],
    freshness: {kind: 'stale', fetchedAtMs: period.endMs},
  });
  await expect(source.loadTherapyContext(period)).rejects.toThrow(
    /fresh.*complete/i,
  );
});
