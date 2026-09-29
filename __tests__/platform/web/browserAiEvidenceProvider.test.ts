import {
  createBrowserAiEvidenceProvider,
  type BrowserNightscoutEntry,
  type BrowserNightscoutRange,
  type BrowserNightscoutDeviceStatus,
} from '../../../src/platform/web';

const DAY_MS = 24 * 60 * 60 * 1_000;
const NOW_MS = Date.UTC(2026, 7, 20, 12, 0, 0);
const fresh = <T>(records: readonly T[]): BrowserNightscoutRange<T> => ({
  records,
  freshness: {kind: 'fresh', fetchedAtMs: NOW_MS},
});

describe('browser AI Nightscout evidence provider', () => {
  it('loads the full requested month and exposes stale device timestamps and incomplete coverage', async () => {
    const readEntries = jest.fn().mockResolvedValue({
      ...fresh([{date: NOW_MS - 60_000, sgv: 110}]),
      complete: false,
    });
    const provider = createBrowserAiEvidenceProvider({
      client: {
        readEntries,
        readRecordedTreatments: jest.fn().mockResolvedValue(fresh([])),
        readDeviceStatuses: jest
          .fn()
          .mockResolvedValue(
            fresh([{createdAtMs: NOW_MS - 60 * 60_000, iobUnits: 1.5}]),
          ),
      },
      sourceId: 'source-a',
      now: () => NOW_MS,
    });
    const signal = new AbortController().signal;
    const context = await provider.loadVisibleContext({
      specialist: 'general-chat',
      locale: 'en',
      rangeDays: 30,
      focus: {kind: 'period', startMs: NOW_MS - 30 * DAY_MS, endMs: NOW_MS},
      signal,
    });
    expect(readEntries).toHaveBeenCalledWith(
      NOW_MS - 30 * DAY_MS,
      NOW_MS,
      signal,
    );
    expect(context).not.toContain('14 days');
    expect(context).toContain('glucose range is incomplete');
    expect(context).toContain('Device sample is stale');
    expect(context).toContain(new Date(NOW_MS - 60 * 60_000).toISOString());
  });
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
    const readRecordedTreatments = jest
      .fn<
        Promise<BrowserNightscoutRange<Record<string, unknown>>>,
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
      client: {readEntries, readRecordedTreatments, readDeviceStatuses},
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
      [readEntries, readRecordedTreatments, readDeviceStatuses].every(mock =>
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
        readRecordedTreatments: jest.fn().mockResolvedValue(fresh([])),
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

it.each([
  [
    {eventType: 'Correction Bolus', insulin: 2, deliveredUnits: 1},
    'recorded bolus: 1 U',
  ],
  [
    {eventType: 'Correction Bolus', insulin: 2, duration: -1},
    'recorded bolus: unknown',
  ],
  [
    {
      eventType: 'Temp Basal',
      enteredBy: 'loop://fixture',
      amount: 'bad',
      duration: 5,
    },
    'Recorded basal subtotal: unknown',
  ],
])(
  'uses raw evidence for insulin facts without exposing planned or malformed amounts: %p',
  async (record, expected) => {
    const provider = createBrowserAiEvidenceProvider({
      client: {
        readEntries: jest.fn(async () =>
          fresh([{date: NOW_MS - 60_000, sgv: 110}]),
        ),
        readRecordedTreatments: jest.fn(async () =>
          fresh([
            {...record, created_at: new Date(NOW_MS - 3_600_000).toISOString()},
          ]),
        ),
        readDeviceStatuses: jest.fn(async () => fresh([])),
      },
      sourceId: 'source-a',
      now: () => NOW_MS,
    });
    const text = await provider.loadVisibleContext({
      specialist: 'general-chat',
      locale: 'en',
      rangeDays: 1,
      signal: new AbortController().signal,
    });
    expect(text).toContain(expected);
    expect(text).not.toContain('2 U insulin');
    expect(text).not.toContain('-1 amount');
    expect(text).not.toContain('Recorded insulin total:');
  },
);

it.each([
  [2026, 2, 8],
  [2026, 10, 1],
  [2026, 2, 27],
  [2026, 9, 25],
])(
  'ends selected local days at the next calendar midnight: %p',
  async (year, month, day) => {
    const startMs = new Date(year, month, day).getTime();
    const endMs = new Date(year, month, day + 1).getTime();
    const nowMs = new Date(year, month, day + 2).getTime();
    const readEntries = jest.fn(async () => fresh([]));
    const provider = createBrowserAiEvidenceProvider({
      client: {
        readEntries,
        readRecordedTreatments: jest.fn(async () => fresh([])),
        readDeviceStatuses: jest.fn(async () => fresh([])),
      },
      sourceId: 'source-a',
      now: () => nowMs,
    });
    const signal = new AbortController().signal;
    await provider.loadVisibleContext({
      specialist: 'general-chat',
      locale: 'en',
      focus: {kind: 'day', dayStartMs: startMs},
      signal,
    });
    expect(readEntries).toHaveBeenCalledWith(startMs, endMs, signal);
  },
);
