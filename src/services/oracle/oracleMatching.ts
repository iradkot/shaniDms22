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

const MINUTES_PER_DAY = 24 * 60;
const MINUTE_MS = 60 * 1000;

const CHART_PAST_MIN = 120; // -2h
const CHART_FUTURE_MIN = 240; // +4h
const SLOPE_WINDOW_MIN = 15;

const TIME_WINDOW_MIN = 90;
const BG_TOLERANCE_FIXED = 15;
const BG_TOLERANCE_PERCENT = 0.1;
const SLOPE_TOLERANCE = 2; // mg/dL/min

const ACTION_WINDOW_MIN = 30;
const IOB_TOLERANCE_U = 1.0;
const LOAD_MAX_MATCH_DISTANCE_MIN = 10;

const TARGET_BG_MIN_2H = 70;
const TARGET_BG_MAX_2H = 140;
const TARGET_BG_IDEAL_2H = 110;

function minutesFromMidnightLocal(ts: number): number {
  const d = new Date(ts);
  return d.getHours() * 60 + d.getMinutes();
}

function circularMinuteDiff(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, MINUTES_PER_DAY - diff);
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

function interpolateSgvAt(
  entries: OracleCachedBgEntry[],
  ts: number,
  maxGapMin = 10,
): number | null {
  if (!entries.length) return null;

  const i = lowerBoundByDate(entries, ts);
  const prev = i > 0 ? entries[i - 1] : null;
  const next = i < entries.length ? entries[i] : null;

  const maxGapMs = maxGapMin * MINUTE_MS;

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
  const prevTs = anchorTs - SLOPE_WINDOW_MIN * MINUTE_MS;
  const s0 = interpolateSgvAt(entries, anchorTs);
  const sPrev = interpolateSgvAt(entries, prevTs);
  if (s0 === null || sPrev === null) return null;

  // Use the nominal 15m window (PRD). Interpolation already accounts for uneven sampling.
  return (s0 - sPrev) / SLOPE_WINDOW_MIN;
}

export function trendBucket(slope: number): OracleEventKind {
  // Keep stable relatively small so noisy lines don't flip buckets too easily.
  if (slope > 0.5) return 'rising';
  if (slope < -0.5) return 'falling';
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

  for (let tMin = -CHART_PAST_MIN; tMin <= CHART_FUTURE_MIN; tMin += 1) {
    const ts = anchorTs + tMin * MINUTE_MS;
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
    if (d > 10) continue;
    if (!best || d < Math.abs(best.tMin - tMin)) best = p;
  }
  return best ? best.sgv : null;
}

/**
 * Best-effort load (IOB/COB) lookup at a timestamp.
 *
 * Picks the nearest device-status point within a small time window.
 */
function findLoadAtTs(
  deviceStatus: OracleCachedDeviceStatus[],
  ts: number,
): {iob: number | null; cob: number | null} {
  if (!deviceStatus.length) return {iob: null, cob: null};
  const i = lowerBoundByTs(deviceStatus, ts);
  const prev = i > 0 ? deviceStatus[i - 1] : null;
  const next = i < deviceStatus.length ? deviceStatus[i] : null;

  const maxGapMs = LOAD_MAX_MATCH_DISTANCE_MIN * MINUTE_MS;
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
    p => p.sgv >= TARGET_BG_MIN_2H && p.sgv <= TARGET_BG_MAX_2H,
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
    if (insulin >= 1 && insulin <= 2) {
      return {
        key: 'correction.small',
        title: 'Small correction',
        actionSummary: `${insulin.toFixed(1)}U insulin in first 30m`,
      };
    }
    if (insulin > 3) {
      return {
        key: 'correction.aggressive',
        title: 'Aggressive correction',
        actionSummary: `${insulin.toFixed(1)}U insulin in first 30m`,
      };
    }
    return {
      key: 'correction.other',
      title: 'Correction',
      actionSummary: `${insulin.toFixed(1)}U insulin in first 30m`,
    };
  }

  if (carbs > 0) {
    return {
      key: 'carbs',
      title: 'Carbs',
      actionSummary: `${carbs.toFixed(0)}g carbs in first 30m`,
    };
  }

  return {
    key: 'none',
    title: 'No action',
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
      ? bg2h.filter(v => v >= TARGET_BG_MIN_2H && v <= TARGET_BG_MAX_2H).length / bg2h.length
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
    const closeness = typeof avg === 'number' ? -Math.abs(avg - TARGET_BG_IDEAL_2H) : -9999;
    const score = sr * 1000 + closeness;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestIdx >= 0) top[bestIdx] = {...top[bestIdx], isBest: true};

  return top;
}

