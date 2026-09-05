import type {
  DestinationLocale,
  ResolvedDestinationTarget,
} from '../../../product/destinations';
import type {CurrentSnapshotViewModel} from '../../../product/hub';
import type {LatestNightscoutSnapshotState} from './LatestNightscoutSnapshotStateContext';

const STALE_AFTER_MS = 10 * 60 * 1000;

const TREND_LABELS: Readonly<Record<string, string>> = {
  DoubleUp: '↑↑',
  SingleUp: '↑',
  FortyFiveUp: '↗',
  Flat: '→',
  FortyFiveDown: '↘',
  SingleDown: '↓',
  DoubleDown: '↓↓',
};

const COPY = {
  en: {
    empty: 'No glucose reading is available yet.',
    offline: 'Nightscout is offline right now.',
    offlineCached: 'Offline right now. Showing the last reading.',
    stale: 'The latest reading is not up to date.',
    now: 'Now',
    oneMinute: '1 min ago',
    minutes: (count: number) => `${count} min ago`,
    oneHour: '1 hour ago',
    hours: (count: number) => `${count} hours ago`,
  },
  he: {
    empty: 'אין עדיין נתון סוכר זמין.',
    offline: 'אין חיבור ל־Nightscout כרגע.',
    offlineCached: 'אין חיבור כרגע. מוצג הנתון האחרון.',
    stale: 'הנתון האחרון אינו עדכני.',
    now: 'עכשיו',
    oneMinute: 'לפני דקה',
    minutes: (count: number) => `לפני ${count} דק׳`,
    oneHour: 'לפני שעה',
    hours: (count: number) => `לפני ${count} ש׳`,
  },
} as const;

interface ValidSnapshotSample {
  readonly sgv: number;
  readonly date?: number;
  readonly direction?: string;
  readonly iob?: number;
  readonly cob?: number;
  readonly staleLevel?: 'fresh' | 'stale' | 'very-stale';
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const parseSnapshotSample = (
  untrustedSnapshot: unknown,
): ValidSnapshotSample | undefined => {
  if (!isRecord(untrustedSnapshot)) {
    return undefined;
  }
  const enrichedBg = untrustedSnapshot.enrichedBg;
  if (!isRecord(enrichedBg)) {
    return undefined;
  }
  const sgv = finiteNumber(enrichedBg.sgv);
  if (sgv === undefined) {
    return undefined;
  }

  const rawDirection = enrichedBg.direction;
  const direction = typeof rawDirection === 'string' ? rawDirection : undefined;
  const rawStaleLevel = untrustedSnapshot.staleLevel;
  const staleLevel =
    rawStaleLevel === 'fresh' ||
    rawStaleLevel === 'stale' ||
    rawStaleLevel === 'very-stale'
      ? rawStaleLevel
      : undefined;
  const date = finiteNumber(enrichedBg.date);
  const iob = finiteNumber(enrichedBg.iob);
  const cob = finiteNumber(enrichedBg.cob);

  return {
    sgv,
    ...(date === undefined ? {} : {date}),
    ...(direction === undefined ? {} : {direction}),
    ...(iob === undefined ? {} : {iob}),
    ...(cob === undefined ? {} : {cob}),
    ...(staleLevel === undefined ? {} : {staleLevel}),
  };
};

const formatAge = (
  date: number | undefined,
  nowMs: number,
  locale: DestinationLocale,
): string | undefined => {
  if (date === undefined || !Number.isFinite(nowMs)) {
    return undefined;
  }
  const copy = COPY[locale];
  const ageMs = Math.max(0, nowMs - date);
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) {
    return copy.now;
  }
  if (minutes === 1) {
    return copy.oneMinute;
  }
  if (minutes < 60) {
    return copy.minutes(minutes);
  }
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? copy.oneHour : copy.hours(hours);
};

const formatMeasurement = (value: number): string =>
  Number(value.toFixed(2)).toString();

const hasError = (error: unknown): boolean =>
  error !== null && error !== undefined;

export interface CreateCurrentSnapshotViewModelInput {
  readonly locale: DestinationLocale;
  readonly nowMs: number;
  readonly state: LatestNightscoutSnapshotState;
  readonly target: ResolvedDestinationTarget;
}

/** Validates the legacy hook result and turns it into display-only Hub data. */
export const createCurrentSnapshotViewModel = ({
  locale,
  nowMs,
  state,
  target,
}: CreateCurrentSnapshotViewModelInput): CurrentSnapshotViewModel => {
  const sample = parseSnapshotSample(state.snapshot);
  const offline = hasError(state.error);
  const copy = COPY[locale];

  if (sample === undefined) {
    if (offline) {
      return {status: 'offline', target, message: copy.offline};
    }
    if (state.isLoading) {
      return {status: 'loading', target};
    }
    return {status: 'empty', target, message: copy.empty};
  }

  const ageMs =
    sample.date === undefined || !Number.isFinite(nowMs)
      ? undefined
      : Math.max(0, nowMs - sample.date);
  const stale =
    sample.staleLevel === 'stale' ||
    sample.staleLevel === 'very-stale' ||
    (ageMs !== undefined && ageMs >= STALE_AFTER_MS);
  const trendLabel =
    sample.direction === undefined ? undefined : TREND_LABELS[sample.direction];
  const dataAgeLabel = formatAge(sample.date, nowMs, locale);

  return {
    status: offline ? 'offline' : stale ? 'stale' : 'ready',
    target,
    glucoseLabel: `${Math.round(sample.sgv)} mg/dL`,
    ...(trendLabel === undefined ? {} : {trendLabel}),
    ...(dataAgeLabel === undefined ? {} : {dataAgeLabel}),
    ...(sample.iob === undefined
      ? {}
      : {iobLabel: `IOB ${formatMeasurement(sample.iob)} U`}),
    ...(sample.cob === undefined
      ? {}
      : {cobLabel: `COB ${formatMeasurement(sample.cob)} g`}),
    ...(offline
      ? {message: copy.offlineCached}
      : stale
      ? {message: copy.stale}
      : {}),
  };
};
