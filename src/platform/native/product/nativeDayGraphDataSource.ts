import {
  fetchBgDataForDateRangeWithMetadata,
  fetchDeviceStatusForDateRangeWithMetadata,
  fetchTreatmentsForDateRangeWithMetadata,
  getUserProfileFromNightscout,
  type NightscoutRangeResult,
} from '../../../api/apiRequests';
import type {
  DayGraphBasalScheduleEntry,
  DayGraphDataSource,
  DayGraphGlucoseSample,
  DayGraphInsulinEvent,
  DayGraphPeriod,
  DayGraphTimelineItem,
} from '../../../modules/dayGraph';
import type {DeviceStatusEntry} from '../../../types/deviceStatus.types';
import type {
  BasalProfile,
  InsulinDataEntry,
  ProfileDataType,
} from '../../../types/insulin.types';
import {
  getNightscoutBaseUrl,
  getNightscoutConfigurationRevision,
} from '../../../api/shaniNightscoutInstances';
import {
  createGlucoseForecastLoader,
  type ForecastContextEvent,
} from '../../../modules/glucoseForecast';
import {publishAndroidGlucoseForecast} from '../../../services/androidGlucoseLiveSurface';
import {
  createInsulinContextLoader,
  loadInsulinContext,
  type InsulinContext,
  type InsulinContextLoader,
} from '../../../services/insulin/insulinDataSource';
import {isE2E} from '../../../utils/e2e';
import {makeE2EBgSamplesForRange} from '../../../utils/e2eFixtures';
import {loadCalendarGlucoseRange} from '../../nightscout/loadCalendarGlucoseRange';

interface NativeDayGraphGlucoseRecord {
  readonly _id?: string;
  readonly date: number;
  readonly sgv: number;
  readonly direction?: string;
  readonly device?: string;
}

const glucoseSamples = (
  records: readonly NativeDayGraphGlucoseRecord[],
  sourceId: string,
): readonly DayGraphGlucoseSample[] =>
  records.map((sample, index) => ({
    identity: {
      sourceId,
      recordId:
        sample._id?.trim() ||
        `unidentified-glucose:${sample.date}:${sample.sgv}:${index}`,
    },
    timestampMs: sample.date,
    valueMgDl: sample.sgv,
    ...(sample.direction === undefined ? {} : {direction: sample.direction}),
    ...(sample.device === undefined ? {} : {device: sample.device}),
  }));

interface NativeDayGraphMealSnapshot {
  readonly id: string;
  readonly mealStart: number;
  readonly name?: string;
  readonly mealCarbohydrates?: {readonly grams: number};
  readonly createdAt?: number;
  readonly updatedAt?: number;
}

