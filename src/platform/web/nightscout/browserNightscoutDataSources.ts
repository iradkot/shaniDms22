import type {JournalWorkspace} from '../../../modules/journal';
import type {
  DayGraphActiveLoadSample,
  DayGraphBasalScheduleEntry,
  DayGraphDataSource,
  DayGraphInsulinEvent,
  DayGraphTimelineItem,
} from '../../../modules/dayGraph';
import type {DailyOverviewDataSource} from '../../../modules/dailyOverview';
import type {PreviousDaySummaryDataSource} from '../../../modules/previousDaySummary';
import {
  buildTherapyContextSnapshot,
  type TherapyContextDataSource,
  type TrendsDataSource,
} from '../../../modules/trends';
import type {DestinationLocale} from '../../../product/destinations';
import type {CurrentSnapshotViewModel} from '../../../product/hub';
import type {ResolvedDestinationTarget} from '../../../product/destinations';
import {
  BrowserNightscoutClient,
  treatmentTimestampMs,
  type BrowserNightscoutTreatment,
} from './browserNightscoutClient';
import {
  createBrowserInvestigationDataSources,
  type BrowserInvestigationDataSources,
} from './browserInvestigationDataSources';
import {projectNightscoutTherapyContext} from '../../nightscout/therapyContextProjection';
import {mapNightscoutTreatmentsToInsulinDataEntries} from '../../../utils/nightscoutTreatments.utils';
import {createRecordedInsulinDataSource} from '../../../services/insulin/createRecordedInsulinDataSource';
import {loadCalendarGlucoseRange} from '../../nightscout/loadCalendarGlucoseRange';
import type {CurrentDataSource} from '../../../modules/currentData';
import {createBrowserCurrentDataSource, type BrowserCurrentDataClient} from './browserCurrentDataSource';
import {
  createGlucoseForecastLoader,
  type ForecastContextEvent,
} from '../../../modules/glucoseForecast';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const recordId = (
  item: BrowserNightscoutTreatment,
  timestampMs: number,
  index: number,
): string =>
  item._id ?? item.identifier ?? `unidentified:${timestampMs}:${index}`;

const treatmentTimeline = (
  values: readonly BrowserNightscoutTreatment[],
  sourceId: string,
  locale: DestinationLocale,
): readonly DayGraphTimelineItem[] => {
  const result: DayGraphTimelineItem[] = [];
  values.forEach((item, index) => {
    const timestampMs = treatmentTimestampMs(item);
    if (timestampMs === undefined) {
      return;
    }
    const identity = {sourceId, recordId: recordId(item, timestampMs, index)};
    if (item.carbs !== undefined && item.carbs > 0) {
      result.push({
        kind: 'external-carb',
        identity,
        sourceLabel: 'Nightscout',
        timestampMs,
        title:
          item.eventType ?? (locale === 'he' ? 'פחמימות' : 'Carbohydrates'),
        carbohydratesGrams: item.carbs,
      });
      return;
    }
    const insulin = item.insulin ?? item.amount;
    if (insulin === undefined && item.eventType === undefined) {
      return;
    }
    result.push({
      kind: 'treatment',
      identity,
      sourceLabel: 'Nightscout',
      timestampMs,
      title: item.eventType ?? (locale === 'he' ? 'טיפול' : 'Treatment'),
      ...(insulin === undefined ? {} : {detail: `${insulin} U`}),
    });
  });
  return result;
};

const journalTimeline = (
  journal: JournalWorkspace,
  startMs: number,
  endMs: number,
  locale: DestinationLocale,
): readonly DayGraphTimelineItem[] => {
  const timeRange = {fromInclusive: startMs, toExclusive: endMs};
  const meals: DayGraphTimelineItem[] = journal.meals
    .getListSnapshot({timeRange})
    .items.map(meal => ({
      kind: 'journal-meal',
      identity: {sourceId: 'journal', recordId: meal.id},
      sourceLabel: 'Journal',
      timestampMs: meal.mealStart,
      title: meal.name || (locale === 'he' ? 'ארוחה' : 'Meal'),
      ...(meal.mealCarbohydrates === undefined
        ? {}
        : {carbohydratesGrams: meal.mealCarbohydrates.grams}),
    }));
  const activities: DayGraphTimelineItem[] = journal.activities
    .getListSnapshot({timeRange})
    .items.map(activity => ({
      kind: 'journal-activity',
      identity: {sourceId: 'journal', recordId: activity.id},
      sourceLabel: 'Journal',
      timestampMs: activity.startedAt,
      title: activity.customName || (locale === 'he' ? 'פעילות' : 'Activity'),
      ...(activity.endedAt === undefined
        ? {}
        : {endTimestampMs: activity.endedAt}),
    }));
  return [...meals, ...activities];
};

