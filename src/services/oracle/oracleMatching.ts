import {BgSample} from 'app/types/day_bgs.types';
import {
  OracleCachedBgEntry,
  OracleCachedDeviceStatus,
  OracleCachedTreatment,
  OracleEventKind,
  OracleInsights,
  OracleMatchTrace,
  OracleSeriesPoint,
  OracleStrategyCard,
} from './oracleTypes';

import {
  ORACLE_ACTION_WINDOW_MIN,
  ORACLE_BG_TOLERANCE_FIXED,
  ORACLE_BG_TOLERANCE_PERCENT,
  ORACLE_COB_TOLERANCE_G,
  ORACLE_CHART_FUTURE_MIN,
  ORACLE_CHART_PAST_MIN,
  ORACLE_INTERPOLATION_MAX_GAP_MIN,
  ORACLE_DISCLAIMER_TEXT,
  ORACLE_IOB_TOLERANCE_U,
  ORACLE_LOAD_MAX_MATCH_DISTANCE_MIN,
  ORACLE_MINUTES_PER_DAY,
  ORACLE_MINUTE_MS,
  ORACLE_SLOPE_POINTS_DEFAULT,
  ORACLE_SLOPE_POINTS_MAX,
  ORACLE_SLOPE_POINTS_MIN,
  ORACLE_SLOPE_TOLERANCE,
  ORACLE_SLOPE_WINDOW_MIN,
  ORACLE_TARGET_BG_IDEAL_2H,
  ORACLE_TARGET_BG_MAX_2H,
  ORACLE_TARGET_BG_MIN_2H,
  ORACLE_TREND_BUCKET_THRESHOLD,
  ORACLE_TIME_WINDOW_MIN,
} from './oracleConstants';

const TRACE_NEAREST_TOLERANCE_MIN = 10;
const SLOPE_DEN_EPSILON = 1e-9;

function minutesFromMidnightLocal(ts: number): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

function circularMinuteDiff(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, ORACLE_MINUTES_PER_DAY - diff);
}

function lowerBoundByDate(entries: Array<{date: number}>, ts: number): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].date < ts) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function lowerBoundByTs(entries: Array<{ts: number}>, ts: number): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].ts < ts) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function isSortedBy<T>(items: T[], getKey: (v: T) => number): boolean {
  for (let i = 1; i < items.length; i++) {
    if (getKey(items[i]) < getKey(items[i - 1])) return false;
  }
  return true;
}

function interpolateSgvAt(
  entries: OracleCachedBgEntry[],
  ts: number,
  maxGapMin = ORACLE_INTERPOLATION_MAX_GAP_MIN,
): number | null {
  if (!entries.length) return null;

  const i = lowerBoundByDate(entries, ts);
  const prev = i > 0 ? entries[i - 1] : null;
  const next = i < entries.length ? entries[i] : null;

  const maxGapMs = maxGapMin * ORACLE_MINUTE_MS;

  if (prev && Math.abs(prev.date - ts) <= maxGapMs && (!next || next.date === prev.date)) {
    return prev.sgv;
  }

  if (next && Math.abs(next.date - ts) <= maxGapMs && !prev) {
    return next.sgv;
  }

  if (!prev || !next) return null;

  const span = next.date - prev.date;
  if (span <= 0) return null;
  if (Math.abs(prev.date - ts) > maxGapMs || Math.abs(next.date - ts) > maxGapMs) return null;

  const t = (ts - prev.date) / span;
  return prev.sgv + t * (next.sgv - prev.sgv);
}

export function slopeAt(entries: OracleCachedBgEntry[], anchorTs: number): number | null {
  return slopeAtLeastSquares(entries, anchorTs);
}

function clampInt(n: unknown, min: number, max: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : min;
  return Math.max(min, Math.min(max, v));
}

/**
 * Computes slope via least-squares regression over N sample points in the last ORACLE_SLOPE_WINDOW_MIN.
 *
 * Why: A two-point slope is extremely sensitive to CGM noise/jumps.
 */
