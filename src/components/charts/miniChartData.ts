import type {BgSample} from 'app/types/day_bgs.types';
import type {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {
  buildChartLoadSeries,
  MAX_LOAD_CURSOR_DISTANCE_MS,
  type ChartLoadSample,
  type DatedChartLoadSample,
  type LoadPoint,
} from 'app/utils/chartLoadSeries.utils';
import {buildBasalDeliveryTimeline} from 'app/utils/insulin.utils/basalDeliveryTimeline';

export type MiniChartProps = {
  locale?: 'en' | 'he' | undefined;
  width: number;
  height: number;
  bgSamples: BgSample[];
  /** Authoritative independent load readings. Undefined supports legacy enriched CGM. */
  loadSamples?: readonly ChartLoadSample[] | undefined;
  dataStatus?: ChartDataStatus | undefined;
  xDomain?: [Date, Date] | null | undefined;
  cursorTimeMs?: number | null | undefined;
  margin?:
    | {top: number; right: number; bottom: number; left: number}
    | undefined;
  testID?: string | undefined;
  compact?: boolean | undefined;
};

export type ChartDataStatus = 'available' | 'stale' | 'unavailable';
export type ChartDataAvailability = {
  readonly treatments: ChartDataStatus;
  readonly deviceStatus: ChartDataStatus;
  readonly profile: ChartDataStatus;
};

export function basalChartStatus(
  availability: ChartDataAvailability | undefined,
): ChartDataStatus {
  if (
    !availability ||
    (availability.profile === 'available' &&
      availability.treatments === 'available')
  ) {
    return 'available';
  }
  return availability.profile === 'unavailable' &&
    availability.treatments === 'unavailable'
    ? 'unavailable'
    : 'stale';
}

export function emptyMiniChartText(
  locale: 'en' | 'he' | undefined,
  status: ChartDataStatus,
  emptyText: string,
): string {
  if (status === 'unavailable') {
    return locale === 'he'
      ? 'לא הצלחנו לטעון את הנתונים'
      : 'Could not load this data';
  }
  if (status === 'stale') {
    return locale === 'he'
      ? 'אין נתונים שמורים בטווח הזה'
      : 'No saved data in this range';
  }
  return emptyText;
}

export const resolveMiniLoadSamples = (
  bgSamples: BgSample[],
  loadSamples: readonly ChartLoadSample[] | undefined,
): readonly DatedChartLoadSample[] =>
  loadSamples === undefined
    ? bgSamples
    : loadSamples.map(sample => ({...sample, date: sample.timestampMs}));

/** Select the nearest source sample, even when its load value is explicitly missing. */
export function findMiniLoadSample(
  samples: readonly DatedChartLoadSample[],
  timeMs: number,
  domain?: [Date, Date] | null,
): DatedChartLoadSample | null {
  if (!Number.isFinite(timeMs)) {
    return null;
  }
  let nearest: DatedChartLoadSample | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (const sample of samples) {
    if (
      !Number.isFinite(sample.date) ||
      (domain && (sample.date < +domain[0] || sample.date > +domain[1]))
    ) {
      continue;
    }
    const candidateDistance = Math.abs(sample.date - timeMs);
    if (candidateDistance < distance) {
      nearest = sample;
      distance = candidateDistance;
    }
  }
  return distance <= MAX_LOAD_CURSOR_DISTANCE_MS ? nearest : null;
}

export function resolveMiniDomain(
  samples: readonly {date: number}[],
  domain?: [Date, Date] | null,
): [Date, Date] {
  if (domain && Number.isFinite(+domain[0]) && +domain[1] > +domain[0]) {
    return domain;
  }
  const times = samples.map(sample => sample.date).filter(Number.isFinite);
  if (!times.length) {
    return [new Date(0), new Date(1)];
  }
  const start = Math.min(...times);
  const end = Math.max(...times);
  return [new Date(start), new Date(end > start ? end : start + 1)];
}

/** A gap means unknown, so it must never draw as zero or as a connecting line. */
export function buildMiniLoadSegments(
  samples: readonly DatedChartLoadSample[],
  domain: [Date, Date],
  kind: 'iob' | 'cob',
): LoadPoint[][] {
  const series = buildChartLoadSeries(samples, domain);
  const points = kind === 'iob' ? series.iobPoints : series.cobPoints;
  const byTime = new Map(points.map(point => [point.x, point]));
  const times = [...new Set(samples.map(sample => sample.date))]
    .filter(
      time => Number.isFinite(time) && time >= +domain[0] && time <= +domain[1],
    )
    .sort((a, b) => a - b);
  const segments: LoadPoint[][] = [];
  let current: LoadPoint[] = [];
  for (const time of times) {
    const point = byTime.get(time);
    if (!point) {
      current = [];
      continue;
    }
    const previous = current[current.length - 1];
    if (!previous || time - previous.x > 10 * 60_000) {
      current = [];
      segments.push(current);
    }
    current.push(point);
  }
  return segments;
}

export function buildMiniBasalSegments(
  profile: BasalProfile | undefined,
  insulin: InsulinDataEntry[] | undefined,
  domain: [Date, Date],
) {
  const validProfile = (profile ?? []).filter(
    item => Number.isFinite(item.value) && item.value >= 0,
  );
  const validInsulin = (insulin ?? []).filter(
    item =>
      item.type !== 'tempBasal' ||
      item.duration === 0 ||
      (typeof item.rate === 'number' &&
        Number.isFinite(item.rate) &&
        item.rate >= 0),
  );
  return buildBasalDeliveryTimeline({
    basalProfile: validProfile,
    insulinData: validInsulin,
    startDate: domain[0],
    endDate: domain[1],
  }).filter(
    segment => segment.source !== 'scheduled' || validProfile.length > 0,
  );
}

export function buildMiniBolusPoints(
  insulin: InsulinDataEntry[] | undefined,
  domain: [Date, Date],
): LoadPoint[] {
  // Keep each delivered dose independent; temporal neighbours are not one dose.
  return (insulin ?? [])
    .flatMap(entry => {
      const x = Date.parse(entry.timestamp ?? entry.startTime ?? '');
      return entry.type === 'bolus' &&
        Number.isFinite(x) &&
        x >= +domain[0] &&
        x <= +domain[1] &&
        typeof entry.amount === 'number' &&
        Number.isFinite(entry.amount) &&
        entry.amount > 0
        ? [{x, y: entry.amount}]
        : [];
    })
    .sort((a, b) => a.x - b.x);
}

export function formatMiniValue(value: number): string {
  return Number.isFinite(value)
    ? value
        .toFixed(2)
        .replace(/\.00$/, '')
        .replace(/(\.\d)0$/, '$1')
    : '—';
}

/** Two or three useful intervals, with round labels and room for every value. */
export function niceMiniAxis(input: [number, number]): {
  domain: [number, number];
  ticks: number[];
} {
  const min = Math.min(0, input[0]);
  const max = Math.max(0, input[1]);
  const target = (max - min || 1) / 2;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  const fraction = target / magnitude;
  const multiple =
    [1, 2, 2.5, 3, 4, 5, 10].find(value => value >= fraction) ?? 10;
  const step = multiple * magnitude;
  const first = Math.floor(min / step);
  const last = Math.max(first + 1, Math.ceil(max / step));
  const ticks = Array.from({length: last - first + 1}, (_, index) =>
    Number(((first + index) * step).toPrecision(10)),
  );
  return {domain: [ticks[0]!, ticks[ticks.length - 1]!], ticks};
}

export function formatMiniTime(timeMs: number): string {
  const time = new Date(timeMs);
  return `${String(time.getHours()).padStart(2, '0')}:${String(
    time.getMinutes(),
  ).padStart(2, '0')}`;
}
