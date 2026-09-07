import {WebApiError, type AuthenticatedWebApiClient} from '../api';
import type {IndexedDbKeyValueStore} from '../storage';

const CACHE_PREFIX = 'shani.web.nightscout-cache.v2:';
const RETENTION_MS = 14 * 24 * 60 * 60 * 1_000;
const MAX_CACHE_BYTES = 25 * 1_024 * 1_024;
const STATUS_RECHECK_INTERVAL_MS = 5 * 60 * 1_000;
const DEVICE_STATUS_CHUNK_MS = 2 * 60 * 60 * 1_000;
const MAX_DEVICE_STATUS_SERIES_MS = 27 * 60 * 60 * 1_000;
// Matches the existing upstream entries route; saturation is not a complete range.
const ENTRIES_RANGE_LIMIT = 15_000;

export type BrowserNightscoutResource =
  | 'entries'
  | 'treatments'
  | 'profile'
  | 'devicestatus';

export interface BrowserNightscoutStatus {
  readonly configured: boolean;
  readonly sourceId?: string;
  readonly workspaceId?: string;
  readonly displayLabel?: string;
}

export interface BrowserNightscoutRange<T> {
  readonly records: readonly T[];
  /** Glucose-only raw response completeness, evaluated before invalid rows are removed. */
  readonly complete?: boolean;
  readonly freshness:
    | {readonly kind: 'fresh'; readonly fetchedAtMs: number}
    | {readonly kind: 'stale'; readonly fetchedAtMs: number};
}

interface StoredRange {
  readonly schemaVersion: 2;
  readonly sourceId: string;
  readonly workspaceId: string;
  readonly resource: BrowserNightscoutResource;
  readonly startMs: number;
  readonly endMs: number;
  readonly fetchedAtMs: number;
  readonly lastAccessedAtMs: number;
  readonly data: unknown;
}

export interface BrowserNightscoutClientOptions {
  readonly api: Pick<AuthenticatedWebApiClient, 'requestJson'>;
  readonly storage: Pick<
    IndexedDbKeyValueStore,
    'getItem' | 'setItem' | 'removeItem' | 'getAllKeys'
  >;
  readonly sourceId: string;
  readonly workspaceId: string;
  readonly onRebootstrapRequired?: () => void;
  readonly now?: () => number;
}

interface BrowserLifecycleEventTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface BrowserVisibilityTarget extends BrowserLifecycleEventTarget {
  readonly visibilityState: string;
}

export interface BrowserNightscoutStatusRecheckOptions {
  readonly onRecheck: () => void;
  readonly connectivity?: BrowserLifecycleEventTarget;
  readonly visibility?: BrowserVisibilityTarget;
  readonly scheduleInterval?: (
    listener: () => void,
    delayMs: number,
  ) => unknown;
  readonly cancelInterval?: (handle: unknown) => void;
}

export const activateBrowserNightscoutStatusRechecks = (
  options: BrowserNightscoutStatusRecheckOptions,
): (() => void) => {
  const connectivity =
    options.connectivity ??
    (typeof globalThis.window === 'undefined'
      ? undefined
      : (globalThis.window as unknown as BrowserLifecycleEventTarget));
  const visibility =
    options.visibility ??
    (typeof globalThis.document === 'undefined'
      ? undefined
      : (globalThis.document as unknown as BrowserVisibilityTarget));
  const scheduleInterval =
    options.scheduleInterval ??
    ((listener: () => void, delayMs: number): unknown =>
      globalThis.setInterval(listener, delayMs));
  const cancelInterval =
    options.cancelInterval ??
    ((handle: unknown): void =>
      globalThis.clearInterval(handle as ReturnType<typeof setInterval>));
  let active = true;
  const recheck = (): void => {
    if (active) {
      options.onRecheck();
    }
  };
  const onVisible = (): void => {
    if (visibility?.visibilityState === 'visible') {
      recheck();
    }
  };
  const onPeriodic = (): void => {
    if (visibility?.visibilityState !== 'hidden') {
      recheck();
    }
  };
  connectivity?.addEventListener('online', recheck);
  visibility?.addEventListener('visibilitychange', onVisible);
  const interval = scheduleInterval(onPeriodic, STATUS_RECHECK_INTERVAL_MS);

  return () => {
    if (!active) {
      return;
    }
    active = false;
    connectivity?.removeEventListener('online', recheck);
    visibility?.removeEventListener('visibilitychange', onVisible);
    cancelInterval(interval);
  };
};