export function computeOracleInsights(params: {
  anchor: BgSample;
  recentBg: BgSample[];
  history: OracleCachedBgEntry[];
  treatments: OracleCachedTreatment[];
  deviceStatus: OracleCachedDeviceStatus[];
}): OracleInsights {
  const {anchor, recentBg, history, treatments, deviceStatus} = params;

  const nowTs = anchor.date;
  const nowSgv = anchor.sgv;

  // Current slope from recent BG window (fallback to history if recent is empty).
  const recentSlim: OracleCachedBgEntry[] = (recentBg ?? [])
    .filter(e => typeof e?.date === 'number' && typeof e?.sgv === 'number')
    .map(e => ({date: e.date, sgv: e.sgv}))
    .sort((a, b) => a.date - b.date);

  const slopeSource = recentSlim.length ? recentSlim : history;
  const currentSlope = slopeAt(slopeSource, nowTs) ?? 0;
  const currentBucket = trendBucket(currentSlope);

  const nowMinutes = minutesFromMidnightLocal(nowTs);
  const bgTol = Math.max(BG_TOLERANCE_FIXED, nowSgv * BG_TOLERANCE_PERCENT);

  const matches: OracleMatchTrace[] = [];

  const anchorLoad = findLoadAtTs(deviceStatus ?? [], nowTs);

  // Iterate history; for performance, skip entries outside the chart window
  // availability (need at least -15m and +4h worth of data).
  for (const entry of history) {
    const t0 = entry.date;

    // We only want to show *previous* events relative to the anchor.
    if (t0 >= nowTs) continue;

    // Must be able to compute slope for the past entry.
    const pastSlope = slopeAt(history, t0);
    if (pastSlope === null) continue;

    // Filter A: Time of day.
    const pastMinutes = minutesFromMidnightLocal(t0);
    if (circularMinuteDiff(nowMinutes, pastMinutes) > TIME_WINDOW_MIN) continue;

    // Filter B: Glucose proximity.
    if (Math.abs(nowSgv - entry.sgv) > bgTol) continue;

    // Filter C: Trend alignment.
    const pastBucket = trendBucket(pastSlope);
    if (pastBucket !== currentBucket) continue;
    if (Math.abs(currentSlope - pastSlope) > SLOPE_TOLERANCE) continue;

    // Ensure we can draw a future trace (at least some points past +4h).
    const endNeedTs = t0 + CHART_FUTURE_MIN * MINUTE_MS;
    const endIdx = lowerBoundByDate(history, endNeedTs);
    if (endIdx >= history.length) continue;

    const matchLoad = findLoadAtTs(deviceStatus ?? [], t0);
    if (
      typeof anchorLoad.iob === 'number' &&
      typeof matchLoad.iob === 'number' &&
      Math.abs(anchorLoad.iob - matchLoad.iob) > IOB_TOLERANCE_U
    ) {
      continue;
    }

    const trace = buildTrace(history, t0, entry.sgv, pastSlope);

    const tir2h = computeTir(trace.points, 0, 120);

    // Attach treatment markers and 30m action summary.
    const actionEndTs = t0 + ACTION_WINDOW_MIN * MINUTE_MS;
    const relevant = (treatments ?? []).filter(t => t.ts >= t0 && t.ts <= actionEndTs);
    let insulin = 0;
    let carbs = 0;
    let bolusCount = 0;
    let carbsCount = 0;
    const markers: Array<{tMin: number; kind: 'insulin' | 'carbs'}> = [];
    for (const t of relevant) {
      const tMin = Math.round((t.ts - t0) / MINUTE_MS);
      if (tMin < 0 || tMin > ACTION_WINDOW_MIN) continue;
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
    const tMin = Math.round((e.date - nowTs) / MINUTE_MS);
    if (tMin < -CHART_PAST_MIN || tMin > 0) continue;
    currentSeries.push({tMin, sgv: e.sgv});
  }

  // Ensure t=0 point exists.
  currentSeries.push({tMin: 0, sgv: nowSgv});
  currentSeries.sort((a, b) => a.tMin - b.tMin);

  // Median series for [0..+4h]
  const medianSeries: OracleSeriesPoint[] = [];
  for (let tMin = 0; tMin <= CHART_FUTURE_MIN; tMin += 1) {
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
    currentSeries,
    medianSeries,
    strategies,
    disclaimerText:
      'Informational only. Not medical advice. Always follow your clinician’s guidance and your therapy settings.',
  };
}
