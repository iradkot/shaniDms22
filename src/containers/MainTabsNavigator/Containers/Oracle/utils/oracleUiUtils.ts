import {getTimeInMinutes} from 'app/utils/datetime.utils';

const MINUTES_PER_DAY = 24 * 60;

export function formatOracleKind(kind: string): string {
  if (kind === 'rising') return 'Rising';
  if (kind === 'falling') return 'Falling';
  if (kind === 'stable') return 'Stable';
  return kind;
}

function minutesForwardDiff(fromMinutes: number, toMinutes: number): number {
  return (toMinutes - fromMinutes + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

/**
 * Returns whether a candidate event time-of-day occurs within the next 2 hours
 * relative to the currently investigated anchor time-of-day (local time).
 */
export function isWithinNext2Hours(params: {anchorTs: number; candidateTs: number}): boolean {
  const anchorMin = getTimeInMinutes(new Date(params.anchorTs));
  const candidateMin = getTimeInMinutes(new Date(params.candidateTs));
  return minutesForwardDiff(anchorMin, candidateMin) <= 120;
}

/** Formats 0..1 ratio as a human percent string. */
export function formatPercent(p: number | null | undefined): string {
  if (typeof p !== 'number' || !Number.isFinite(p)) return '—';
  return `${Math.round(p * 100)}%`;
}

/** Formats BG for compact UI display (rounded, or em dash when missing). */
export function fmtBg(v: number | null): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v)) : '—';
}

export function fmtIob(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${v.toFixed(1)}u` : '—';
}

export function fmtCob(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)}g` : '—';
}

export function summarizeMatch(points: Array<{tMin: number; sgv: number}>): {
  min2h: number | null;
  max4h: number | null;
} {
  const in2h = points.filter(p => p.tMin >= 0 && p.tMin <= 120).map(p => p.sgv);
  const in4h = points.filter(p => p.tMin >= 0 && p.tMin <= 240).map(p => p.sgv);

  return {
    min2h: in2h.length ? Math.min(...in2h) : null,
    max4h: in4h.length ? Math.max(...in4h) : null,
  };
}
