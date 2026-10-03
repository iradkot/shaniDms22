import type {
  DailyInsulinComparisonPresentation,
  DailyInsulinComparisonRequest,
  DailyInsulinComparisonTotals,
  DailyInsulinSourceSummary,
  DailyOverviewPeriod,
} from '../contracts';
import {
  DailyOverviewInputError,
  getLocalDayPeriod,
  moveLocalDay,
} from './overview';

export interface DailyInsulinComparisonWindows {
  readonly current: DailyOverviewPeriod;
  readonly previousDays: readonly DailyOverviewPeriod[];
  readonly isPartialDay: boolean;
}

/** Shift calendar dates, not 24-hour durations, so DST does not change the cutoff clock. */
export const getDailyInsulinComparisonWindows = ({
  period,
  asOfMs,
}: DailyInsulinComparisonRequest): DailyInsulinComparisonWindows => {
  const day = getLocalDayPeriod(period.startMs);
  if (
    day.startMs !== period.startMs ||
    day.endMs !== period.endMs ||
    !Number.isFinite(asOfMs)
  ) {
    throw new DailyOverviewInputError(
      'Insulin comparisons require one local day and a finite cutoff.',
    );
  }
  const endMs = Math.min(period.endMs, Math.max(period.startMs, asOfMs));
  const isPartialDay = endMs < period.endMs;
  const cutoff = new Date(endMs);
  const previousDays = Array.from({length: 7}, (_, index) => {
    const previous = getLocalDayPeriod(
      moveLocalDay(period.startMs, -(index + 1)),
    );
    const localCutoff = new Date(previous.startMs);
    localCutoff.setHours(
      cutoff.getHours(),
      cutoff.getMinutes(),
      cutoff.getSeconds(),
      cutoff.getMilliseconds(),
    );
    return {
      startMs: previous.startMs,
      endMs: isPartialDay
        ? Math.min(localCutoff.getTime(), previous.endMs)
        : previous.endMs,
    };
  });
  return {
    current: {startMs: period.startMs, endMs},
    previousDays,
    isPartialDay,
  };
};

const totals = (
  summary: DailyInsulinSourceSummary | undefined,
): DailyInsulinComparisonTotals | undefined => {
  if (!summary || summary.quality === 'unavailable') {
    return undefined;
  }
  const valid = (value: number | undefined): value is number =>
    value !== undefined && Number.isFinite(value) && value >= 0;
  const estimated = summary.quality === 'available' && summary.basalEstimated;
  const basalUnits =
    !estimated && valid(summary.basalUnits) ? summary.basalUnits : undefined;
  const bolusUnits = valid(summary.bolusUnits) ? summary.bolusUnits : undefined;
  if (basalUnits === undefined && bolusUnits === undefined) {
    return undefined;
  }
  const complete =
    summary.quality === 'available' &&
    basalUnits !== undefined &&
    bolusUnits !== undefined &&
    (summary.basalCoveragePercent ?? 100) === 100;
  return {
    quality: complete ? 'available' : 'partial',
    ...(basalUnits === undefined ? {} : {basalUnits}),
    ...(bolusUnits === undefined ? {} : {bolusUnits}),
    ...(complete ? {totalUnits: basalUnits + bolusUnits} : {}),
    basalCoveragePercent: estimated
      ? 0
      : summary.basalCoveragePercent ?? (complete ? 100 : 0),
    ...(summary.basalCoveredMs === undefined
      ? {}
      : {basalCoveredMs: summary.basalCoveredMs}),
    ...(summary.basalEvidence === undefined
      ? {}
      : {basalEvidence: summary.basalEvidence}),
  };
};

/** Never relabel a subset of available days as the seven-day average. */
export const buildDailyInsulinComparison = (
  windows: DailyInsulinComparisonWindows,
  previous: readonly DailyInsulinSourceSummary[],
): DailyInsulinComparisonPresentation => {
  const values = previous.map(totals);
  const available = values.filter(
    (value): value is DailyInsulinComparisonTotals => value !== undefined,
  );
  const yesterday = values[0];
  const allDays = previous.length === 7 && available.length === 7;
  const completeBasal =
    allDays &&
    available.every(
      value =>
        value.basalUnits !== undefined && value.basalCoveragePercent === 100,
    );
  const completeBolus =
    allDays && available.every(value => value.bolusUnits !== undefined);
  const weekBasal = completeBasal
    ? available.reduce(
        (mean, value, index) => mean + (value.basalUnits! - mean) / (index + 1),
        0,
      )
    : undefined;
  const weekBolus = completeBolus
    ? available.reduce(
        (mean, value, index) => mean + (value.bolusUnits! - mean) / (index + 1),
        0,
      )
    : undefined;
  const weekAverage: DailyInsulinComparisonTotals | undefined =
    weekBasal !== undefined || weekBolus !== undefined
      ? {
          quality:
            weekBasal !== undefined && weekBolus !== undefined
              ? 'available'
              : 'partial',
          ...(weekBasal === undefined ? {} : {basalUnits: weekBasal}),
          ...(weekBolus === undefined ? {} : {bolusUnits: weekBolus}),
          ...(weekBasal !== undefined && weekBolus !== undefined
            ? {totalUnits: weekBasal + weekBolus}
            : {}),
          basalCoveragePercent: completeBasal ? 100 : 0,
          basalEvidence: 'recorded',
        }
      : undefined;
  return {
    status:
      yesterday !== undefined || weekAverage !== undefined
        ? 'available'
        : 'unavailable',
    ...(yesterday === undefined ? {} : {yesterday}),
    ...(weekAverage === undefined ? {} : {weekAverage}),
    weekDays: available.length,
    cutoffTimestampMs: windows.current.endMs,
    isPartialDay: windows.isPartialDay,
  };
};

export interface RecordedInsulinComparison {
  readonly metric: 'total' | 'bolus';
  readonly currentUnits: number;
  readonly baselineUnits: number;
  readonly deltaUnits: number;
}
interface ComparableInsulin {
  readonly quality: 'available' | 'partial' | 'unavailable';
  readonly basalUnits?: number;
  readonly bolusUnits?: number;
  readonly basalEstimated?: boolean;
  readonly basalCoveragePercent?: number;
}
/** All presentations choose the same recorded component; partial totals never compare. */
export const selectRecordedInsulinComparison = (
  current: ComparableInsulin,
  baseline: ComparableInsulin | undefined,
): RecordedInsulinComparison | undefined => {
  if (
    !baseline ||
    current.quality === 'unavailable' ||
    baseline.quality === 'unavailable'
  ) {
    return undefined;
  }
  const valid = (value: number | undefined): value is number =>
    value !== undefined && Number.isFinite(value) && value >= 0;
  const complete = (value: ComparableInsulin): boolean =>
    value.quality === 'available' &&
    !value.basalEstimated &&
    valid(value.basalUnits) &&
    valid(value.bolusUnits) &&
    (value.basalCoveragePercent ?? 100) === 100;
  const metric = complete(current) && complete(baseline) ? 'total' : 'bolus';
  if (!valid(current.bolusUnits) || !valid(baseline.bolusUnits)) {
    return undefined;
  }
  const currentUnits =
    current.bolusUnits + (metric === 'total' ? current.basalUnits! : 0);
  const baselineUnits =
    baseline.bolusUnits + (metric === 'total' ? baseline.basalUnits! : 0);
  return {
    metric,
    currentUnits,
    baselineUnits,
    deltaUnits: currentUnits - baselineUnits,
  };
};
