import {
  createBrowserCurrentDataSource,
  createBrowserAiEvidenceProvider,
  loadBrowserCurrentSnapshot,
  decodeBrowserNightscoutDeviceStatus,
} from '../../../src/platform/web';
import {
  coreDestinationRegistry,
  createStoredDestinationTarget,
  resolveDestinationTarget,
  CORE_DESTINATION_IDS,
} from '../../../src/product/destinations';

const NOW = Date.UTC(2026, 8, 29, 12);
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const target = resolveDestinationTarget(coreDestinationRegistry,
  createStoredDestinationTarget(CORE_DESTINATION_IDS.dayGraph), undefined, {platform: 'web'});
const fresh = <T>(records: readonly T[], at = NOW) => ({records, freshness: {kind: 'fresh' as const, fetchedAtMs: at}});
const request = () => ({specialist: 'general-chat' as const, locale: 'en' as const,
  rangeDays: 1 as const, signal: new AbortController().signal});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {resolve = done;});
  return {promise, resolve};
};
const fixture = () => ({
  readEntries: jest.fn(async (start: number, end: number) => fresh([
    end - start > 2 * 60 * MINUTE + 1
      ? {date: NOW - 243 * MINUTE, sgv: 160, direction: 'Flat'}
      : {date: NOW - 4 * MINUTE, sgv: 129, direction: 'Flat'},
  ])),
  readRecordedTreatments: jest.fn(async () => fresh([])),
  readDeviceStatuses: jest.fn(async () => fresh([{
    createdAtMs: NOW - MINUTE,
    iobUnits: -0.25, iobTimestampMs: NOW - 2 * MINUTE,
    cobGrams: 0, cobTimestampMs: NOW - 3 * MINUTE,
  }])),
});