export function slopeAtLeastSquares(
  entries: OracleCachedBgEntry[],
  anchorTs: number,
  opts?: {
    /** Number of sample points ("dots") to use across the window. */
    sampleCount?: number;
  },
): number | null {
  const sampleCount = clampInt(
    opts?.sampleCount ?? ORACLE_SLOPE_POINTS_DEFAULT,
    ORACLE_SLOPE_POINTS_MIN,
    ORACLE_SLOPE_POINTS_MAX,
  );

  // Choose evenly spaced timestamps across [T-15m .. T], inclusive.
  const points: Array<{x: number; y: number}> = [];
  const windowMs = ORACLE_SLOPE_WINDOW_MIN * ORACLE_MINUTE_MS;
  const denom = Math.max(1, sampleCount - 1);

  for (let i = 0; i < sampleCount; i++) {
    const t = anchorTs - ((denom - i) / denom) * windowMs;
    const sgv = interpolateSgvAt(entries, t);
    if (sgv == null) continue;
    const xMin = (t - anchorTs) / ORACLE_MINUTE_MS; // minutes relative to anchor (negative..0)
    points.push({x: xMin, y: sgv});
  }

  if (points.length < 2) return null;

  // Least-squares slope: cov(x,y) / var(x)
  let sumX = 0;
  let sumY = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
  }
  const meanX = sumX / points.length;
  const meanY = sumY / points.length;

  let num = 0;
  let den = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    num += dx * dy;
    den += dx * dx;
  }
  if (den <= SLOPE_DEN_EPSILON) return null;
  return num / den;
}

/**
 * Buckets a slope (mg/dL/min) into a stable event kind.
 *
 * This is intentionally coarse so the event picker doesn't jitter.
 */
