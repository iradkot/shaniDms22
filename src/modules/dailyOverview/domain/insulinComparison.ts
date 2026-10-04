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

const validUnits = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value >= 0;

const finiteSum = (basal: number | undefined, bolus: number | undefined) => {
  if (!validUnits(basal) || !validUnits(bolus)) {
    return undefined;
  }
  const total = basal + bolus;
  return Number.isFinite(total) ? total : undefined;
};

interface ComparableInsulin {
  readonly quality: 'available' | 'partial' | 'unavailable';
  readonly basalUnits?: number;
  readonly bolusUnits?: number;
  readonly basalEstimated?: boolean;
  readonly basalCoveragePercent?: number;
  readonly estimatedBasalUnits?: number;
  readonly estimatedTotalUnits?: number;
}

const explicitEstimatedTotal = (value: ComparableInsulin) => {
  const total = finiteSum(value.estimatedBasalUnits, value.bolusUnits);
  return total !== undefined &&
    validUnits(value.estimatedTotalUnits) &&
    Math.abs(total - value.estimatedTotalUnits) <=
      Math.max(1e-6, value.estimatedTotalUnits * 1e-9)
    ? total
    : undefined;
};

const recordedSum = (value: ComparableInsulin) =>
  value.basalEstimated
    ? undefined
    : finiteSum(value.basalUnits, value.bolusUnits);

const completeSum = (value: ComparableInsulin) =>
  value.quality === 'available' && (value.basalCoveragePercent ?? 100) === 100
    ? recordedSum(value)
    : undefined;

const comparableTotal = (value: ComparableInsulin) =>
  completeSum(value) ?? explicitEstimatedTotal(value);

const totals = (
  summary: DailyInsulinSourceSummary | undefined,
): DailyInsulinComparisonTotals | undefined => {
  if (!summary || summary.quality === 'unavailable') {
    return undefined;
  }
  const legacyEstimated =
    summary.quality === 'available' && summary.basalEstimated;
  const basalUnits =
    !legacyEstimated && validUnits(summary.basalUnits)
      ? summary.basalUnits
      : undefined;
  const bolusUnits = validUnits(summary.bolusUnits)
    ? summary.bolusUnits
    : undefined;
  if (basalUnits === undefined && bolusUnits === undefined) {
    return undefined;
  }
  const coverage =
    summary.basalCoveragePercent ?? (summary.quality === 'available' ? 100 : 0);
  const basalCoveragePercent =
    !legacyEstimated &&
    Number.isFinite(coverage) &&
    coverage >= 0 &&
    coverage <= 100
      ? coverage
      : 0;
  const sum = finiteSum(basalUnits, bolusUnits);
  const complete =
    summary.quality === 'available' &&
    sum !== undefined &&
    basalCoveragePercent === 100;
  const estimatedTotalUnits = explicitEstimatedTotal(summary);
  return {
    quality: complete ? 'available' : 'partial',
    ...(basalUnits === undefined ? {} : {basalUnits}),
    ...(bolusUnits === undefined ? {} : {bolusUnits}),
    ...(complete ? {totalUnits: sum} : {}),
    ...(estimatedTotalUnits === undefined ||
    summary.estimatedBasalUnits === undefined
      ? {}
      : {
          estimatedBasalUnits: summary.estimatedBasalUnits,
          estimatedTotalUnits,
        }),
    basalCoveragePercent,
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
  const mean = (
    field:
      | 'basalUnits'
      | 'bolusUnits'
      | 'basalCoveragePercent'
      | 'basalCoveredMs'
      | 'estimatedBasalUnits'
      | 'estimatedTotalUnits',
  ): number | undefined =>
    allDays && available.every(value => validUnits(value[field]))
      ? available.reduce(
          (average, value, index) =>
            average + (value[field]! - average) / (index + 1),
          0,
        )
      : undefined;
  const weekBasal = mean('basalUnits');
  const weekBolus = mean('bolusUnits');
  const weekCoverage = mean('basalCoveragePercent');
  const weekCoveredMs = mean('basalCoveredMs');
  const completeBasal =
    allDays &&
    available.every(
      value =>
        value.quality === 'available' && value.basalCoveragePercent === 100,
    );
  const weekTotal = completeBasal ? finiteSum(weekBasal, weekBolus) : undefined;
  const allComparable =
    allDays && available.every(value => comparableTotal(value) !== undefined);
  const someEstimated =
    allComparable && available.some(value => completeSum(value) === undefined);
  const weekEstimatedBasal = someEstimated
    ? available.reduce((average, value, index) => {
        const basal =
          completeSum(value) !== undefined
            ? value.basalUnits!
            : value.estimatedBasalUnits!;
        return average + (basal - average) / (index + 1);
      }, 0)
    : undefined;
  const weekEstimatedTotal = someEstimated
    ? finiteSum(weekEstimatedBasal, weekBolus)
    : undefined;
  const weekAverage: DailyInsulinComparisonTotals | undefined =
    weekBasal !== undefined || weekBolus !== undefined
      ? {
          quality: weekTotal !== undefined ? 'available' : 'partial',
          ...(weekBasal === undefined ? {} : {basalUnits: weekBasal}),
          ...(weekBolus === undefined ? {} : {bolusUnits: weekBolus}),
          ...(weekTotal === undefined ? {} : {totalUnits: weekTotal}),
          ...(weekEstimatedTotal === undefined ||
          weekEstimatedBasal === undefined
            ? {}
            : {
                estimatedBasalUnits: weekEstimatedBasal,
                estimatedTotalUnits: weekEstimatedTotal,
              }),
          ...(weekCoveredMs === undefined
            ? {}
            : {basalCoveredMs: weekCoveredMs}),
          basalCoveragePercent: weekCoverage ?? 0,
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
  readonly metric: 'total' | 'estimatedTotal' | 'recordedSubtotal' | 'bolus';
  readonly currentUnits: number;
  readonly baselineUnits: number;
  readonly deltaUnits: number;
}

/** Prefer total insulin, retaining known temp basal even with partial coverage. */
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
  const options = [
    {
      metric: 'total',
      currentUnits: completeSum(current),
      baselineUnits: completeSum(baseline),
    },
    {
      metric: 'estimatedTotal',
      currentUnits: comparableTotal(current),
      baselineUnits: comparableTotal(baseline),
    },
    {
      metric: 'recordedSubtotal',
      currentUnits: recordedSum(current),
      baselineUnits: recordedSum(baseline),
    },
    {
      metric: 'bolus',
      currentUnits: current.bolusUnits,
      baselineUnits: baseline.bolusUnits,
    },
  ] as const;
  const selected = options.find(
    option =>
      validUnits(option.currentUnits) && validUnits(option.baselineUnits),
  );
  if (
    !selected ||
    selected.currentUnits === undefined ||
    selected.baselineUnits === undefined
  ) {
    return undefined;
  }
  return {
    metric: selected.metric,
    currentUnits: selected.currentUnits,
    baselineUnits: selected.baselineUnits,
    deltaUnits: selected.currentUnits - selected.baselineUnits,
  };
};
