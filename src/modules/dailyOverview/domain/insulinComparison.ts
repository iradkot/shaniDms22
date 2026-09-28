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
  if (
    summary?.quality !== 'available' ||
    ![summary.basalUnits, summary.bolusUnits].every(
      value => Number.isFinite(value) && value >= 0,
    )
  ) {
    return undefined;
  }
  return {
    basalUnits: summary.basalUnits,
    bolusUnits: summary.bolusUnits,
    totalUnits: summary.basalUnits + summary.bolusUnits,
    ...(summary.basalEstimated === undefined
      ? {}
      : {basalEstimated: summary.basalEstimated}),
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
  const weekAverage =
    previous.length === 7 && available.length === 7
      ? {
          basalUnits:
            available.reduce((sum, value) => sum + value.basalUnits, 0) / 7,
          bolusUnits:
            available.reduce((sum, value) => sum + value.bolusUnits, 0) / 7,
          totalUnits:
            available.reduce((sum, value) => sum + value.totalUnits, 0) / 7,
          basalEstimated: available.some(
            value => value.basalEstimated === true,
          ),
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