const activeLoadSamples = (
  values: readonly {
    readonly createdAtMs: number;
    readonly iobUnits?: number;
    readonly bolusIobUnits?: number;
    readonly basalIobUnits?: number;
    readonly cobGrams?: number;
  }[],
): readonly DayGraphActiveLoadSample[] =>
  values.map(value => ({
    timestampMs: value.createdAtMs,
    ...(value.iobUnits === undefined ? {} : {iobUnits: value.iobUnits}),
    ...(value.bolusIobUnits === undefined
      ? {}
      : {bolusIobUnits: value.bolusIobUnits}),
    ...(value.basalIobUnits === undefined
      ? {}
      : {basalIobUnits: value.basalIobUnits}),
    ...(value.cobGrams === undefined ? {} : {cobGrams: value.cobGrams}),
  }));

const insulinEvents = (
  values: readonly BrowserNightscoutTreatment[],
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
        : startMs + entry.duration * MINUTE_MS;
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

export interface BrowserNightscoutDataSources {
  readonly trends: TrendsDataSource;
  readonly dayGraph: DayGraphDataSource;
  readonly dailyOverview: DailyOverviewDataSource;
  readonly previousDaySummary: PreviousDaySummaryDataSource;
  readonly therapyContext: TherapyContextDataSource;
  readonly similarEvents: BrowserInvestigationDataSources['similarEvents'];
  readonly loopChanges: BrowserInvestigationDataSources['loopChanges'];
}

export const createBrowserNightscoutDataSources = (input: {
  readonly client: BrowserNightscoutClient;
  readonly sourceId: string;
  readonly locale: DestinationLocale;
  readonly journal: JournalWorkspace;
  readonly now?: () => number;
}): BrowserNightscoutDataSources => {
  const loadGlucoseSnapshot = async (
    period: Parameters<TrendsDataSource['loadGlucoseSamples']>[0],
  ) => {
    const result = await input.client.readEntries(period.startMs, period.endMs);
    return {
      samples: result.records.map(record => ({
        timestampMs: record.date,
        valueMgDl: record.sgv,
      })),
      freshness: result.freshness,
    };
  };
  const trends: TrendsDataSource = {
    loadGlucoseSnapshot,
    async loadGlucoseSamples(period) {
      return (await loadGlucoseSnapshot(period)).samples;
    },
  };
  const loadGlucoseForecast = createGlucoseForecastLoader({
    getScopeKey: () => {
      input.client.assertCurrentSource?.();
      return input.sourceId;
    },
    ...(input.now === undefined ? {} : {now: input.now}),
    readGlucose: async (startMs, endMs) => {
      const range = await input.client.readEntries(startMs, endMs);
      if (range.freshness.kind === 'stale') {
        throw new Error('Forecast glucose data is unavailable.');
      }
      return range.records.map(sample => ({ts: sample.date, sgv: sample.sgv}));
    },
    readDeviceStatus: async (startMs, endMs) => {
      const range = await input.client.readDeviceStatuses(startMs, endMs);
      if (range.freshness.kind === 'stale') {
        throw new Error('Forecast device-status data is unavailable.');
      }
      return range.records.flatMap(value =>
        value.forecastStatus === undefined ? [] : [value.forecastStatus],
      );
    },
    readContextEvents: (startMs, endMs): readonly ForecastContextEvent[] => {
      const query = {
        timeRange: {fromInclusive: startMs, toExclusive: endMs},
      };
      return [
        ...input.journal.meals.getListSnapshot(query).items.map(meal => ({
          kind: 'meal' as const,
          ts: meal.mealStart,
          recordedAtMs: meal.updatedAt,
          ...(meal.mealCarbohydrates === undefined
            ? {}
            : {carbsGrams: meal.mealCarbohydrates.grams}),
        })),
        ...input.journal.activities.getListSnapshot(query).items.map(activity => ({
          kind: 'activity' as const,
          ts: activity.startedAt,
          recordedAtMs: activity.updatedAt,
          ...(activity.endedAt === undefined ? {} : {endMs: activity.endedAt}),
        })),
      ];
    },
  });
  const dayGraph: DayGraphDataSource = {
    loadGlucoseForecast,
    async loadCalendarGlucose(period, options) {
      return loadCalendarGlucoseRange({
        period,
        ...(options?.signal === undefined ? {} : {signal: options.signal}),
        assertCurrent: () => input.client.assertCurrentSource?.(),
        loadChunk: async chunk => {
          const entries = await input.client.readEntries(
            chunk.dayStartMs,
            chunk.dayEndMs,
            options?.signal,
          );
          return {
            glucoseSamples: entries.records.map((entry, index) => ({
              identity: {
                sourceId: input.sourceId,
                recordId: entry._id ?? `unidentified:${entry.date}:${index}`,
              },
              timestampMs: entry.date,
              valueMgDl: entry.sgv,
            })),
            freshness: entries.freshness,
            complete:
              entries.complete === true && entries.freshness.kind === 'fresh',
          };
        },
      });
    },
    async loadDayGraph(period) {
      const [entries, treatments, deviceStatuses, profile] = await Promise.all([
        input.client.readEntries(period.dayStartMs, period.dayEndMs),
        input.client
          .readTreatments(period.dayStartMs - DAY_MS, period.dayEndMs)
          .catch(() => undefined),
        input.client
          .readDeviceStatusesForRange(period.dayStartMs, period.dayEndMs)
          .catch(() => undefined),
        input.client.readBasalProfile(period.dayStartMs).catch(() => undefined),
      ]);
      const stale =
        treatments === undefined ||
        deviceStatuses === undefined ||
        profile === undefined ||
        entries.freshness.kind === 'stale' ||
        treatments.freshness.kind === 'stale' ||
        (deviceStatuses !== undefined &&
          deviceStatuses.records.length > 0 &&
          deviceStatuses.freshness.kind === 'stale') ||
        (profile !== undefined &&
          profile.records.length > 0 &&
          profile.freshness.kind === 'stale');
      const optionalFreshness = [treatments, deviceStatuses, profile]
        .filter(value => value !== undefined && value.records.length > 0)
        .map(value => value!.freshness.fetchedAtMs);
      const chartTreatments = treatments?.records ?? [];
      return {
        glucoseSamples: entries.records.map((record, index) => ({
          identity: {
            sourceId: input.sourceId,
            recordId: record._id ?? `unidentified:${record.date}:${index}`,
          },
          timestampMs: record.date,
          valueMgDl: record.sgv,
          ...(record.direction === undefined
            ? {}
            : {direction: record.direction}),
          ...(record.device === undefined ? {} : {device: record.device}),
        })),
        timelineItems: [
          ...treatmentTimeline(chartTreatments, input.sourceId, input.locale),
          ...journalTimeline(
            input.journal,
            period.dayStartMs,
            period.dayEndMs,
            input.locale,
          ),
        ].filter(
          item =>
            item.timestampMs >= period.dayStartMs &&
            item.timestampMs < period.dayEndMs,
        ),
        activeLoadSamples: activeLoadSamples(deviceStatuses?.records ?? []),
        insulinEvents: insulinEvents(chartTreatments),
        basalSchedule: (profile?.records[0]?.entries ??
          []) satisfies readonly DayGraphBasalScheduleEntry[],
        freshness: stale
          ? {
              kind: 'stale',
              fetchedAtMs: Math.min(
                entries.freshness.fetchedAtMs,
                ...optionalFreshness,
              ),
              reason:
                input.locale === 'he'
                  ? 'חלק מהנתונים אינם עדכניים או אינם זמינים כרגע. מוצג המידע הזמין.'
                  : 'Some data is out of date or unavailable. Showing available information.',
            }
          : {
              kind: 'fresh',
              fetchedAtMs: Math.min(
                entries.freshness.fetchedAtMs,
                ...optionalFreshness,
              ),
            },
      };
    },
  };
  const recordedInsulin = createRecordedInsulinDataSource({
    getScopeKey: () => {
      input.client.assertCurrentSource?.();
      return input.sourceId;
    },
    ...(input.now === undefined ? {} : {now: input.now}),
    fetchTreatments: async (start, end) => {
      const range = await input.client.readRecordedTreatments(
        start.getTime(),
        end.getTime(),
      );
      return {...range, records: range.records.map(record => ({...record}))};
    },
    fetchBasalProfile: async asOf => {
      const range = await input.client.readBasalProfile(asOf.getTime());
      const selected = range.records[0];
      // The browser proxy currently returns the latest profile. It is usable
      // for history only if its explicit effective date precedes this window.
      const eligible = range.complete !== false && selected?.effectiveFromMs !== undefined && selected.effectiveFromMs <= asOf.getTime();
      return {
        freshness: range.freshness,
        ...(eligible ? {profile: {
          entries: selected.entries.map(entry => ({
            time: `${String(Math.floor(entry.secondsFromMidnight / 3600)).padStart(2, '0')}:${String(Math.floor((entry.secondsFromMidnight % 3600) / 60)).padStart(2, '0')}:${String(entry.secondsFromMidnight % 60).padStart(2, '0')}`,
            timeAsSeconds: entry.secondsFromMidnight,
            value: entry.rateUnitsPerHour,
          })),
          ...(selected.timeZone === undefined ? {} : {timeZone: selected.timeZone}),
        }} : {}),
      };
    },
  });
  const dailyOverview: DailyOverviewDataSource = {
    async loadDailyOverview(period, options) {
      const observedAtMs = (input.now ?? Date.now)();
      const cutoff = Math.min(
        period.endMs,
        observedAtMs,
        options?.asOfMs ?? observedAtMs,
      );
      if (cutoff <= period.startMs) {
        return {glucoseSamples: [], insulinSummary: {quality: 'unavailable'}};
      }
      const [entries, insulinSummary] = await Promise.all([
        // Carry the final pre-midnight reading into the first five minutes.
        loadGlucoseSnapshot({
          ...period,
          startMs: period.startMs - 5 * MINUTE_MS,
          endMs: cutoff,
        }),
        recordedInsulin.loadWindow({...period, endMs: cutoff}, {includeEstimates: true}),
      ]);
      input.client.assertCurrentSource?.();
      return {
        glucoseSamples: entries.samples,
        glucoseFreshness: entries.freshness,
        insulinSummary,
      };
    },
    async loadDailyInsulinComparison(request) {
      return (await recordedInsulin.loadDailyBundle(request, {includeEstimates: true})).comparison;
    },
  };
  const previousDaySummary: PreviousDaySummaryDataSource = {
    async loadPreviousDaySummary(period) {
      const [glucoseSamples, treatments, insulinSummary] = await Promise.all([
        trends.loadGlucoseSamples(period),
        input.client
          .readTreatments(period.startMs - DAY_MS, period.endMs)
          .catch(() => undefined),
        recordedInsulin.loadWindow(period).catch(() => undefined),
      ]);
      input.client.assertCurrentSource?.();
      const events = [
        ...treatmentTimeline(
          treatments?.records ?? [],
          input.sourceId,
          input.locale,
        ),
        ...journalTimeline(
          input.journal,
          period.startMs,
          period.endMs,
          input.locale,
        ),
      ]
        .filter(
          item =>
            item.timestampMs >= period.startMs &&
            item.timestampMs < period.endMs,
        )
        .map(item => ({
          id: `${item.identity.sourceId}:${item.identity.recordId}`,
          kind:
            item.kind === 'journal-meal'
              ? ('meal' as const)
              : item.kind === 'journal-activity'
              ? ('activity' as const)
              : ('treatment' as const),
          timestampMs: item.timestampMs,
          title: item.title,
          ...(item.detail === undefined ? {} : {detail: item.detail}),
        }));
      return {
        glucoseSamples,
        // The legacy previous-day contract requires complete totals. Keep its
        // total unavailable when only a recorded component is known.
        insulinSummary:
          insulinSummary?.quality === 'available'
            ? insulinSummary
            : {quality: 'unavailable'},
        events,
      };
    },
  };
  const therapyContext: TherapyContextDataSource = {
    async loadTherapyContext(period) {
      const [glucoseSamples, treatments] = await Promise.all([
        trends.loadGlucoseSamples(period),
        input.client.readTreatments(period.startMs - DAY_MS, period.endMs),
      ]);
      const projected = projectNightscoutTherapyContext(treatments.records);
      const timeRange = {
        fromInclusive: period.startMs,
        toExclusive: period.endMs,
      };
      const meals = input.journal.meals.getListSnapshot({timeRange}).items;
      const activities = input.journal.activities.getListSnapshot({
        timeRange,
      }).items;
      return buildTherapyContextSnapshot({
        period,
        glucoseSamples,
        sourceReliability: 'reliable',
        treatments: projected.treatments,
        mealStartedAtMs: meals.map(meal => meal.mealStart),
        activities: activities.map(activity => ({
          startedAtMs: activity.startedAt,
          ...(activity.endedAt === undefined
            ? {}
            : {endedAtMs: activity.endedAt}),
        })),
        modeChanges: projected.modeChanges,
        timeZoneOffsetMinutes: -new Date().getTimezoneOffset(),
      });
    },
  };
  const investigations = createBrowserInvestigationDataSources({
    client: input.client,
    trends,
    locale: input.locale,
  });
  return {
    trends,
    dayGraph,
    dailyOverview,
    previousDaySummary,
    therapyContext,
    ...investigations,
  };
};

const TREND_LABELS: Readonly<Record<string, string>> = {
  DoubleUp: '↑↑',
  SingleUp: '↑',
  FortyFiveUp: '↗',
  Flat: '→',
  FortyFiveDown: '↘',
  SingleDown: '↓',
  DoubleDown: '↓↓',
};

export const loadBrowserCurrentSnapshot = async (input: {
  readonly client?: BrowserCurrentDataClient;
  readonly currentDataSource?: CurrentDataSource;
  readonly target: ResolvedDestinationTarget;
  readonly locale: DestinationLocale;
  readonly nowMs?: number;
}): Promise<CurrentSnapshotViewModel> => {
  try {
    const source = input.currentDataSource ?? (input.client && createBrowserCurrentDataSource({
      client: input.client,
      ...(input.nowMs === undefined ? {} : {now: () => input.nowMs!}),
    }));
    if (!source) {
      throw new Error('Current data source is unavailable.');
    }
    const current = await source.loadCurrent();
    const latest = current.glucoseReading;
    if (!latest || current.glucose.value === null) {
      return {
        status: current.glucose.reason === 'read-failed' ? 'offline' : 'empty',
        target: input.target,
        message:
          input.locale === 'he'
            ? 'אין עדיין נתון סוכר זמין.'
            : 'No glucose reading is available yet.',
      };
    }
    const ageMinutes = Math.max(0, Math.floor((current.glucose.ageMs ?? 0) / 60_000));
    const stale = current.glucose.status !== 'fresh';
    const offline = current.glucose.reason === 'cached-after-read-failure';
    const measurement = (value: number): string =>
      Number(value.toFixed(2)).toString();
    return {
      status:
        offline
          ? 'offline'
          : stale
          ? 'stale'
          : 'ready',
      target: input.target,
      glucoseLabel: `${Math.round(latest.sgv)} mg/dL`,
      ...(latest.direction === undefined
        ? {}
        : {trendLabel: TREND_LABELS[latest.direction] ?? latest.direction}),
      ...(current.iob.status !== 'fresh' || current.iob.value === null
        ? {}
        : {iobLabel: `IOB ${measurement(current.iob.value)} U`}),
      ...(current.cob.status !== 'fresh' || current.cob.value === null
        ? {}
        : {cobLabel: `COB ${measurement(current.cob.value)} g`}),
      dataAgeLabel:
        ageMinutes < 1
          ? input.locale === 'he'
            ? 'עכשיו'
            : 'Now'
          : input.locale === 'he'
          ? `לפני ${ageMinutes} דק׳`
          : `${ageMinutes} min ago`,
      ...(stale
        ? {
            message:
              offline
                ? input.locale === 'he'
                  ? 'אין חיבור כרגע. מוצג הנתון האחרון.'
                  : 'Offline now. Showing the last reading.'
                : input.locale === 'he'
                ? 'הנתון האחרון אינו עדכני.'
                : 'The latest reading is not up to date.',
          }
        : {}),
    };
  } catch {
    return {
      status: 'offline',
      target: input.target,
      message:
        input.locale === 'he'
          ? 'אין חיבור ל־Nightscout כרגע.'
          : 'Nightscout is offline right now.',
    };
  }
};
