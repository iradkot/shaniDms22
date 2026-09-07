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
import {buildBrowserInsulinSummary} from './browserInsulinSummary';
import {loadCalendarGlucoseRange} from '../../nightscout/loadCalendarGlucoseRange';

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
}): BrowserNightscoutDataSources => {
  const trends: TrendsDataSource = {
    async loadGlucoseSamples(period) {
      const result = await input.client.readEntries(
        period.startMs,
        period.endMs,
      );
      return result.records.map(record => ({
        timestampMs: record.date,
        valueMgDl: record.sgv,
      }));
    },
  };
  const dayGraph: DayGraphDataSource = {
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
  const dailyOverview: DailyOverviewDataSource = {
    async loadDailyOverview(period) {
      const [glucoseSamples, treatments, profile] = await Promise.all([
        trends.loadGlucoseSamples(period),
        input.client
          .readTreatments(period.startMs - DAY_MS, period.endMs)
          .catch(() => undefined),
        input.client.readBasalProfile(period.startMs).catch(() => undefined),
      ]);
      return {
        glucoseSamples,
        insulinSummary: buildBrowserInsulinSummary(
          period.startMs,
          period.endMs,
          treatments,
          profile,
        ),
      };
    },
  };
  const previousDaySummary: PreviousDaySummaryDataSource = {
    async loadPreviousDaySummary(period) {
      const [glucoseSamples, treatments, profile] = await Promise.all([
        trends.loadGlucoseSamples(period),
        input.client
          .readTreatments(period.startMs - DAY_MS, period.endMs)
          .catch(() => undefined),
        input.client.readBasalProfile(period.startMs).catch(() => undefined),
      ]);
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
        insulinSummary: buildBrowserInsulinSummary(
          period.startMs,
          period.endMs,
          treatments,
          profile,
        ),
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
  readonly client: Pick<BrowserNightscoutClient, 'readEntries'> &
    Partial<Pick<BrowserNightscoutClient, 'readDeviceStatuses'>>;
  readonly target: ResolvedDestinationTarget;
  readonly locale: DestinationLocale;
  readonly nowMs?: number;
}): Promise<CurrentSnapshotViewModel> => {
  const nowMs = input.nowMs ?? Date.now();
  try {
    const [result, deviceStatuses] = await Promise.all([
      input.client.readEntries(nowMs - 2 * 60 * 60 * 1_000, nowMs + 1),
      input.client.readDeviceStatuses === undefined
        ? Promise.resolve(undefined)
        : input.client
            .readDeviceStatuses(nowMs - 2 * 60 * 60 * 1_000, nowMs)
            .catch(() => undefined),
    ]);
    const latest = [...result.records].sort(
      (left, right) => right.date - left.date,
    )[0];
    if (!latest) {
      return {
        status: 'empty',
        target: input.target,
        message:
          input.locale === 'he'
            ? 'אין עדיין נתון סוכר זמין.'
            : 'No glucose reading is available yet.',
      };
    }
    const ageMinutes = Math.max(0, Math.floor((nowMs - latest.date) / 60_000));
    const latestDeviceStatus = deviceStatuses?.records
      .filter(
        record =>
          record.createdAtMs <= nowMs &&
          nowMs - record.createdAtMs < 10 * MINUTE_MS &&
          Math.abs(latest.date - record.createdAtMs) < 10 * MINUTE_MS,
      )
      .sort((left, right) => right.createdAtMs - left.createdAtMs)[0];
    const stale =
      ageMinutes >= 10 ||
      result.freshness.kind === 'stale' ||
      (latestDeviceStatus !== undefined &&
        deviceStatuses?.freshness.kind === 'stale');
    const measurement = (value: number): string =>
      Number(value.toFixed(2)).toString();
    return {
      status:
        result.freshness.kind === 'stale'
          ? 'offline'
          : stale
          ? 'stale'
          : 'ready',
      target: input.target,
      glucoseLabel: `${Math.round(latest.sgv)} mg/dL`,
      ...(latest.direction === undefined
        ? {}
        : {trendLabel: TREND_LABELS[latest.direction] ?? latest.direction}),
      ...(latestDeviceStatus?.iobUnits === undefined
        ? {}
        : {iobLabel: `IOB ${measurement(latestDeviceStatus.iobUnits)} U`}),
      ...(latestDeviceStatus?.cobGrams === undefined
        ? {}
        : {cobLabel: `COB ${measurement(latestDeviceStatus.cobGrams)} g`}),
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
              result.freshness.kind === 'stale'
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