export function trendBucket(slope: number): OracleEventKind {
  // Keep stable relatively small so noisy lines don't flip buckets too easily.
  if (slope > ORACLE_TREND_BUCKET_THRESHOLD) return 'rising';
  if (slope < -ORACLE_TREND_BUCKET_THRESHOLD) return 'falling';
  return 'stable';
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function buildTrace(
  entries: OracleCachedBgEntry[],
  anchorTs: number,
  anchorSgv: number,
  slope: number,
): OracleMatchTrace {
  const points: OracleSeriesPoint[] = [];

  for (let tMin = -ORACLE_CHART_PAST_MIN; tMin <= ORACLE_CHART_FUTURE_MIN; tMin += 1) {
    const ts = anchorTs + tMin * ORACLE_MINUTE_MS;
    const sgv = interpolateSgvAt(entries, ts);
    if (sgv === null) continue;
    points.push({tMin, sgv});
  }

  return {anchorTs, anchorSgv, points, slope};
}

function getSgvAtMinute(points: OracleSeriesPoint[], tMin: number): number | null {
  let exact = points.find(p => p.tMin === tMin);
  if (exact) return exact.sgv;

  // Best-effort: pick nearest within a few minutes.
  let best: OracleSeriesPoint | null = null;
  for (const p of points) {
    const d = Math.abs(p.tMin - tMin);
    if (d > TRACE_NEAREST_TOLERANCE_MIN) continue;
    if (!best || d < Math.abs(best.tMin - tMin)) best = p;
  }
  return best ? best.sgv : null;
}

/**
 * Best-effort load (IOB/COB) lookup at a timestamp.
 *
 * Picks the nearest device-status point within a small time window.
 */
export function findLoadAtTs(
  deviceStatus: OracleCachedDeviceStatus[],
  ts: number,
): {iob: number | null; cob: number | null} {
  if (!deviceStatus.length) return {iob: null, cob: null};
  const i = lowerBoundByTs(deviceStatus, ts);
  const prev = i > 0 ? deviceStatus[i - 1] : null;
  const next = i < deviceStatus.length ? deviceStatus[i] : null;

  const maxGapMs = ORACLE_LOAD_MAX_MATCH_DISTANCE_MIN * ORACLE_MINUTE_MS;
  const prevDist = prev ? Math.abs(ts - prev.ts) : Number.POSITIVE_INFINITY;
  const nextDist = next ? Math.abs(ts - next.ts) : Number.POSITIVE_INFINITY;
  const best = prevDist <= nextDist ? prev : next;
  const bestDist = Math.min(prevDist, nextDist);
  if (!best || bestDist > maxGapMs) return {iob: null, cob: null};

  return {
    iob: typeof best.iob === 'number' ? best.iob : null,
    cob: typeof best.cob === 'number' ? best.cob : null,
  };
}

/**
 * Computes time-in-range across a minute window.
 *
 * Uses resampled trace points (1-minute resolution where available).
 */
function computeTir(
  points: OracleSeriesPoint[],
  tMinStart: number,
  tMinEnd: number,
): number | null {
  const window = points.filter(p => p.tMin >= tMinStart && p.tMin <= tMinEnd);
  if (!window.length) return null;
  const inRange = window.filter(
    p => p.sgv >= ORACLE_TARGET_BG_MIN_2H && p.sgv <= ORACLE_TARGET_BG_MAX_2H,
  ).length;
  return inRange / window.length;
}

function summarizeActions(actions: {insulin: number; carbs: number}): {
  key: string;
  title: string;
  actionSummary: string;
} {
  const insulin = actions.insulin;
  const carbs = actions.carbs;

  if (insulin > 0) {
    if (insulin < 1) {
      return {
        key: 'insulin.tiny',
        title: 'Small insulin (recorded)',
        actionSummary: `Total insulin recorded in first 30m: ${insulin.toFixed(1)}u`,
      };
    }
    if (insulin >= 1 && insulin <= 2) {
      return {
        key: 'insulin.small',
        title: 'Moderate insulin (recorded)',
        actionSummary: `Total insulin recorded in first 30m: ${insulin.toFixed(1)}u`,
      };
    }
    if (insulin > 3) {
      return {
        key: 'insulin.large',
        title: 'Higher insulin (recorded)',
        actionSummary: `Total insulin recorded in first 30m: ${insulin.toFixed(1)}u`,
      };
    }
    return {
      key: 'insulin.other',
      title: 'Insulin (recorded)',
      actionSummary: `Total insulin recorded in first 30m: ${insulin.toFixed(1)}u`,
    };
  }

  if (carbs > 0) {
    return {
      key: 'carbs',
      title: 'Carbs (recorded)',
      actionSummary: `Total carbs recorded in first 30m: ${carbs.toFixed(0)}g`,
    };
  }

  return {
    key: 'none',
    title: 'No recorded carbs/insulin',
    actionSummary: 'No carbs/insulin recorded in first 30m',
  };
}

function buildStrategies(matches: OracleMatchTrace[]): OracleStrategyCard[] {
  const groups = new Map<
    string,
    {title: string; actionSummary: string; traces: OracleMatchTrace[]}
  >();

  for (const m of matches) {
    const actions = m.actions30m ?? {insulin: 0, carbs: 0};
    const meta = summarizeActions(actions);
    const existing = groups.get(meta.key);
    if (existing) existing.traces.push(m);
    else groups.set(meta.key, {title: meta.title, actionSummary: meta.actionSummary, traces: [m]});
  }

  const cards: OracleStrategyCard[] = [];
  for (const [key, g] of groups.entries()) {
    const bg2h: number[] = [];
    for (const m of g.traces) {
      const v = getSgvAtMinute(m.points, 120);
      if (typeof v === 'number') bg2h.push(v);
    }

    const avgBg2h = bg2h.length ? bg2h.reduce((a, b) => a + b, 0) / bg2h.length : null;
    const successRate = bg2h.length
      ? bg2h.filter(v => v >= ORACLE_TARGET_BG_MIN_2H && v <= ORACLE_TARGET_BG_MAX_2H).length /
        bg2h.length
      : null;

    cards.push({
      key,
      title: g.title,
      actionSummary: g.actionSummary,
      count: g.traces.length,
      avgBg2h: avgBg2h == null ? null : Math.round(avgBg2h),
      successRate: successRate == null ? null : Number(successRate.toFixed(2)),
    });
  }

  cards.sort((a, b) => b.count - a.count);
  const top = cards.slice(0, 3);

  // Mark best by success rate, then closeness to ideal.
  let bestIdx = -1;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < top.length; i++) {
    const c = top[i];
    const sr = c.successRate ?? -1;
    const avg = c.avgBg2h;
    const closeness =
      typeof avg === 'number' ? -Math.abs(avg - ORACLE_TARGET_BG_IDEAL_2H) : -9999;
    const score = sr * 1000 + closeness;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) top[bestIdx] = {...top[bestIdx], isBest: true};

  return top;
}

/**
 * Computes Oracle insights given an anchor and the local cache.
 *
 * This function is pure and synchronous to keep UI recomputation predictable.
 */
