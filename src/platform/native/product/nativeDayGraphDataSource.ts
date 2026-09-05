import {
  fetchBgDataForDateRangeWithMetadata,
  fetchDeviceStatusForDateRangeWithMetadata,
  fetchTreatmentsForDateRangeWithMetadata,
  getUserProfileFromNightscout,
  type NightscoutRangeFreshness,
  type NightscoutRangeResult,
} from '../../../api/apiRequests';
import type {
  DayGraphActiveLoadSample,
  DayGraphBasalScheduleEntry,
  DayGraphDataSource,
  DayGraphInsulinEvent,
  DayGraphPeriod,
  DayGraphTimelineItem,
} from '../../../modules/dayGraph';
import type {DeviceStatusEntry} from '../../../types/deviceStatus.types';
import type {BasalProfile} from '../../../types/insulin.types';
import {isE2E} from '../../../utils/e2e';
import {makeE2EBgSamplesForRange} from '../../../utils/e2eFixtures';
import {
  extractLoad,
  getDeviceStatusTimestampMs,
} from '../../../utils/mergeDeviceStatusIntoBgSamples.utils';
import {
  extractBasalProfileFromNightscoutProfileData,
  mapNightscoutTreatmentsToInsulinDataEntries,
} from '../../../utils/nightscoutTreatments.utils';

const TREATMENT_LOOKBACK_MS = 24 * 60 * 60 * 1000;

interface NativeDayGraphGlucoseRecord {
  readonly _id?: string;
  readonly date: number;
  readonly sgv: number;
  readonly direction?: string;
  readonly device?: string;
}

interface NativeDayGraphMealSnapshot {
  readonly id: string;
  readonly mealStart: number;
  readonly name?: string;
  readonly mealCarbohydrates?: {readonly grams: number};
}

interface NativeDayGraphActivitySnapshot {
  readonly id: string;
  readonly category: string;
  readonly customName?: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly intensity?: string;
}

interface NativeDayGraphJournalReader {
  readonly scope?: {readonly nightscoutSourceId?: string};
  readonly meals: {
    readonly getListSnapshot: (query: {
      readonly timeRange: {
        readonly fromInclusive: number;
        readonly toExclusive: number;
      };
    }) => {readonly items: readonly NativeDayGraphMealSnapshot[]};
  };
  readonly activities: {
    readonly getListSnapshot: (query: {
      readonly timeRange: {
        readonly fromInclusive: number;
        readonly toExclusive: number;
      };
    }) => {readonly items: readonly NativeDayGraphActivitySnapshot[]};
  };
}

export interface NativeDayGraphDataSourceDependencies {
  readonly nightscoutSourceId?: string;
  readonly fetchGlucoseRecords?: (
    start: Date,
    end: Date,
  ) => Promise<readonly NativeDayGraphGlucoseRecord[]>;
  readonly fetchGlucoseRange?: (
    start: Date,
    end: Date,
  ) => Promise<NightscoutRangeResult<NativeDayGraphGlucoseRecord>>;
  readonly fetchTreatmentRecords?: (
    start: Date,
    end: Date,
  ) => Promise<readonly unknown[]>;
  readonly fetchTreatmentRange?: (
    start: Date,
    end: Date,
  ) => Promise<NightscoutRangeResult<Record<string, unknown>>>;
  readonly fetchDeviceStatusRecords?: (
    start: Date,
    end: Date,
  ) => Promise<readonly DeviceStatusEntry[]>;
  readonly fetchDeviceStatusRange?: (
    start: Date,
    end: Date,
  ) => Promise<NightscoutRangeResult<DeviceStatusEntry>>;
  readonly fetchProfile?: (asOfIso: string) => Promise<unknown>;
  readonly extractBasalProfile?: (profilePayload: unknown) => BasalProfile;
  readonly fixtureGlucoseRecords?: (
    start: Date,
    end: Date,
  ) => readonly NativeDayGraphGlucoseRecord[];
  readonly journal?: NativeDayGraphJournalReader;
  readonly locale?: 'en' | 'he';
  readonly loadTimelineItems?: NativeDayGraphTimelineLoader;
  readonly now?: () => number;
  readonly useE2EFixtures?: boolean;
}