export interface BrowserNightscoutStatusMonitorOptions
  extends Omit<BrowserNightscoutStatusRecheckOptions, 'onRecheck'> {
  readonly currentStatus: BrowserNightscoutStatus;
  readonly readStatus: () => Promise<BrowserNightscoutStatus>;
  readonly onIdentityChanged: () => void;
}

const sameNightscoutIdentity = (
  left: BrowserNightscoutStatus,
  right: BrowserNightscoutStatus,
): boolean =>
  left.configured === right.configured &&
  left.sourceId === right.sourceId &&
  left.workspaceId === right.workspaceId;

export const activateBrowserNightscoutStatusMonitor = (
  options: BrowserNightscoutStatusMonitorOptions,
): (() => void) => {
  let active = true;
  let inFlight = false;
  let changeReported = false;
  const recheck = (): void => {
    if (!active || inFlight || changeReported) {
      return;
    }
    inFlight = true;
    Promise.resolve()
      .then(options.readStatus)
      .then(status => {
        if (
          active &&
          !changeReported &&
          !sameNightscoutIdentity(options.currentStatus, status)
        ) {
          changeReported = true;
          options.onIdentityChanged();
        }
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
      });
  };
  const deactivateRechecks = activateBrowserNightscoutStatusRechecks({
    onRecheck: recheck,
    ...(options.connectivity === undefined
      ? {}
      : {connectivity: options.connectivity}),
    ...(options.visibility === undefined
      ? {}
      : {visibility: options.visibility}),
    ...(options.scheduleInterval === undefined
      ? {}
      : {scheduleInterval: options.scheduleInterval}),
    ...(options.cancelInterval === undefined
      ? {}
      : {cancelInterval: options.cancelInterval}),
  });
  return () => {
    active = false;
    deactivateRechecks();
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const validSourceId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9._-]{1,160}$/.test(value);

const text = (value: unknown, maximum = 512): string | undefined =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= maximum
    ? value.trim()
    : undefined;

const number = (value: unknown): number | undefined => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

export interface BrowserNightscoutEntry {
  readonly _id?: string;
  readonly date: number;
  readonly sgv: number;
  readonly direction?: string;
  readonly device?: string;
}

export interface BrowserNightscoutTreatment {
  readonly _id?: string;
  readonly identifier?: string;
  readonly created_at?: string;
  readonly date?: number;
  readonly eventType?: string;
  readonly enteredBy?: string;
  readonly carbs?: number;
  readonly insulin?: number;
  readonly amount?: number;
  readonly rate?: number;
  readonly absolute?: number;
  readonly duration?: number;
  readonly notes?: string;
  readonly profile?: string;
  readonly app?: string;
}

export interface BrowserNightscoutDeviceStatus {
  readonly _id?: string;
  readonly createdAtMs: number;
  readonly iobUnits?: number;
  readonly bolusIobUnits?: number;
  readonly basalIobUnits?: number;
  readonly cobGrams?: number;
}

export interface BrowserNightscoutBasalProfile {
  readonly entries: readonly {
    readonly secondsFromMidnight: number;
    readonly rateUnitsPerHour: number;
  }[];
}

export const decodeBrowserNightscoutEntry = (
  value: unknown,
): BrowserNightscoutEntry | null => {
  if (!isRecord(value)) {
    return null;
  }
  const date = number(value.date);
  const sgv = number(value.sgv);
  if (
    date === undefined ||
    sgv === undefined ||
    date <= 0 ||
    sgv <= 0 ||
    sgv > 1_000
  ) {
    return null;
  }
  const id = text(value._id, 160) ?? text(value.identifier, 160);
  const direction = text(value.direction, 80);
  const device = text(value.device, 160);
  return {
    date,
    sgv,
    ...(id === undefined ? {} : {_id: id}),
    ...(direction === undefined ? {} : {direction}),
    ...(device === undefined ? {} : {device}),
  };
};

export const treatmentTimestampMs = (
  treatment: BrowserNightscoutTreatment,
): number | undefined => {
  if (treatment.date !== undefined) {
    return treatment.date;
  }
  if (treatment.created_at !== undefined) {
    const parsed = Date.parse(treatment.created_at);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

export const decodeBrowserNightscoutTreatment = (
  value: unknown,
): BrowserNightscoutTreatment | null => {
  if (!isRecord(value)) {
    return null;
  }
  const createdAt = text(value.created_at, 80);
  const date =
    number(value.date) ?? number(value.mills) ?? number(value.timestamp);
  if (
    date === undefined &&
    (createdAt === undefined || !Number.isFinite(Date.parse(createdAt)))
  ) {
    return null;
  }
  const numeric = (key: string): number | undefined => number(value[key]);
  const id = text(value._id, 160);
  const identifier = text(value.identifier, 160);
  const eventType = text(value.eventType, 160);
  const enteredBy = text(value.enteredBy, 160);
  const carbs = numeric('carbs');
  const insulin = numeric('insulin');
  const amount = numeric('amount');
  const rate = bounded(value.rate, 0, 50);
  const absolute = bounded(value.absolute, 0, 50);
  const duration = bounded(value.duration, 0, 24 * 60);
  const notes = text(value.notes, 2_000);
  const profile = text(value.profile, 512);
  const app = text(value.app, 160);
  const result: BrowserNightscoutTreatment = {
    ...(id === undefined ? {} : {_id: id}),
    ...(identifier === undefined ? {} : {identifier}),
    ...(createdAt === undefined ? {} : {created_at: createdAt}),
    ...(date === undefined ? {} : {date}),
    ...(eventType === undefined ? {} : {eventType}),
    ...(enteredBy === undefined ? {} : {enteredBy}),
    ...(carbs === undefined ? {} : {carbs}),
    ...(insulin === undefined ? {} : {insulin}),
    ...(amount === undefined ? {} : {amount}),
    ...(rate === undefined ? {} : {rate}),
    ...(absolute === undefined ? {} : {absolute}),
    ...(duration === undefined ? {} : {duration}),
    ...(notes === undefined ? {} : {notes}),
    ...(profile === undefined ? {} : {profile}),
    ...(app === undefined ? {} : {app}),
  };
  return result;
};

const nestedRecord = (
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined =>
  isRecord(value[key]) ? (value[key] as Record<string, unknown>) : undefined;

const bounded = (
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined => {
  const parsed = number(value);
  return parsed !== undefined && parsed >= minimum && parsed <= maximum
    ? parsed
    : undefined;
};

export const decodeBrowserNightscoutDeviceStatus = (
  value: unknown,
): BrowserNightscoutDeviceStatus | null => {
  if (!isRecord(value)) {
    return null;
  }
  const createdAt = text(value.created_at, 80);
  const createdAtMs =
    number(value.createdAtMs) ??
    number(value.date) ??
    number(value.mills) ??
    (createdAt === undefined ? undefined : Date.parse(createdAt));
  if (
    createdAtMs === undefined ||
    !Number.isSafeInteger(createdAtMs) ||
    createdAtMs <= 0
  ) {
    return null;
  }
  const loop = nestedRecord(value, 'loop');
  const loopIob = loop === undefined ? undefined : nestedRecord(loop, 'iob');
  const loopCob = loop === undefined ? undefined : nestedRecord(loop, 'cob');
  const openaps = nestedRecord(value, 'openaps');
  const openapsIob =
    openaps === undefined ? undefined : nestedRecord(openaps, 'iob');
  const suggested =
    openaps === undefined ? undefined : nestedRecord(openaps, 'suggested');
  const enacted =
    openaps === undefined ? undefined : nestedRecord(openaps, 'enacted');
  const iobUnits = bounded(
    value.iobUnits ?? loopIob?.iob ?? openapsIob?.iob,
    -100,
    100,
  );
  const bolusIobUnits = bounded(
    value.bolusIobUnits ?? loopIob?.bolusIob ?? openapsIob?.bolusiob,
    -100,
    100,
  );
  const basalIobUnits = bounded(
    value.basalIobUnits ?? loopIob?.basalIob ?? openapsIob?.basaliob,
    -100,
    100,
  );
  const cobGrams = bounded(
    value.cobGrams ?? loopCob?.cob ?? suggested?.COB ?? enacted?.COB,
    0,
    1_000,
  );
  if (
    iobUnits === undefined &&
    bolusIobUnits === undefined &&
    basalIobUnits === undefined &&
    cobGrams === undefined
  ) {
    return null;
  }
  const id = text(value._id, 160);
  return {
    createdAtMs,
    ...(id === undefined ? {} : {_id: id}),
    ...(iobUnits === undefined ? {} : {iobUnits}),
    ...(bolusIobUnits === undefined ? {} : {bolusIobUnits}),
    ...(basalIobUnits === undefined ? {} : {basalIobUnits}),
    ...(cobGrams === undefined ? {} : {cobGrams}),
  };
};

const decodeBrowserNightscoutBasalProfile = (
  value: unknown,
): BrowserNightscoutBasalProfile | null => {
  if (!isRecord(value)) {
    return null;
  }
  const defaultProfile = text(value.defaultProfile, 160);
  const store = nestedRecord(value, 'store');
  const selected =
    defaultProfile === undefined || store === undefined
      ? undefined
      : isRecord(store[defaultProfile])
      ? (store[defaultProfile] as Record<string, unknown>)
      : undefined;
  const normalized = Array.isArray(value.entries);
  const basal = normalized ? value.entries : selected?.basal;
  if (!Array.isArray(basal)) {
    return null;
  }
  const entries = basal
    .flatMap(entry => {
      if (!isRecord(entry)) {
        return [];
      }
      const time = text(entry.time, 8);
      const match =
        time === undefined ? null : /^(\d{1,2}):(\d{2})$/.exec(time);
      const parsedSeconds =
        match === null || Number(match[1]) > 23 || Number(match[2]) > 59
          ? undefined
          : Number(match[1]) * 60 * 60 + Number(match[2]) * 60;
      const secondsFromMidnight = bounded(
        normalized
          ? entry.secondsFromMidnight
          : entry.timeAsSeconds ?? parsedSeconds,
        0,
        24 * 60 * 60 - 1,
      );
      const rateUnitsPerHour = bounded(
        normalized ? entry.rateUnitsPerHour : entry.value,
        0,
        50,
      );
      return secondsFromMidnight === undefined ||
        !Number.isInteger(secondsFromMidnight) ||
        rateUnitsPerHour === undefined
        ? []
        : [{secondsFromMidnight, rateUnitsPerHour}];
    })
    .sort(
      (left, right) => left.secondsFromMidnight - right.secondsFromMidnight,
    );
  // A partial or ambiguous schedule would silently change delivered totals.
  return entries.length === 0 ||
    entries.length !== basal.length ||
    new Set(entries.map(entry => entry.secondsFromMidnight)).size !==
      entries.length
    ? null
    : {entries};
};

const cacheKey = (
  workspaceId: string,
  sourceId: string,
  resource: BrowserNightscoutResource,
  startMs: number,
  endMs: number,
): string =>
  `${CACHE_PREFIX}${workspaceId}:${sourceId}:${resource}:${startMs}:${endMs}`;

const decodeStoredRange = (raw: string | null): StoredRange | null => {
  if (raw === null) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.schemaVersion !== 2 ||
      !validSourceId(value.sourceId) ||
      !validSourceId(value.workspaceId) ||
      !['entries', 'treatments', 'profile', 'devicestatus'].includes(
        String(value.resource),
      ) ||
      !Number.isSafeInteger(value.startMs) ||
      !Number.isSafeInteger(value.endMs) ||
      !Number.isSafeInteger(value.fetchedAtMs) ||
      !Number.isSafeInteger(value.lastAccessedAtMs) ||
      (value.startMs as number) > (value.endMs as number)
    ) {
      return null;
    }
    return value as unknown as StoredRange;
  } catch {
    return null;
  }
};

const responseData = (value: unknown): unknown => {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    !Object.prototype.hasOwnProperty.call(value, 'data')
  ) {
    throw new Error('Nightscout proxy returned an invalid response.');
  }
  return value.data;
};

const decodeStatus = (value: unknown): BrowserNightscoutStatus => {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.configured !== 'boolean'
  ) {
    throw new Error('Nightscout status is invalid.');
  }
  const sourceId = validSourceId(value.sourceId) ? value.sourceId : undefined;
  const workspaceId = validSourceId(value.workspaceId)
    ? value.workspaceId
    : undefined;
  if (
    value.configured &&
    (sourceId === undefined || workspaceId === undefined)
  ) {
    throw new Error('Nightscout status has no Workspace identity.');
  }
  const displayLabel = text(value.displayLabel, 160);
  return {
    configured: value.configured,
    ...(sourceId === undefined ? {} : {sourceId}),
    ...(workspaceId === undefined ? {} : {workspaceId}),
    ...(displayLabel === undefined ? {} : {displayLabel}),
  };
};

let cacheTail: Promise<void> = Promise.resolve();

export class BrowserNightscoutClient {
  private readonly now: () => number;
  private rebootstrapRequested = false;

  constructor(private readonly options: BrowserNightscoutClientOptions) {
    if (!validSourceId(options.sourceId)) {
      throw new Error('Nightscout source identity is invalid.');
    }
    if (!validSourceId(options.workspaceId)) {
      throw new Error('Nightscout Workspace identity is invalid.');
    }
    this.now = options.now ?? Date.now;
  }

  /** Calendar chunks must not combine successes with a source-identity rejection. */
  assertCurrentSource(): void {
    if (this.rebootstrapRequested) {
      throw new Error('Nightscout source changed while loading records.');
    }
  }

  static async status(
    api: Pick<AuthenticatedWebApiClient, 'requestJson'>,
  ): Promise<BrowserNightscoutStatus> {
    return decodeStatus(await api.requestJson('/v1/vault/nightscout/status'));
  }

  static async provision(
    api: Pick<AuthenticatedWebApiClient, 'requestJson'>,
    input: {readonly url: string; readonly apiKey: string},
  ): Promise<BrowserNightscoutStatus> {
    return decodeStatus(
      await api.requestJson('/v1/vault/nightscout/provision', {
        method: 'POST',
        body: {version: 1, url: input.url, apiKey: input.apiKey},
      }),
    );
  }

  static async remove(
    api: Pick<AuthenticatedWebApiClient, 'requestJson'>,
  ): Promise<void> {
    await api.requestJson('/v1/vault/nightscout/remove', {
      method: 'POST',
      body: {version: 1},
    });
  }

  async readEntries(
    startMs: number,
    endMs: number,
    signal?: AbortSignal,
  ): Promise<BrowserNightscoutRange<BrowserNightscoutEntry>> {
    return this.readRange(
      'entries',
      startMs,
      endMs,
      decodeBrowserNightscoutEntry,
      signal,
    );
  }

  async readTreatments(
    startMs: number,
    endMs: number,
    signal?: AbortSignal,
  ): Promise<BrowserNightscoutRange<BrowserNightscoutTreatment>> {
    const result = await this.readRange(
      'treatments',
      startMs,
      endMs,
      decodeBrowserNightscoutTreatment,
      signal,
    );
    const seen = new Set<string>();
    return {
      ...result,
      records: result.records.filter(record => {
        const id = record._id ?? record.identifier;
        if (id === undefined) {
          return true;
        }
        if (seen.has(id)) {
          return false;
        }
        seen.add(id);
        return true;
      }),
    };
  }

  async readDeviceStatuses(
    startMs: number,
    endMs: number,
    signal?: AbortSignal,
  ): Promise<BrowserNightscoutRange<BrowserNightscoutDeviceStatus>> {
    if (endMs - startMs > 2 * 60 * 60 * 1_000) {
      throw new Error('Nightscout device-status range exceeds two hours.');
    }
    return this.readRange(
      'devicestatus',
      startMs,
      endMs,
      decodeBrowserNightscoutDeviceStatus,
      signal,
    );
  }

  /**
   * Reads a selected-day IOB/COB series while preserving the server's
   * existing two-hour request bound.
   */
  async readDeviceStatusesForRange(
    startMs: number,
    endMs: number,
    signal?: AbortSignal,
  ): Promise<BrowserNightscoutRange<BrowserNightscoutDeviceStatus>> {
    if (
      !Number.isSafeInteger(startMs) ||
      !Number.isSafeInteger(endMs) ||
      startMs >= endMs ||
      endMs - startMs > MAX_DEVICE_STATUS_SERIES_MS
    ) {
      throw new Error('Nightscout device-status series range is invalid.');
    }
    const requests: Promise<
      BrowserNightscoutRange<BrowserNightscoutDeviceStatus>
    >[] = [];
    let chunkStartMs = startMs;
    while (chunkStartMs < endMs) {
      const chunkEndMs = Math.min(chunkStartMs + DEVICE_STATUS_CHUNK_MS, endMs);
      requests.push(this.readDeviceStatuses(chunkStartMs, chunkEndMs, signal));
      if (chunkEndMs === endMs) {
        break;
      }
      chunkStartMs = chunkEndMs;
    }
    const results = await Promise.allSettled(requests);
    if (signal?.aborted) {
      const aborted = new Error('The Nightscout request was cancelled.');
      aborted.name = 'AbortError';
      throw aborted;
    }
    const chunks = results.flatMap(result =>
      result.status === 'fulfilled' ? [result.value] : [],
    );
    if (chunks.length === 0) {
      throw new Error('Nightscout device-status data is unavailable.');
    }
    const records = new Map<string, BrowserNightscoutDeviceStatus>();
    chunks.forEach(chunk => {
      chunk.records.forEach(record => {
        const key =
          record._id ??
          [
            record.createdAtMs,
            record.iobUnits ?? '',
            record.bolusIobUnits ?? '',
            record.basalIobUnits ?? '',
            record.cobGrams ?? '',
          ].join(':');
        records.set(key, record);
      });
    });
    const stale =
      chunks.length !== results.length ||
      chunks.some(chunk => chunk.freshness.kind === 'stale');
    const fetchedAtMs = Math.min(
      ...chunks.map(chunk => chunk.freshness.fetchedAtMs),
    );
    return {
      records: [...records.values()].sort(
        (left, right) => left.createdAtMs - right.createdAtMs,
      ),
      freshness: stale
        ? {kind: 'stale', fetchedAtMs}
        : {kind: 'fresh', fetchedAtMs},
    };
  }

  /** Returns a privacy-minimized basal schedule; all other profile fields drop. */
  async readBasalProfile(
    asOfMs: number,
    signal?: AbortSignal,
  ): Promise<BrowserNightscoutRange<BrowserNightscoutBasalProfile>> {
    if (!Number.isSafeInteger(asOfMs) || asOfMs <= 0) {
      throw new Error('Nightscout profile time is invalid.');
    }
    return this.readRange(
      'profile',
      asOfMs,
      asOfMs + 1,
      decodeBrowserNightscoutBasalProfile,
      signal,
    );
  }

  private async readRange<T>(
    resource: BrowserNightscoutResource,
    startMs: number,
    endMs: number,
    decode: (value: unknown) => T | null,
    signal?: AbortSignal,
  ): Promise<BrowserNightscoutRange<T>> {
    if (
      !Number.isSafeInteger(startMs) ||
      !Number.isSafeInteger(endMs) ||
      startMs >= endMs
    ) {
      throw new Error('Nightscout range is invalid.');
    }
    const key = cacheKey(
      this.options.workspaceId,
      this.options.sourceId,
      resource,
      startMs,
      endMs,
    );
    try {
      const value = responseData(
        await this.options.api.requestJson('/v1/nightscout/range', {
          method: 'POST',
          body: {
            version: 1,
            kind: resource,
            sourceId: this.options.sourceId,
            workspaceId: this.options.workspaceId,
            startMs,
            endMs,
          },
          ...(signal === undefined ? {} : {signal}),
        }),
      );
      if (!Array.isArray(value)) {
        throw new Error('Nightscout range is invalid.');
      }
      if (resource === 'entries' && value.length >= ENTRIES_RANGE_LIMIT) {
        throw new Error('Nightscout returned an incomplete glucose range.');
      }
      const records = value.map(decode).filter((row): row is T => row !== null);
      const fetchedAtMs = this.now();
      await this.storeCache(key, {
        schemaVersion: 2,
        sourceId: this.options.sourceId,
        workspaceId: this.options.workspaceId,
        resource,
        startMs,
        endMs,
        fetchedAtMs,
        lastAccessedAtMs: fetchedAtMs,
        data: records,
      });
      return {
        records,
        freshness: {kind: 'fresh', fetchedAtMs},
        ...(resource === 'entries' ? {complete: true} : {}),
      };
    } catch (error) {
      if (signal?.aborted) {
        const aborted = new Error('The Nightscout request was cancelled.');
        aborted.name = 'AbortError';
        throw aborted;
      }
      if (
        error instanceof WebApiError &&
        error.status === 409 &&
        error.code === 'nightscout_identity_mismatch'
      ) {
        if (!this.rebootstrapRequested) {
          this.rebootstrapRequested = true;
          this.options.onRebootstrapRequired?.();
        }
        throw error;
      }
      const cached = decodeStoredRange(await this.options.storage.getItem(key));
      if (
        cached === null ||
        cached.sourceId !== this.options.sourceId ||
        cached.workspaceId !== this.options.workspaceId ||
        cached.resource !== resource ||
        cached.endMs < this.now() - RETENTION_MS ||
        !Array.isArray(cached.data)
      ) {
        throw error;
      }
      const records = cached.data
        .map(decode)
        .filter((row): row is T => row !== null);
      await this.options.storage.setItem(
        key,
        JSON.stringify({...cached, lastAccessedAtMs: this.now()}),
      );
      return {
        records,
        freshness: {kind: 'stale', fetchedAtMs: cached.fetchedAtMs},
        ...(resource === 'entries' ? {complete: false} : {}),
      };
    }
  }

  private async storeCache(key: string, value: StoredRange): Promise<void> {
    const operation = cacheTail.then(async () => {
      const serialized = JSON.stringify(value);
      if (new Blob([serialized]).size > MAX_CACHE_BYTES) {
        return;
      }
      const keys = (await this.options.storage.getAllKeys()).filter(candidate =>
        candidate.startsWith(CACHE_PREFIX),
      );
      const rows = await Promise.all(
        keys
          .filter(candidate => candidate !== key)
          .map(async candidate => ({
            key: candidate,
            raw: await this.options.storage.getItem(candidate),
          })),
      );
      const nowMs = this.now();
      const candidates = rows.flatMap(row => {
        const decoded = decodeStoredRange(row.raw);
        if (
          decoded === null ||
          decoded.endMs < nowMs - RETENTION_MS ||
          row.raw === null
        ) {
          return [];
        }
        return [{...row, decoded, bytes: new Blob([row.raw]).size}];
      });
      let total =
        new Blob([serialized]).size +
        candidates.reduce((sum, row) => sum + row.bytes, 0);
      const evict = [...candidates].sort(
        (left, right) =>
          left.decoded.lastAccessedAtMs - right.decoded.lastAccessedAtMs,
      );
      const removals = rows
        .filter(row => !candidates.some(candidate => candidate.key === row.key))
        .map(row => row.key);
      while (total > MAX_CACHE_BYTES && evict.length > 0) {
        const row = evict.shift()!;
        total -= row.bytes;
        removals.push(row.key);
      }
      await Promise.all(
        removals.map(candidate => this.options.storage.removeItem(candidate)),
      );
      await this.options.storage.setItem(key, serialized);
    });
    cacheTail = operation.catch(() => undefined);
    await operation;
  }
}
