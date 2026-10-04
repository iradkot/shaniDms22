import type {DailyOverviewPeriod} from '../../modules/dailyOverview';

export const formatDailyValue = (value: number): string =>
  Number.isFinite(value) ? String(Number(value.toFixed(2))) : '—';

export const formatDailyClock = (timestampMs: number): string => {
  const date = new Date(timestampMs);
  return `${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes(),
  ).padStart(2, '0')}`;
};

export const formatDailyDate = (timestampMs: number): string => {
  const date = new Date(timestampMs);
  return `${date.getDate()}/${date.getMonth() + 1}`;
};

export interface DailyDateRange {
  readonly firstDayMs: number;
  readonly lastDayMs: number;
}

export const formatDailyDateRange = (range: DailyDateRange): string =>
  `${formatDailyDate(range.firstDayMs)}–${formatDailyDate(range.lastDayMs)}`;

/** Calendar windows stay factual at midnight and across daylight-saving changes. */
export const formatDailyWindow = (period: DailyOverviewPeriod): string => {
  const nextDay = new Date(period.startMs);
  nextDay.setHours(0, 0, 0, 0);
  nextDay.setDate(nextDay.getDate() + 1);
  const end =
    period.endMs === nextDay.getTime()
      ? '24:00'
      : formatDailyClock(period.endMs);
  return `${formatDailyClock(period.startMs)}–${end}`;
};

export const formatDailyPeriodLabel = (
  period: DailyOverviewPeriod,
  dayLabel: string,
  dateRange?: DailyDateRange,
): string =>
  `${dayLabel} · ${
    dateRange
      ? formatDailyDateRange(dateRange)
      : formatDailyDate(period.startMs)
  } · ${formatDailyWindow(period)}`;

export interface InsulinDisplaySource {
  readonly quality?: string;
  readonly basalUnits?: number;
  readonly bolusUnits?: number;
  readonly totalUnits?: number;
  readonly basalEstimated?: boolean;
  readonly basalCoveragePercent?: number;
  readonly estimatedBasalUnits?: number;
  readonly estimatedTotalUnits?: number;
}

const recordedUnits = (value: number | undefined): number | undefined =>
  value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

/** Legacy estimates never become a recorded total. Partial basal remains a subtotal. */
export const recordedInsulinDisplay = (source: InsulinDisplaySource) => {
  const available = source.quality !== 'unavailable';
  const basal =
    available && !source.basalEstimated
      ? recordedUnits(source.basalUnits)
      : undefined;
  const bolus = available ? recordedUnits(source.bolusUnits) : undefined;
  const basalComplete =
    basal !== undefined &&
    (source.basalCoveragePercent ??
      (source.quality === 'available' ? 100 : 0)) === 100;
  const recordedSum =
    basal !== undefined && bolus !== undefined && Number.isFinite(basal + bolus)
      ? basal + bolus
      : undefined;
  const subtotal = recordedSum;
  const total =
    source.quality === 'available' && basalComplete && bolus !== undefined
      ? recordedSum
      : undefined;
  const estimatedBasal = available
    ? recordedUnits(source.estimatedBasalUnits)
    : undefined;
  const estimatedSum =
    estimatedBasal !== undefined &&
    bolus !== undefined &&
    Number.isFinite(estimatedBasal + bolus)
      ? estimatedBasal + bolus
      : undefined;
  const estimatedTotal =
    estimatedSum !== undefined &&
    recordedUnits(source.estimatedTotalUnits) !== undefined &&
    Math.abs(estimatedSum - source.estimatedTotalUnits!) <=
      Math.max(1e-6, source.estimatedTotalUnits! * 1e-9)
      ? estimatedSum
      : undefined;
  const basalPercent =
    total !== undefined && total > 0 && basal !== undefined
      ? Math.round((basal / total) * 100)
      : undefined;
  return {
    basal,
    bolus,
    total,
    subtotal,
    estimatedBasal,
    estimatedTotal,
    basalComplete,
    basalPercent,
    bolusPercent: basalPercent === undefined ? undefined : 100 - basalPercent,
    basalCoveragePercent: source.basalCoveragePercent,
  };
};
