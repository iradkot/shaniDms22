import type {
  PreMealAssistanceDataSource,
  PreMealAssistanceSettings,
  PreMealTrend,
} from '../../../modules/preMealAssistance';
import type {JournalWorkspaceScope} from '../../../modules/journal';
import type {BrowserNightscoutClient} from '../nightscout';
import type {IndexedDbKeyValueStore} from '../storage';

const INTENT_DURATION_MS = 90 * 60 * 1_000;
const MAX_FUTURE_CLOCK_SKEW_MS = 5 * 60 * 1_000;

export interface BrowserPreMealIntent {
  readonly startedAtMs: number;
  readonly expiresAtMs: number;
}

export interface BrowserPreMealAssistanceSnapshot {
  readonly settings: PreMealAssistanceSettings;
  readonly intent?: BrowserPreMealIntent;
}

type BrowserPreMealReader = Pick<BrowserNightscoutClient, 'readEntries'> &
  Partial<Pick<BrowserNightscoutClient, 'readDeviceStatuses'>>;

const DEFAULT_SETTINGS: PreMealAssistanceSettings = {
  enabled: false,
  notificationsEnabled: false,
};

const NIGHTSCOUT_TRENDS: Readonly<Record<string, PreMealTrend>> = {
  DoubleUp: 'double-up',
  SingleUp: 'up',
  FortyFiveUp: 'forty-five-up',
  Flat: 'flat',
  FortyFiveDown: 'forty-five-down',
  SingleDown: 'down',
  DoubleDown: 'double-down',
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const safePart = (value: string, label: string): string => {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(normalized)
  ) {
    throw new Error(`${label} is invalid.`);
  }
  return normalized;
};

const storageKey = (scope: JournalWorkspaceScope): string =>
  `shani.web.pre-meal-assistance.v1:${safePart(
    scope.productUserId,
    'Product User ID',
  )}:${safePart(scope.workspaceId, 'Workspace ID')}`;

const decodeSettings = (value: unknown): PreMealAssistanceSettings =>
  isRecord(value) &&
  typeof value.enabled === 'boolean' &&
  typeof value.notificationsEnabled === 'boolean'
    ? {
        enabled: value.enabled,
        notificationsEnabled: value.notificationsEnabled,
      }
    : DEFAULT_SETTINGS;

const decodeIntent = (
  value: unknown,
  nowMs: number,
): BrowserPreMealIntent | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const startedAtMs = value.startedAtMs;
  const expiresAtMs = value.expiresAtMs;
  return Number.isSafeInteger(startedAtMs) &&
    Number.isSafeInteger(expiresAtMs) &&
    (startedAtMs as number) <= nowMs + MAX_FUTURE_CLOCK_SKEW_MS &&
    (expiresAtMs as number) > nowMs &&
    (expiresAtMs as number) > (startedAtMs as number) &&
    (expiresAtMs as number) - (startedAtMs as number) <= INTENT_DURATION_MS
    ? {
        startedAtMs: startedAtMs as number,
        expiresAtMs: expiresAtMs as number,
      }
    : undefined;
};

const decodeSnapshot = (
  raw: string | null,
  nowMs: number,
): BrowserPreMealAssistanceSnapshot => {
  if (raw === null) {
    return {settings: DEFAULT_SETTINGS};
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.schemaVersion !== 1) {
      return {settings: DEFAULT_SETTINGS};
    }
    const intent = decodeIntent(value.intent, nowMs);
    return {
      settings: decodeSettings(value.settings),
      ...(intent === undefined ? {} : {intent}),
    };
  } catch {
    return {settings: DEFAULT_SETTINGS};
  }
};

const encodeSnapshot = (snapshot: BrowserPreMealAssistanceSnapshot): string =>
  JSON.stringify({schemaVersion: 1, ...snapshot});

const activeIntent = (
  intent: BrowserPreMealIntent | undefined,
  nowMs: number,
): BrowserPreMealIntent | undefined =>
  intent !== undefined &&
  intent.startedAtMs <= nowMs &&
  intent.expiresAtMs > nowMs
    ? intent
    : undefined;

/** Durable, Workspace-scoped browser state plus factual Nightscout context. */
export class BrowserPreMealAssistanceController {
  private snapshot: BrowserPreMealAssistanceSnapshot = {
    settings: DEFAULT_SETTINGS,
  };
  private readonly listeners = new Set<() => void>();
  private writeTail: Promise<void> = Promise.resolve();
  private readonly key: string;

