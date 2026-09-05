import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  PreMealAssistanceDataSource,
  PreMealAssistanceFacts,
  PreMealTrend,
} from '../../../modules/preMealAssistance';
import type {LatestNightscoutSnapshotState} from './LatestNightscoutSnapshotStateContext';

export const PRE_MEAL_INTENT_DURATION_MS = 90 * 60 * 1000;

export interface NativePreMealIntent {
  readonly startedAtMs: number;
  readonly expiresAtMs: number;
}

interface KeyValueStorage {
  readonly getItem: (key: string) => Promise<string | null>;
  readonly setItem: (key: string, value: string) => Promise<void>;
  readonly removeItem: (key: string) => Promise<void>;
}

export interface NativePreMealIntentStore {
  readonly load: (nowMs?: number) => Promise<NativePreMealIntent | undefined>;
  readonly start: (nowMs?: number) => Promise<NativePreMealIntent>;
  readonly clear: () => Promise<void>;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const decodeIntent = (
  raw: unknown,
  nowMs: number,
): NativePreMealIntent | undefined => {
  if (!isRecord(raw)) {
    return undefined;
  }
  const startedAtMs = finiteNumber(raw.startedAtMs);
  const expiresAtMs = finiteNumber(raw.expiresAtMs);
  if (
    startedAtMs === undefined ||
    expiresAtMs === undefined ||
    startedAtMs > nowMs + 5 * 60 * 1000 ||
    expiresAtMs <= nowMs ||
    expiresAtMs <= startedAtMs ||
    expiresAtMs - startedAtMs > PRE_MEAL_INTENT_DURATION_MS
  ) {
    return undefined;
  }
  return {startedAtMs, expiresAtMs};
};

const intentStorageKey = (scopeId: string): string => {
  const safeScope = scopeId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 96);
  if (!safeScope) {
    throw new Error('A non-empty pre-meal intent scope is required.');
  }
  return `product.preMealIntent.v1.${safeScope}`;
};

export const createNativePreMealIntentStore = ({
  scopeId,
  storage = AsyncStorage,
}: {
  readonly scopeId: string;
  readonly storage?: KeyValueStorage;
}): NativePreMealIntentStore => {
  const key = intentStorageKey(scopeId);
  return {
    async load(nowMs = Date.now()) {
      const encoded = await storage.getItem(key);
      if (encoded === null) {
        return undefined;
      }
      let decoded: unknown;
      try {
        decoded = JSON.parse(encoded);
      } catch {
        await storage.removeItem(key);
        return undefined;
      }
      const intent = decodeIntent(decoded, nowMs);
      if (intent === undefined) {
        await storage.removeItem(key);
      }
      return intent;
    },
    async start(nowMs = Date.now()) {
      const intent = {
        startedAtMs: nowMs,
        expiresAtMs: nowMs + PRE_MEAL_INTENT_DURATION_MS,
      };
      await storage.setItem(key, JSON.stringify(intent));
      return intent;
    },
    clear: () => storage.removeItem(key),
  };
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

const boundedNumber = (
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined => {
  const result = finiteNumber(value);
  return result !== undefined && result >= minimum && result <= maximum
    ? result
    : undefined;
};

const parseFacts = (snapshot: unknown): PreMealAssistanceFacts | undefined => {
  if (!isRecord(snapshot) || !isRecord(snapshot.enrichedBg)) {
    return undefined;
  }
  const source = snapshot.enrichedBg;
  const observedAtMs = finiteNumber(source.date);
  if (observedAtMs === undefined || observedAtMs <= 0) {
    return undefined;
  }
  const glucoseMgDl = boundedNumber(source.sgv, 20, 600);
  const direction =
    typeof source.direction === 'string'
      ? NIGHTSCOUT_TRENDS[source.direction]
      : undefined;
  const iobUnits = boundedNumber(source.iob, 0, 100);
  const cobGrams = boundedNumber(source.cob, 0, 1000);
  if (
    glucoseMgDl === undefined &&
    direction === undefined &&
    iobUnits === undefined &&
    cobGrams === undefined
  ) {
    return undefined;
  }
  return {
    observedAtMs,
    ...(glucoseMgDl === undefined ? {} : {glucoseMgDl}),
    ...(direction === undefined ? {} : {trend: direction}),
    ...(iobUnits === undefined ? {} : {iobUnits}),
    ...(cobGrams === undefined ? {} : {cobGrams}),
  };
};

export const createNativePreMealAssistanceDataSource = ({
  intent,
  latestSnapshotState,
}: {
  readonly intent?: NativePreMealIntent;
  readonly latestSnapshotState: LatestNightscoutSnapshotState;
}): PreMealAssistanceDataSource => ({
  async loadContext({nowMs}) {
    const relevance =
      intent !== undefined &&
      intent.startedAtMs <= nowMs &&
      intent.expiresAtMs > nowMs
        ? {kind: 'active' as const, ...intent}
        : {kind: 'inactive' as const};
    const facts = parseFacts(latestSnapshotState.snapshot);
    return {
      relevance,
      sourceState:
        latestSnapshotState.error === null ||
        latestSnapshotState.error === undefined
          ? {kind: 'live' as const}
          : {kind: 'offline' as const},
      ...(facts === undefined ? {} : {facts}),
    };
  },
});