export function computeOracleInsights(params: {
  anchor: BgSample;
  recentBg: BgSample[];
  history: OracleCachedBgEntry[];
  treatments: OracleCachedTreatment[];
  deviceStatus: OracleCachedDeviceStatus[];
  /** When true, also require similar IOB/COB at the anchor (when available). */
  includeLoadInMatching?: boolean;
  /** Number of sample points ("dots") for slope regression. */
  slopePointCount?: number;
}): OracleInsights {
  const {anchor, recentBg, history, treatments, deviceStatus} = params;
  const includeLoadInMatching = params.includeLoadInMatching !== false;
  const slopePointCount = params.slopePointCount;

  // Defensive: caches may contain null/partial items across app upgrades.
  const historyClean: OracleCachedBgEntry[] = Array.isArray(history)
    ? (history.filter(
        e =>
          !!e &&
          typeof (e as any).date === 'number' &&
          Number.isFinite((e as any).date) &&
          typeof (e as any).sgv === 'number' &&
          Number.isFinite((e as any).sgv),
      ) as OracleCachedBgEntry[])
    : [];

  const treatmentsClean: OracleCachedTreatment[] = Array.isArray(treatments)
    ? (treatments.filter(
        t => !!t && typeof (t as any).ts === 'number' && Number.isFinite((t as any).ts),
      ) as OracleCachedTreatment[])
    : [];

  const deviceStatusClean: OracleCachedDeviceStatus[] = Array.isArray(deviceStatus)
    ? (deviceStatus.filter(
        d => !!d && typeof (d as any).ts === 'number' && Number.isFinite((d as any).ts),
      ) as OracleCachedDeviceStatus[])
    : [];

  const sortedHistory = isSortedBy(historyClean, e => e.date)
    ? historyClean
    : [...historyClean].sort((a, b) => a.date - b.date);
  const sortedTreatments = isSortedBy(treatmentsClean, t => t.ts)
    ? treatmentsClean
    : [...treatmentsClean].sort((a, b) => a.ts - b.ts);
  const sortedDeviceStatus = isSortedBy(deviceStatusClean, d => d.ts)
    ? deviceStatusClean
    : [...deviceStatusClean].sort((a, b) => a.ts - b.ts);

  const nowTs = anchor.date;
  const nowSgv = anchor.sgv;

  // Current slope from recent BG window (fallback to history if recent is empty).
  const recentSlim: OracleCachedBgEntry[] = (Array.isArray(recentBg) ? recentBg : [])
    .filter(e => typeof e?.date === 'number' && Number.isFinite(e.date) && typeof e?.sgv === 'number' && Number.isFinite(e.sgv))
    .map(e => ({date: e.date, sgv: e.sgv}))
    .sort((a, b) => a.date - b.date);

  const slopeSource = recentSlim.length ? recentSlim : sortedHistory;
  const currentSlope =
    slopeAtLeastSquares(slopeSource, nowTs, {sampleCount: slopePointCount}) ?? 0;
  const currentBucket = trendBucket(currentSlope);

  const nowMinutes = minutesFromMidnightLocal(nowTs);
  const bgTol = Math.max(ORACLE_BG_TOLERANCE_FIXED, nowSgv * ORACLE_BG_TOLERANCE_PERCENT);

  const matches: OracleMatchTrace[] = [];

  const anchorLoad = findLoadAtTs(sortedDeviceStatus, nowTs);

  // Iterate history; for performance, skip entries outside the chart window
  // availability (need at least -15m and +4h worth of data).
  for (const entry of sortedHistory) {
    const t0 = entry.date;

    // We only want to show *previous* events relative to the anchor.
    if (t0 >= nowTs) continue;

    // Must be able to compute slope for the past entry.
    const pastSlope = slopeAtLeastSquares(sortedHistory, t0, {sampleCount: slopePointCount});
    if (pastSlope === null) continue;

    // Filter A: Time of day.
    const pastMinutes = minutesFromMidnightLocal(t0);
    if (circularMinuteDiff(nowMinutes, pastMinutes) > ORACLE_TIME_WINDOW_MIN) continue;

    // Filter B: Glucose proximity.
    if (Math.abs(nowSgv - entry.sgv) > bgTol) continue;

    // Filter C: Trend alignment.
    const pastBucket = trendBucket(pastSlope);
    if (pastBucket !== currentBucket) continue;
    if (Math.abs(currentSlope - pastSlope) > ORACLE_SLOPE_TOLERANCE) continue;

    // Ensure we can draw a future trace (at least some points past +4h).
    const endNeedTs = t0 + ORACLE_CHART_FUTURE_MIN * ORACLE_MINUTE_MS;
    const endIdx = lowerBoundByDate(sortedHistory, endNeedTs);
    if (endIdx >= sortedHistory.length) continue;

    const matchLoad = findLoadAtTs(sortedDeviceStatus, t0);
    if (includeLoadInMatching) {
      if (
        typeof anchorLoad.iob === 'number' &&
        typeof matchLoad.iob === 'number' &&
        Math.abs(anchorLoad.iob - matchLoad.iob) > ORACLE_IOB_TOLERANCE_U
      ) {
        continue;
      }

      if (
        typeof anchorLoad.cob === 'number' &&
        typeof matchLoad.cob === 'number' &&
        Math.abs(anchorLoad.cob - matchLoad.cob) > ORACLE_COB_TOLERANCE_G
      ) {
        continue;
      }
    }

    const trace = buildTrace(sortedHistory, t0, entry.sgv, pastSlope);

    // Require at least a minimal amount of future data to avoid misleading one-point "matches".
    let futurePoints = 0;
    for (const p of trace.points) {
      if (p.tMin > 0) futurePoints += 1;
      if (futurePoints >= 10) break;
    }
    if (futurePoints < 10) continue;

    const tir2h = computeTir(trace.points, 0, 120);

    // Attach treatment markers and 30m action summary.
    const actionEndTs = t0 + ORACLE_ACTION_WINDOW_MIN * ORACLE_MINUTE_MS;
    const startIdx = lowerBoundByTs(sortedTreatments, t0);
    const endIdx2 = lowerBoundByTs(sortedTreatments, actionEndTs + 1);
    const relevant = sortedTreatments.slice(startIdx, endIdx2);
    let insulin = 0;
    let carbs = 0;
    let bolusCount = 0;
    let carbsCount = 0;
    const markers: Array<{tMin: number; kind: 'insulin' | 'carbs'}> = [];
    for (const t of relevant) {
      const tMin = Math.round((t.ts - t0) / ORACLE_MINUTE_MS);
      if (tMin < 0 || tMin > ORACLE_ACTION_WINDOW_MIN) continue;
      if (typeof t.insulin === 'number' && t.insulin > 0) {
        insulin += t.insulin;
        bolusCount += 1;
        markers.push({tMin, kind: 'insulin'});
      }
      if (typeof t.carbs === 'number' && t.carbs > 0) {
        carbs += t.carbs;
        carbsCount += 1;
        markers.push({tMin, kind: 'carbs'});
      }
    }

    matches.push({
      ...trace,
      iob: typeof matchLoad.iob === 'number' ? matchLoad.iob : null,
      cob: typeof matchLoad.cob === 'number' ? matchLoad.cob : null,
      treatments30m: relevant.length ? relevant : undefined,
      actions30m: {insulin: Number(insulin.toFixed(2)), carbs: Number(carbs.toFixed(2))},
      actionCounts30m: {boluses: bolusCount, carbs: carbsCount},
      tir2h,
      actionMarkers: markers.length ? markers : undefined,
    });
  }

  // Prefer most recent matches first.
  matches.sort((a, b) => b.anchorTs - a.anchorTs);

  // Build current series for [-2h..0]
  const currentSeries: OracleSeriesPoint[] = [];
  const currentWindow = recentSlim.length ? recentSlim : history;

  for (const e of currentWindow) {
    const tMin = Math.round((e.date - nowTs) / ORACLE_MINUTE_MS);
    if (tMin < -ORACLE_CHART_PAST_MIN || tMin > 0) continue;
    currentSeries.push({tMin, sgv: e.sgv});
  }

  // Ensure t=0 point exists.
  currentSeries.push({tMin: 0, sgv: nowSgv});
  currentSeries.sort((a, b) => a.tMin - b.tMin);

  // Deduplicate by minute (keep the last value for each minute).
  const deduped = new Map<number, number>();
  for (const p of currentSeries) deduped.set(p.tMin, p.sgv);
  currentSeries.length = 0;
  for (const [tMin, sgv] of deduped.entries()) currentSeries.push({tMin, sgv});
  currentSeries.sort((a, b) => a.tMin - b.tMin);

  // Median series for [0..+4h]
  const medianSeries: OracleSeriesPoint[] = [];
  for (let tMin = 0; tMin <= ORACLE_CHART_FUTURE_MIN; tMin += 1) {
    const values: number[] = [];
    for (const m of matches) {
      const p = m.points.find(pp => pp.tMin === tMin);
      if (p) values.push(p.sgv);
    }
    if (values.length === 0) continue;
    medianSeries.push({tMin, sgv: median(values)});
  }

  const strategies = buildStrategies(matches);

  return {
    matchCount: matches.length,
    matches,
    anchorIob: typeof anchorLoad.iob === 'number' ? anchorLoad.iob : null,
    anchorCob: typeof anchorLoad.cob === 'number' ? anchorLoad.cob : null,
    usedLoadInMatching: includeLoadInMatching,
    currentSeries,
    medianSeries,
    strategies,
    disclaimerText: ORACLE_DISCLAIMER_TEXT,
  };
}