  readonly dataSource: PreMealAssistanceDataSource = {
    loadContext: async ({nowMs}) => {
      const intent = activeIntent(this.snapshot.intent, nowMs);
      const relevance =
        intent === undefined
          ? ({kind: 'inactive'} as const)
          : ({kind: 'active', ...intent} as const);
      if (this.input.client === undefined) {
        return {relevance, sourceState: {kind: 'offline'} as const};
      }
      try {
        const [result, deviceStatuses] = await Promise.all([
          this.input.client.readEntries(
            nowMs - 2 * 60 * 60 * 1_000,
            nowMs + 1,
          ),
          this.input.client.readDeviceStatuses === undefined
            ? Promise.resolve(undefined)
            : this.input.client
                .readDeviceStatuses(nowMs - 2 * 60 * 60 * 1_000, nowMs)
                .catch(() => undefined),
        ]);
        const latest = [...result.records]
          .filter(record => record.date <= nowMs)
          .sort((left, right) => right.date - left.date)[0];
        const latestDeviceStatus = deviceStatuses?.records
          .filter(record => record.createdAtMs <= nowMs)
          .sort((left, right) => right.createdAtMs - left.createdAtMs)[0];
        const observedAtMs =
          latest === undefined
            ? latestDeviceStatus?.createdAtMs
            : latestDeviceStatus === undefined
              ? latest.date
              : Math.min(latest.date, latestDeviceStatus.createdAtMs);
        const trend =
          latest?.direction === undefined
            ? undefined
            : NIGHTSCOUT_TRENDS[latest.direction];
        const facts =
          observedAtMs === undefined
            ? undefined
            : {
                observedAtMs,
                ...(latest === undefined ? {} : {glucoseMgDl: latest.sgv}),
                ...(trend === undefined ? {} : {trend}),
                ...(latestDeviceStatus?.iobUnits === undefined
                  ? {}
                  : {iobUnits: latestDeviceStatus.iobUnits}),
                ...(latestDeviceStatus?.cobGrams === undefined
                  ? {}
                  : {cobGrams: latestDeviceStatus.cobGrams}),
              };
        return {
          relevance,
          sourceState:
            result.freshness.kind === 'fresh' &&
            (latestDeviceStatus === undefined ||
              deviceStatuses?.freshness.kind === 'fresh')
              ? ({kind: 'live'} as const)
              : ({kind: 'offline'} as const),
          ...(facts === undefined ? {} : {facts}),
        };
      } catch {
        return {relevance, sourceState: {kind: 'offline'} as const};
      }
    },
  };

  constructor(
    private readonly input: {
      readonly storage: Pick<IndexedDbKeyValueStore, 'getItem' | 'setItem'>;
      readonly scope: JournalWorkspaceScope;
      readonly client?: BrowserPreMealReader;
      readonly now?: () => number;
    },
  ) {
    this.key = storageKey(input.scope);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): BrowserPreMealAssistanceSnapshot => this.snapshot;

  private publish(next: BrowserPreMealAssistanceSnapshot): void {
    this.snapshot = next;
    this.listeners.forEach(listener => listener());
  }

  private persist(next: BrowserPreMealAssistanceSnapshot): Promise<void> {
    const write = this.writeTail.then(() =>
      this.input.storage.setItem(this.key, encodeSnapshot(next)),
    );
    this.writeTail = write.catch(() => undefined);
    return write;
  }

  async initialize(): Promise<void> {
    const nowMs = this.input.now?.() ?? Date.now();
    const loaded = decodeSnapshot(
      await this.input.storage.getItem(this.key),
      nowMs,
    );
    this.publish(loaded);
    await this.persist(loaded);
  }

  async setSettings(settings: PreMealAssistanceSettings): Promise<void> {
    if (
      typeof settings.enabled !== 'boolean' ||
      typeof settings.notificationsEnabled !== 'boolean'
    ) {
      throw new Error('Pre-meal assistance settings are invalid.');
    }
    const next = {...this.snapshot, settings: {...settings}};
    await this.persist(next);
    this.publish(next);
  }

  async startIntent(nowMs = this.input.now?.() ?? Date.now()): Promise<void> {
    if (!Number.isSafeInteger(nowMs) || nowMs <= 0) {
      throw new Error('Pre-meal intent time is invalid.');
    }
    const next = {
      ...this.snapshot,
      intent: {
        startedAtMs: nowMs,
        expiresAtMs: nowMs + INTENT_DURATION_MS,
      },
    };
    await this.persist(next);
    this.publish(next);
  }

  async clearIntent(): Promise<void> {
    const next = {settings: this.snapshot.settings};
    await this.persist(next);
    this.publish(next);
  }
}

export const createBrowserPreMealAssistanceController = (input: {
  readonly storage: Pick<IndexedDbKeyValueStore, 'getItem' | 'setItem'>;
  readonly scope: JournalWorkspaceScope;
  readonly client?: BrowserPreMealReader;
  readonly now?: () => number;
}): BrowserPreMealAssistanceController =>
  new BrowserPreMealAssistanceController(input);
