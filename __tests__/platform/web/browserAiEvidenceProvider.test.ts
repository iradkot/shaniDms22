import {
  createBrowserAiEvidenceProvider,
  type BrowserNightscoutEntry,
  type BrowserNightscoutRange,
  type BrowserNightscoutTreatment,
  type BrowserNightscoutDeviceStatus,
} from '../../../src/platform/web';

const DAY_MS = 24 * 60 * 60 * 1_000;
const NOW_MS = Date.UTC(2026, 7, 20, 12, 0, 0);
const fresh = <T>(records: readonly T[]): BrowserNightscoutRange<T> => ({
  records,
  freshness: {kind: 'fresh', fetchedAtMs: NOW_MS},
});

describe('browser AI Nightscout evidence provider', () => {
  it('builds bounded visible source-scoped facts without forwarding raw records', async () => {
    const readEntries = jest
      .fn<
        Promise<BrowserNightscoutRange<BrowserNightscoutEntry>>,
        [number, number, AbortSignal?]
      >()
      .mockImplementation(async (startMs, endMs) =>
        fresh([
          {
            _id: 'entry-1',
            date: Math.max(startMs, endMs - 5 * 60_000),
            sgv: 112,
            direction: 'Flat',
          },
        ]),
      );
    const readTreatments = jest
      .fn<
        Promise<BrowserNightscoutRange<BrowserNightscoutTreatment>>,
        [number, number, AbortSignal?]
      >()
      .mockResolvedValue(
        fresh([
          {
            _id: 'treatment-1',
            date: NOW_MS - 30 * 60_000,
            eventType: 'Meal Bolus',
            carbs: 42,
            insulin: 3.25,
            notes: 'private free-form note must not be forwarded',
          },
        ]),
      );
    const readDeviceStatuses = jest
      .fn<
        Promise<BrowserNightscoutRange<BrowserNightscoutDeviceStatus>>,
        [number, number, AbortSignal?]
      >()
      .mockResolvedValue(
        fresh([
          {
            createdAtMs: NOW_MS - 60_000,
            iobUnits: 1.2,
            cobGrams: 18,
          },
        ]),
      );
    const provider = createBrowserAiEvidenceProvider({
      client: {readEntries, readTreatments, readDeviceStatuses},
      sourceId: 'ns_source_a',
      now: () => NOW_MS,
    });
    const controller = new AbortController();

    const context = await provider.loadVisibleContext({
      specialist: 'hypo-investigation',
      locale: 'en',
      focus: {
        kind: 'period',
        startMs: NOW_MS - 30 * DAY_MS,
        endMs: NOW_MS,
      },
      signal: controller.signal,
    });

    expect(context).toContain('Nightscout evidence');
    expect(context).toContain('ns_source_a');
    expect(context).toContain('112 mg/dL');
    expect(context).toContain('IOB 1.2 U');
    expect(context).toContain('COB 18 g');
    expect(context).toContain('Meal Bolus');
    expect(context).toContain('limited to the latest 14 days');
    expect(context).not.toContain('private free-form note');
    expect(context.length).toBeLessThanOrEqual(8_000);
    expect(
      readEntries.mock.calls.every(
        ([startMs, endMs]) => endMs - startMs <= 14 * DAY_MS,
      ),
    ).toBe(true);
    expect(
      [readEntries, readTreatments, readDeviceStatuses].every(mock =>
        mock.mock.calls.every(call => call[2] === controller.signal),
      ),
    ).toBe(true);
  });

  it('refuses to describe stale cached evidence as current online evidence', async () => {
    const provider = createBrowserAiEvidenceProvider({
      client: {
        readEntries: jest.fn().mockResolvedValue({
          records: [{date: NOW_MS - 60_000, sgv: 101}],
          freshness: {kind: 'stale', fetchedAtMs: NOW_MS - DAY_MS},
        }),
        readTreatments: jest.fn().mockResolvedValue(fresh([])),
        readDeviceStatuses: jest.fn().mockResolvedValue(fresh([])),
      },
      sourceId: 'ns_source_a',
      now: () => NOW_MS,
    });

    await expect(
      provider.loadVisibleContext({
        specialist: 'general-chat',
        locale: 'en',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('Fresh Nightscout evidence is unavailable');
  });
});