interface NativeDayGraphActivitySnapshot {
  readonly id: string;
  readonly category: string;
  readonly customName?: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly intensity?: string;
  readonly createdAt?: number;
  readonly updatedAt?: number;
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
  readonly loadInsulinContext?: InsulinContextLoader;
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

const forecastRecordedAt = (
  timestampMs: number | undefined,
): {readonly recordedAtMs?: number} =>
  timestampMs === undefined ? {} : {recordedAtMs: timestampMs};

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

const insulinEvents = (
  values: readonly InsulinDataEntry[],
): readonly DayGraphInsulinEvent[] => {
  const result: DayGraphInsulinEvent[] = [];
  values.forEach(entry => {
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

const emptyContext = (now: number): InsulinContext => ({
  treatments: [],
  deviceStatus: [],
  profileData: null,
  insulinData: [],
  basalProfileData: [],
  carbTreatments: [],
  loadSamples: [],
  availability: {
    treatments: 'available',
    deviceStatus: 'available',
    profile: 'available',
  },
  freshness: {kind: 'fresh', fetchedAtMs: now},
});

const resolveInsulinLoader = (
  dependencies: NativeDayGraphDataSourceDependencies,
): InsulinContextLoader => {
  if (dependencies.loadInsulinContext) {return dependencies.loadInsulinContext;}
  if (
    !(
      dependencies.fetchTreatmentRange ||
      dependencies.fetchTreatmentRecords ||
      dependencies.fetchDeviceStatusRange ||
      dependencies.fetchDeviceStatusRecords ||
      dependencies.fetchProfile ||
      dependencies.extractBasalProfile
    )
  )
    {return loadInsulinContext;}
  const now = dependencies.now ?? Date.now;
  const fresh = <T>(records: readonly T[]): NightscoutRangeResult<T> => ({
    records,
    freshness: {kind: 'fresh', fetchedAtMs: now()},
  });
  return createInsulinContextLoader({
    fetchTreatments: async (start, end) =>
      dependencies.fetchTreatmentRange
        ? dependencies.fetchTreatmentRange(start, end)
        : dependencies.fetchTreatmentRecords
        ? fresh(
            (await dependencies.fetchTreatmentRecords(start, end)) as Record<
              string,
              unknown
            >[],
          )
        : fetchTreatmentsForDateRangeWithMetadata(start, end),
    fetchDeviceStatus: async (start, end) =>
      dependencies.fetchDeviceStatusRange
        ? dependencies.fetchDeviceStatusRange(start, end)
        : dependencies.fetchDeviceStatusRecords
        ? fresh(await dependencies.fetchDeviceStatusRecords(start, end))
        : fetchDeviceStatusForDateRangeWithMetadata(start, end),
    fetchProfile: async asOf =>
      (dependencies.fetchProfile
        ? await dependencies.fetchProfile(asOf)
        : await getUserProfileFromNightscout(asOf)) as ProfileDataType,
    ...(dependencies.extractBasalProfile
      ? {extractBasalProfile: dependencies.extractBasalProfile}
      : {}),
    getScopeKey: () => String(getNightscoutConfigurationRevision()),
    now,
  });
};

export const createNativeDayGraphTimelineLoader = (
  dependencies: NativeDayGraphDataSourceDependencies = {},
): NativeDayGraphTimelineLoader => {
  const sourceId = resolveSourceId(dependencies);
  const fixtures = dependencies.useE2EFixtures ?? isE2E;
  const locale = dependencies.locale ?? 'en';
  const loadContext = resolveInsulinLoader(dependencies);
  return async period => {
    const context = fixtures
      ? emptyContext((dependencies.now ?? Date.now)())
      : await loadContext({startMs: period.dayStartMs, endMs: period.dayEndMs});
    return [
      ...treatmentItems(context.treatments, sourceId, locale),
      ...journalItems(dependencies.journal, period, locale),
    ];
  };
};

/** One factual insulin context supplies both the chart and its timeline. */
export const createNativeDayGraphDataSource = (
  dependencies: NativeDayGraphDataSourceDependencies = {},
): DayGraphDataSource => {
  const sourceId = resolveSourceId(dependencies);
  const fixtureGlucoseRecords =
    dependencies.fixtureGlucoseRecords ?? makeE2EBgSamplesForRange;
  const useE2EFixtures = dependencies.useE2EFixtures ?? isE2E;
  const now = dependencies.now ?? Date.now;
  const locale = dependencies.locale ?? 'en';
  const loadContext = resolveInsulinLoader(dependencies);
  const fresh = <T>(records: readonly T[]): NightscoutRangeResult<T> => ({
    records,
    freshness: {kind: 'fresh', fetchedAtMs: now()},
    complete: true,
  });
  const loadGlucoseRange = async (
    start: Date,
    end: Date,
  ): Promise<NightscoutRangeResult<NativeDayGraphGlucoseRecord>> => {
    if (useE2EFixtures)
      {return fresh<NativeDayGraphGlucoseRecord>(
        fixtureGlucoseRecords(start, end),
      );}
    if (dependencies.fetchGlucoseRange)
      {return dependencies.fetchGlucoseRange(start, end);}
    if (dependencies.fetchGlucoseRecords)
      {return fresh(await dependencies.fetchGlucoseRecords(start, end));}
    return fetchBgDataForDateRangeWithMetadata(start, end);
  };
  const loadGlucoseForecast = createGlucoseForecastLoader({
    getScopeKey: () =>
      `${sourceId}:${getNightscoutConfigurationRevision()}`,
    now,
    readGlucose: async (startMs, endMs) => {
      const range = await loadGlucoseRange(new Date(startMs), new Date(endMs));
      if (range.freshness.kind === 'stale') {
        throw new Error('Forecast glucose data is unavailable.');
      }
      return range.records.map(sample => ({ts: sample.date, sgv: sample.sgv}));
    },
    readDeviceStatus: async (startMs, endMs) => {
      if (useE2EFixtures) {return [];}
      const start = new Date(startMs);
      const end = new Date(endMs);
      if (dependencies.fetchDeviceStatusRecords && !dependencies.fetchDeviceStatusRange) {
        return dependencies.fetchDeviceStatusRecords(start, end);
      }
      const range = await (
        dependencies.fetchDeviceStatusRange ??
        fetchDeviceStatusForDateRangeWithMetadata
      )(start, end);
      if (range.freshness.kind === 'stale') {
        throw new Error('Forecast device-status data is unavailable.');
      }
      return range.records;
    },
    readContextEvents: (startMs, endMs): readonly ForecastContextEvent[] => {
      if (!dependencies.journal) {return [];}
      const query = {
        timeRange: {fromInclusive: startMs, toExclusive: endMs},
      };
      return [
        ...dependencies.journal.meals.getListSnapshot(query).items.map(meal => ({
          kind: 'meal' as const,
          ts: meal.mealStart,
          ...forecastRecordedAt(meal.updatedAt ?? meal.createdAt),
          ...(meal.mealCarbohydrates === undefined
            ? {}
            : {carbsGrams: meal.mealCarbohydrates.grams}),
        })),
        ...dependencies.journal.activities.getListSnapshot(query).items.map(activity => ({
          kind: 'activity' as const,
          ts: activity.startedAt,
          ...forecastRecordedAt(activity.updatedAt ?? activity.createdAt),
          ...(activity.endedAt === undefined ? {} : {endMs: activity.endedAt}),
        })),
      ];
    },
    onSnapshot: snapshot => {
      if (useE2EFixtures) {return;}
      const baseUrl = getNightscoutBaseUrl();
      if (baseUrl) {publishAndroidGlucoseForecast(baseUrl, snapshot);}
    },
  });
  return {
    loadGlucoseForecast,
    async loadCalendarGlucose(period, options) {
      const revision = getNightscoutConfigurationRevision();
      return loadCalendarGlucoseRange({
        period,
        ...(options?.signal === undefined ? {} : {signal: options.signal}),
        assertCurrent: () => {
          if (getNightscoutConfigurationRevision() !== revision) {
            throw new Error(
              'Nightscout source changed while loading the calendar.',
            );
          }
        },
        loadChunk: async chunk => {
          const result = await loadGlucoseRange(
            new Date(chunk.dayStartMs),
            new Date(chunk.dayEndMs),
          );
          return {
            glucoseSamples: glucoseSamples(result.records, sourceId),
            freshness: result.freshness,
            complete:
              result.complete === true && result.freshness.kind === 'fresh',
          };
        },
      });
    },
    async loadDayGraph(period, options) {
      const start = new Date(period.dayStartMs);
      const end = new Date(period.dayEndMs);
      const [glucoseRange, context, suppliedTimeline] = await Promise.all([
        loadGlucoseRange(start, end),
        useE2EFixtures
          ? Promise.resolve(emptyContext(now()))
          : loadContext({
              startMs: period.dayStartMs,
              endMs: period.dayEndMs,
              ...(options?.forceRefresh ? {forceRefresh: true} : {}),
            }),
        dependencies.loadTimelineItems
          ? dependencies.loadTimelineItems(period)
          : Promise.resolve(undefined),
      ]);
      const freshnessInputs = [glucoseRange.freshness, context.freshness];
      const fetchedAtMs = Math.min(
        ...freshnessInputs.map(value => value.fetchedAtMs),
      );
      const stale = freshnessInputs.some(value => value.kind === 'stale');
      return {
        glucoseSamples: glucoseSamples(glucoseRange.records, sourceId),
        timelineItems: suppliedTimeline ?? [
          ...treatmentItems(context.treatments, sourceId, locale),
          ...journalItems(dependencies.journal, period, locale),
        ],
        activeLoadSamples: context.loadSamples.map(sample => ({
          timestampMs: sample.timestampMs,
          ...(sample.iob === undefined ? {} : {iobUnits: sample.iob}),
          ...(sample.iobBolus === undefined
            ? {}
            : {bolusIobUnits: sample.iobBolus}),
          ...(sample.iobBasal === undefined
            ? {}
            : {basalIobUnits: sample.iobBasal}),
          ...(sample.cob === undefined ? {} : {cobGrams: sample.cob}),
        })),
        insulinEvents: insulinEvents(context.insulinData),
        basalSchedule: basalSchedule(context.basalProfileData),
        dataAvailability: context.availability,
        freshness: stale
          ? {
              kind: 'stale',
              fetchedAtMs,
              reason:
                locale === 'he'
                  ? 'חלק מנתוני Nightscout אינם עדכניים או אינם זמינים כרגע.'
                  : 'Some Nightscout data is out of date or currently unavailable.',
            }
          : {kind: 'fresh', fetchedAtMs},
      };
    },
  };
};