export type NativeDayGraphTimelineLoader = (
  period: DayGraphPeriod,
) => Promise<readonly DayGraphTimelineItem[]>;

const DEFAULT_SOURCE_ID = 'nightscout-active';

const assertOpaqueSourceId = (sourceId: string): void => {
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(sourceId)) {
    throw new Error('Day Graph requires an opaque Nightscout source identity.');
  }
};

const resolveSourceId = (
  dependencies: NativeDayGraphDataSourceDependencies,
): string => {
  const sourceId =
    dependencies.nightscoutSourceId ??
    dependencies.journal?.scope?.nightscoutSourceId ??
    DEFAULT_SOURCE_ID;
  assertOpaqueSourceId(sourceId);
  return sourceId;
};

const finiteNumber = (value: unknown): number | undefined => {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim().length > 0
      ? Number(value)
      : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
};

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;

const timestamp = (value: Record<string, unknown>): number | undefined => {
  const numeric = finiteNumber(value.date);
  if (numeric !== undefined) {
    return numeric;
  }
  for (const candidate of [value.created_at, value.timestamp]) {
    if (typeof candidate === 'string') {
      const parsed = Date.parse(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
};

const recordId = (
  value: Record<string, unknown>,
  fallbackKind: string,
  timestampMs: number,
  index: number,
): string =>
  text(value._id) ??
  text(value.id) ??
  `unidentified-${fallbackKind}:${timestampMs}:${index}`;

const activityTitle = (
  activity: NativeDayGraphActivitySnapshot,
  locale: 'en' | 'he',
): string => {
  if (activity.customName?.trim()) {
    return activity.customName.trim();
  }
  const labels: Readonly<
    Record<string, {readonly en: string; readonly he: string}>
  > = {
    walking: {en: 'Walking', he: 'הליכה'},
    running: {en: 'Running', he: 'ריצה'},
    cycling: {en: 'Cycling', he: 'רכיבה'},
    strength: {en: 'Strength', he: 'אימון כוח'},
    swimming: {en: 'Swimming', he: 'שחייה'},
    sport: {en: 'Sport', he: 'ספורט'},
    other: {en: 'Activity', he: 'פעילות'},
  };
  return (
    labels[activity.category]?.[locale] ??
    (locale === 'he' ? 'פעילות' : 'Activity')
  );
};

const journalItems = (
  journal: NativeDayGraphJournalReader | undefined,
  period: {readonly dayStartMs: number; readonly dayEndMs: number},
  locale: 'en' | 'he',
): readonly DayGraphTimelineItem[] => {
  if (!journal) {
    return [];
  }
  const query = {
    timeRange: {
      fromInclusive: period.dayStartMs,
      toExclusive: period.dayEndMs,
    },
  } as const;
  const meals: DayGraphTimelineItem[] = journal.meals
    .getListSnapshot(query)
    .items.map(meal => ({
      kind: 'journal-meal',
      identity: {sourceId: 'journal', recordId: String(meal.id)},
      sourceLabel: 'Journal',
      timestampMs: meal.mealStart,
      title: meal.name?.trim() || (locale === 'he' ? 'ארוחה' : 'Meal'),
      ...(meal.mealCarbohydrates === undefined
        ? {}
        : {carbohydratesGrams: meal.mealCarbohydrates.grams}),
    }));
  const activities: DayGraphTimelineItem[] = journal.activities
    .getListSnapshot(query)
    .items.map(activity => ({
      kind: 'journal-activity',
      identity: {sourceId: 'journal', recordId: String(activity.id)},
      sourceLabel: 'Journal',
      timestampMs: activity.startedAt,
      title: activityTitle(activity, locale),
      ...(activity.intensity === undefined
        ? {}
        : {detail: activity.intensity.replace(/_/g, ' ')}),
      ...(activity.endedAt === undefined
        ? {}
        : {endTimestampMs: activity.endedAt}),
    }));
  return [...meals, ...activities];
};

const treatmentItems = (
  values: readonly unknown[],
  sourceId: string,
  locale: 'en' | 'he',
): readonly DayGraphTimelineItem[] => {
  const items: DayGraphTimelineItem[] = [];
  values.forEach((value: unknown, index: number) => {
    const item = record(value);
    if (!item) {
      return;
    }
    const timestampMs = timestamp(item);
    if (timestampMs === undefined) {
      return;
    }
    const identity = {
      sourceId,
      recordId: recordId(item, 'treatment', timestampMs, index),
    };
    const carbohydratesGrams = finiteNumber(item.carbs);
    if (carbohydratesGrams !== undefined && carbohydratesGrams > 0) {
      items.push({
        kind: 'external-carb',
        identity,
        sourceLabel: 'Nightscout',
        timestampMs,
        title:
          text(item.eventType) ??
          (locale === 'he' ? 'פחמימות חיצוניות' : 'External carbohydrates'),
        carbohydratesGrams,
      });
      return;
    }
    const insulinUnits =
      finiteNumber(item.insulin) ?? finiteNumber(item.amount);
    const eventType = text(item.eventType);
    if (insulinUnits === undefined && eventType === undefined) {
      return;
    }
    items.push({
      kind: 'treatment',
      identity,
      sourceLabel: 'Nightscout',
      timestampMs,
      title: eventType ?? (locale === 'he' ? 'טיפול' : 'Treatment'),
      ...(insulinUnits === undefined ? {} : {detail: `${insulinUnits} U`}),
    });
  });
  return items;
};

const activeLoadSamples = (
  values: readonly DeviceStatusEntry[],
): readonly DayGraphActiveLoadSample[] =>
  values.flatMap(value => {
    const timestampMs = getDeviceStatusTimestampMs(value);
    if (timestampMs === undefined) {
      return [];
    }
    const load = extractLoad(value);
    if (
      load.iob === undefined &&
      load.iobBolus === undefined &&
      load.iobBasal === undefined &&
      load.cob === undefined
    ) {
      return [];
    }
    return [
      {
        timestampMs,
        ...(load.iob === undefined ? {} : {iobUnits: load.iob}),
        ...(load.iobBolus === undefined ? {} : {bolusIobUnits: load.iobBolus}),
        ...(load.iobBasal === undefined ? {} : {basalIobUnits: load.iobBasal}),
        ...(load.cob === undefined ? {} : {cobGrams: load.cob}),
      },
    ];
  });

const insulinEvents = (
  values: readonly unknown[],
): readonly DayGraphInsulinEvent[] => {
  const result: DayGraphInsulinEvent[] = [];
  mapNightscoutTreatmentsToInsulinDataEntries([...values]).forEach(entry => {
    if (entry.type === 'bolus') {
      const timestampMs = Date.parse(entry.timestamp ?? '');
      if (entry.amount !== undefined && Number.isFinite(timestampMs)) {
        result.push({kind: 'bolus', timestampMs, units: entry.amount});
      }
      return;
    }
    const startMs = Date.parse(entry.startTime ?? entry.timestamp ?? '');
    if (!Number.isFinite(startMs)) {
      return;
    }
    const explicitEndMs = Date.parse(entry.endTime ?? '');
    const durationEndMs =
      entry.duration === undefined
        ? Number.NaN
        : startMs + entry.duration * 60 * 1000;
    const endMs = Number.isFinite(explicitEndMs)
      ? explicitEndMs
      : durationEndMs;
    if (entry.type === 'tempBasal') {
      if (entry.rate !== undefined && Number.isFinite(endMs)) {
        result.push({
          kind: 'temp-basal',
          startMs,
          endMs,
          rateUnitsPerHour: entry.rate,
        });
      }
      return;
    }
    result.push({
      kind: 'suspend',
      startMs,
      ...(Number.isFinite(endMs) ? {endMs} : {}),
    });
  });
  return result;
};

const basalSchedule = (
  profile: BasalProfile,
): readonly DayGraphBasalScheduleEntry[] =>
  profile.flatMap(entry => {
    const parsedTime = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(entry.time);
    const secondsFromMidnight =
      entry.timeAsSeconds ??
      (parsedTime
        ? Number(parsedTime[1]) * 60 * 60 + Number(parsedTime[2]) * 60
        : Number.NaN);
    return Number.isFinite(secondsFromMidnight) && Number.isFinite(entry.value)
      ? [{secondsFromMidnight, rateUnitsPerHour: entry.value}]
      : [];
  });

export const createNativeDayGraphTimelineLoader = (
  dependencies: NativeDayGraphDataSourceDependencies = {},
): NativeDayGraphTimelineLoader => {
  const sourceId = resolveSourceId(dependencies);
  const useE2EFixtures = dependencies.useE2EFixtures ?? isE2E;
  const locale = dependencies.locale ?? 'en';

  return async period => {
    let treatments: readonly unknown[] = [];
    if (!useE2EFixtures) {
      const start = new Date(period.dayStartMs);
      const end = new Date(period.dayEndMs);
      treatments = dependencies.fetchTreatmentRange
        ? (await dependencies.fetchTreatmentRange(start, end)).records
        : dependencies.fetchTreatmentRecords
        ? await dependencies.fetchTreatmentRecords(start, end)
        : (await fetchTreatmentsForDateRangeWithMetadata(start, end)).records;
    }
    return [
      ...treatmentItems(treatments, sourceId, locale),
      ...journalItems(dependencies.journal, period, locale),
    ];
  };
};

/** Native read-only projection over Nightscout plus the local-first Journal. */
export const createNativeDayGraphDataSource = (
  dependencies: NativeDayGraphDataSourceDependencies = {},
): DayGraphDataSource => {
  const sourceId = resolveSourceId(dependencies);
  const fixtureGlucoseRecords =
    dependencies.fixtureGlucoseRecords ?? makeE2EBgSamplesForRange;
  const useE2EFixtures = dependencies.useE2EFixtures ?? isE2E;
  const now = dependencies.now ?? Date.now;
  const locale = dependencies.locale ?? 'en';
  const hasInjectedCoreLoader =
    dependencies.fetchGlucoseRecords !== undefined ||
    dependencies.fetchGlucoseRange !== undefined ||
    dependencies.fetchTreatmentRecords !== undefined ||
    dependencies.fetchTreatmentRange !== undefined ||
    dependencies.loadTimelineItems !== undefined;

  const fresh = <T>(records: readonly T[]): NightscoutRangeResult<T> => ({
    records,
    freshness: {kind: 'fresh', fetchedAtMs: now()},
  });

  const loadGlucoseRange = async (
    start: Date,
    end: Date,
  ): Promise<NightscoutRangeResult<NativeDayGraphGlucoseRecord>> => {
    if (useE2EFixtures) {
      return fresh<NativeDayGraphGlucoseRecord>(
        fixtureGlucoseRecords(start, end),
      );
    }
    if (dependencies.fetchGlucoseRange) {
      return dependencies.fetchGlucoseRange(start, end);
    }
    if (dependencies.fetchGlucoseRecords) {
      return fresh(await dependencies.fetchGlucoseRecords(start, end));
    }
    return fetchBgDataForDateRangeWithMetadata(start, end);
  };

  const incompleteReason =
    locale === 'he'
      ? 'חלק מנתוני Nightscout אינם עדכניים או אינם זמינים כרגע.'
      : 'Some Nightscout data is out of date or currently unavailable.';

  const loadTimelineRange = async (
    period: DayGraphPeriod,
  ): Promise<{
    readonly items: readonly DayGraphTimelineItem[];
    readonly treatments: readonly unknown[];
    readonly freshness: NightscoutRangeFreshness;
  }> => {
    if (dependencies.loadTimelineItems) {
      return {
        items: await dependencies.loadTimelineItems(period),
        treatments: [],
        freshness: {kind: 'fresh', fetchedAtMs: now()},
      };
    }
    if (useE2EFixtures) {
      return {
        items: journalItems(dependencies.journal, period, locale),
        treatments: [],
        freshness: {kind: 'fresh', fetchedAtMs: now()},
      };
    }
    const start = new Date(period.dayStartMs - TREATMENT_LOOKBACK_MS);
    const end = new Date(period.dayEndMs);
    try {
      const treatmentRange = dependencies.fetchTreatmentRange
        ? await dependencies.fetchTreatmentRange(start, end)
        : dependencies.fetchTreatmentRecords
        ? fresh(await dependencies.fetchTreatmentRecords(start, end))
        : await fetchTreatmentsForDateRangeWithMetadata(start, end);
      return {
        items: [
          ...treatmentItems(treatmentRange.records, sourceId, locale),
          ...journalItems(dependencies.journal, period, locale),
        ].filter(
          item =>
            item.timestampMs >= period.dayStartMs &&
            item.timestampMs < period.dayEndMs,
        ),
        treatments: treatmentRange.records,
        freshness: treatmentRange.freshness,
      };
    } catch (error) {
      console.warn(
        'createNativeDayGraphDataSource: Treatments unavailable; timeline is incomplete',
        error,
      );
      return {
        items: journalItems(dependencies.journal, period, locale),
        treatments: [],
        freshness: {
          kind: 'stale',
          fetchedAtMs: now(),
          reason: 'network-unavailable',
        },
      };
    }
  };

  const loadDeviceStatuses = async (
    start: Date,
    end: Date,
  ): Promise<readonly DeviceStatusEntry[]> => {
    if (dependencies.fetchDeviceStatusRange) {
      return (await dependencies.fetchDeviceStatusRange(start, end)).records;
    }
    if (dependencies.fetchDeviceStatusRecords) {
      return dependencies.fetchDeviceStatusRecords(start, end);
    }
    if (useE2EFixtures || hasInjectedCoreLoader) {
      return [];
    }
    try {
      return (await fetchDeviceStatusForDateRangeWithMetadata(start, end))
        .records;
    } catch {
      return [];
    }
  };

  const loadBasalSchedule = async (
    asOfIso: string,
  ): Promise<readonly DayGraphBasalScheduleEntry[]> => {
    if (useE2EFixtures) {
      return [];
    }
    if (hasInjectedCoreLoader && dependencies.fetchProfile === undefined) {
      return [];
    }
    const fetchProfile =
      dependencies.fetchProfile ?? getUserProfileFromNightscout;
    const extractProfile =
      dependencies.extractBasalProfile ??
      ((payload: unknown) =>
        extractBasalProfileFromNightscoutProfileData(payload as any[]));
    try {
      return basalSchedule(extractProfile(await fetchProfile(asOfIso)));
    } catch {
      return [];
    }
  };

  return {
    async loadDayGraph(period) {
      const start = new Date(period.dayStartMs);
      const end = new Date(period.dayEndMs);
      const [glucoseRange, timelineRange, deviceStatuses, profileSchedule] =
        await Promise.all([
          loadGlucoseRange(start, end),
          loadTimelineRange(period),
          loadDeviceStatuses(start, end),
          loadBasalSchedule(start.toISOString()),
        ]);
      const freshnessInputs = [glucoseRange.freshness, timelineRange.freshness];
      const staleInputs = freshnessInputs.filter(
        (value): value is Extract<NightscoutRangeFreshness, {kind: 'stale'}> =>
          value.kind === 'stale',
      );
      const fetchedAtMs = Math.min(
        ...freshnessInputs.map(value => value.fetchedAtMs),
      );
      return {
        glucoseSamples: glucoseRange.records.map((sample, index) => ({
          identity: {
            sourceId,
            recordId:
              ('_id' in sample && typeof sample._id === 'string'
                ? sample._id.trim()
                : '') ||
              `unidentified-glucose:${sample.date}:${sample.sgv}:${index}`,
          },
          timestampMs: sample.date,
          valueMgDl: sample.sgv,
          ...(sample.direction === undefined
            ? {}
            : {direction: sample.direction}),
          ...(sample.device === undefined ? {} : {device: sample.device}),
        })),
        timelineItems: timelineRange.items,
        activeLoadSamples: activeLoadSamples(deviceStatuses),
        insulinEvents: insulinEvents(timelineRange.treatments),
        basalSchedule: profileSchedule,
        freshness:
          staleInputs.length === 0
            ? {kind: 'fresh', fetchedAtMs}
            : {kind: 'stale', fetchedAtMs, reason: incompleteReason},
      };
    },
  };
};