describe('browser shared current evidence', () => {
  it('shares one current read between widget and AI despite 243-minute-old history', async () => {
    const client = fixture();
    const currentDataSource = createBrowserCurrentDataSource({client, now: () => NOW});
    const provider = createBrowserAiEvidenceProvider({client, currentDataSource, sourceId: 'fixture', now: () => NOW});
    const [widget, evidence] = await Promise.all([
      loadBrowserCurrentSnapshot({currentDataSource, target, locale: 'en'}),
      provider.loadVisibleContext(request()),
    ]);
    expect(widget).toMatchObject({status: 'ready', glucoseLabel: '129 mg/dL', dataAgeLabel: '4 min ago', iobLabel: 'IOB -0.25 U', cobLabel: 'COB 0 g'});
    expect(evidence).toContain('Current glucose: 129 mg/dL; fresh');
    expect(evidence).toContain(new Date(NOW - 4 * MINUTE).toISOString());
    expect(evidence).toContain('Latest sample in selected range: 160 mg/dL');
    expect(evidence).not.toContain('No current glucose');
    expect(client.readEntries).toHaveBeenCalledTimes(2);
    expect(client.readDeviceStatuses).toHaveBeenCalledTimes(1);
  });

  it.each(['failed', 'sparse'] as const)('retains current glucose when historical coverage is %s', async history => {
    const client = fixture();
    client.readEntries.mockImplementation(async (start, end) => {
      if (end - start > 2 * 60 * MINUTE + 1) {
        if (history === 'failed') {
          throw new Error('history unavailable');
        }
        return fresh([]);
      }
      return fresh([{date: NOW - 4 * MINUTE, sgv: 129, direction: 'Flat'}]);
    });
    const provider = createBrowserAiEvidenceProvider({client, sourceId: 'fixture', now: () => NOW});
    const evidence = await provider.loadVisibleContext(request());
    expect(evidence).toContain('Current glucose: 129 mg/dL; fresh');
    expect(evidence).toContain(history === 'failed' ? 'Glucose history for the selected period is unavailable' : 'No glucose samples in range');
    expect(evidence).not.toContain('Current glucose: unavailable');
  });

  it('retains glucose in both consumers when device status fails', async () => {
    const client = fixture();
    client.readDeviceStatuses.mockRejectedValue(new Error('device unavailable'));
    const currentDataSource = createBrowserCurrentDataSource({client, now: () => NOW});
    const provider = createBrowserAiEvidenceProvider({client, currentDataSource, sourceId: 'fixture', now: () => NOW});
    const [widget, evidence] = await Promise.all([
      loadBrowserCurrentSnapshot({currentDataSource, target, locale: 'en'}), provider.loadVisibleContext(request()),
    ]);
    expect(widget).toMatchObject({status: 'ready', glucoseLabel: '129 mg/dL'});
    expect(widget).not.toHaveProperty('iobLabel');
    expect(evidence).toContain('Current glucose: 129 mg/dL; fresh');
    expect(evidence).toContain('IOB: unavailable');
    expect(evidence).toContain('COB: unavailable');
  });

  it('uses independent field timestamps after browser decoding, not a fresh upload time', async () => {
    const client = fixture();
    const decoded = decodeBrowserNightscoutDeviceStatus({created_at: new Date(NOW - MINUTE).toISOString(),
      loop: {iob: {iob: -0.25, timestamp: new Date(NOW - 70 * MINUTE).toISOString()},
        cob: {cob: 0, timestamp: new Date(NOW - 3 * MINUTE).toISOString()}}});
    client.readDeviceStatuses.mockResolvedValue(fresh([decoded!]) as Awaited<ReturnType<typeof client.readDeviceStatuses>>);
    const currentDataSource = createBrowserCurrentDataSource({client, now: () => NOW});
    const provider = createBrowserAiEvidenceProvider({client, currentDataSource, sourceId: 'fixture', now: () => NOW});
    const [widget, evidence] = await Promise.all([
      loadBrowserCurrentSnapshot({currentDataSource, target, locale: 'en'}), provider.loadVisibleContext(request()),
    ]);
    expect(widget).not.toHaveProperty('iobLabel');
    expect(widget.cobLabel).toBe('COB 0 g');
    expect(evidence).toContain('IOB: stale');
    expect(evidence).not.toContain('-0.25 U');
    expect(evidence).toContain('COB: 0 g; fresh');
  });

  it('refreshes completed reads and ages current facts again after slow history', async () => {
    let now = NOW;
    const client = fixture();
    const delayedHistory = deferred<ReturnType<typeof fresh<{date: number; sgv: number; direction: string}>>>();
    const currentLoaded = deferred<void>();
    client.readEntries.mockImplementation(async (start, end) => {
      if (end - start > 2 * 60 * MINUTE + 1) {
        return delayedHistory.promise;
      }
      currentLoaded.resolve();
      return fresh([{date: NOW - 4 * MINUTE, sgv: 129, direction: 'Flat'}]);
    });
    const currentDataSource = createBrowserCurrentDataSource({client, now: () => now});
    await currentDataSource.loadCurrent();
    const provider = createBrowserAiEvidenceProvider({client, currentDataSource, sourceId: 'fixture', now: () => now});
    const pending = provider.loadVisibleContext(request());
    await currentLoaded.promise;
    await Promise.resolve();
    now += 20 * MINUTE;
    delayedHistory.resolve(fresh([{date: NOW - 243 * MINUTE, sgv: 160, direction: 'Flat'}]));
    const evidence = await pending;
    expect(evidence).toContain('Current glucose: 129 mg/dL; stale');
    expect(evidence).not.toContain('Current glucose: 129 mg/dL; fresh');
    expect(client.readEntries).toHaveBeenCalledTimes(3);
  });

  it('rejects an A-to-B-to-A scope change while optional history is loading', async () => {
    let revision = 0;
    const client = fixture();
    const delayedHistory = deferred<ReturnType<typeof fresh<{date: number; sgv: number; direction: string}>>>();
    client.readEntries.mockImplementation(async (start, end) => end - start > 2 * 60 * MINUTE + 1
      ? delayedHistory.promise : fresh([{date: NOW - 4 * MINUTE, sgv: 129, direction: 'Flat'}]));
    const currentDataSource = createBrowserCurrentDataSource({client, now: () => NOW, getScopeKey: () => String(revision)});
    const provider = createBrowserAiEvidenceProvider({client, currentDataSource, sourceId: 'fixture', now: () => NOW, getScopeKey: () => String(revision)});
    const pending = provider.loadVisibleContext(request());
    await currentDataSource.loadCurrent();
    revision += 2;
    delayedHistory.resolve(fresh([]));
    await expect(pending).rejects.toThrow('source changed');
  });

  it('keeps current readings separate from an explicitly selected historical period', async () => {
    const client = fixture();
    client.readEntries.mockImplementation(async (_start, end) => end < NOW - DAY / 2
      ? fresh([{date: NOW - DAY - MINUTE, sgv: 160, direction: 'Flat'}])
      : fresh([{date: NOW - 4 * MINUTE, sgv: 129, direction: 'Flat'}]));
    const provider = createBrowserAiEvidenceProvider({client, sourceId: 'fixture', now: () => NOW});
    const signal = new AbortController().signal;
    const evidence = await provider.loadVisibleContext({...request(), signal, focus: {kind: 'period', startMs: NOW - 2 * DAY, endMs: NOW - DAY}});
    expect(client.readEntries).toHaveBeenCalledWith(NOW - 2 * DAY, NOW - DAY, signal);
    expect(evidence).toContain('Current glucose: 129 mg/dL; fresh');
    expect(evidence).toContain('Latest sample in selected range: 160 mg/dL');
  });

  it('exposes the earliest fresh observation expiry without expiring stale historical facts', async () => {
    const client = fixture();
    const provider = createBrowserAiEvidenceProvider({client, sourceId: 'fixture', now: () => NOW});
    const bundle = await provider.loadEvidence!(request());
    expect(bundle.currentFactsExpireAtMs).toBe(NOW + 11 * MINUTE);
    expect(bundle.text).toContain('Current glucose: 129 mg/dL; fresh');
    expect(bundle.text).toContain('Latest sample in selected range: 160 mg/dL');
  });

  it('rejects a cancelled subscriber without poisoning the widget current read', async () => {
    const client = fixture();
    const glucose = deferred<ReturnType<typeof fresh<{date: number; sgv: number; direction: string}>>>();
    client.readEntries.mockImplementation(async (start, end) => end - start > 2 * 60 * MINUTE + 1
      ? fresh([]) : glucose.promise);
    const currentDataSource = createBrowserCurrentDataSource({client, now: () => NOW});
    const provider = createBrowserAiEvidenceProvider({client, currentDataSource, sourceId: 'fixture', now: () => NOW});
    const controller = new AbortController();
    const pending = provider.loadVisibleContext({...request(), signal: controller.signal});
    const widget = loadBrowserCurrentSnapshot({currentDataSource, target, locale: 'en'});
    controller.abort();
    await expect(pending).rejects.toMatchObject({name: 'AbortError'});
    glucose.resolve(fresh([{date: NOW - 4 * MINUTE, sgv: 129, direction: 'Flat'}]));
    await expect(widget).resolves.toMatchObject({status: 'ready', glucoseLabel: '129 mg/dL'});
  });
});
