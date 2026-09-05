import type {DayGraphPeriod} from '../dayGraph';
import type {
  PreMealAssistanceFacts,
  PreMealAssistanceSettings,
  PreMealAssistanceSnapshot,
  PreMealTrend,
} from './contracts';

const FUTURE_CLOCK_TOLERANCE_MS = 60_000;
const CURRENT_FACT_AGE_MS = 15 * 60_000;
const TRENDS = new Set<PreMealTrend>([
  'double-up',
  'up',
  'forty-five-up',
  'flat',
  'forty-five-down',
  'down',
  'double-down',
]);

const sanitizeFacts = (
  facts: PreMealAssistanceFacts | undefined,
  nowMs: number,
): PreMealAssistanceFacts | undefined => {
  if (
    !facts ||
    !Number.isFinite(facts.observedAtMs) ||
    facts.observedAtMs > nowMs + FUTURE_CLOCK_TOLERANCE_MS
  ) {
    return undefined;
  }
  const glucoseMgDl = facts.glucoseMgDl;
  const iobUnits = facts.iobUnits;
  const cobGrams = facts.cobGrams;
  const trend = facts.trend;
  return {
    observedAtMs: facts.observedAtMs,
    ...(glucoseMgDl !== undefined &&
    Number.isFinite(glucoseMgDl) &&
    glucoseMgDl > 0 &&
    glucoseMgDl <= 1000
      ? {glucoseMgDl}
      : {}),
    ...(trend !== undefined && TRENDS.has(trend) ? {trend} : {}),
    ...(iobUnits !== undefined && Number.isFinite(iobUnits) ? {iobUnits} : {}),
    ...(cobGrams !== undefined && Number.isFinite(cobGrams) && cobGrams >= 0
      ? {cobGrams}
      : {}),
  };
};

export type PreMealAssistanceEligibility =
  | {
      readonly kind: 'hidden';
      readonly reason: 'disabled' | 'not-current-day' | 'not-relevant';
    }
  | {
      readonly kind: 'visible';
      readonly availability: 'current' | 'stale' | 'offline';
      readonly ageMinutes?: number;
      readonly facts?: PreMealAssistanceFacts;
    };

export interface EvaluatePreMealAssistanceInput {
  readonly nowMs: number;
  readonly period: DayGraphPeriod;
  readonly settings: PreMealAssistanceSettings;
  readonly snapshot: PreMealAssistanceSnapshot;
}

export const evaluatePreMealAssistance = (
  input: EvaluatePreMealAssistanceInput,
): PreMealAssistanceEligibility => {
  if (!input.settings.enabled) {
    return {kind: 'hidden', reason: 'disabled'};
  }
  if (
    !Number.isFinite(input.nowMs) ||
    input.nowMs < input.period.dayStartMs ||
    input.nowMs >= input.period.dayEndMs
  ) {
    return {kind: 'hidden', reason: 'not-current-day'};
  }
  const {relevance} = input.snapshot;
  if (
    relevance.kind !== 'active' ||
    !Number.isFinite(relevance.startedAtMs) ||
    !Number.isFinite(relevance.expiresAtMs) ||
    relevance.startedAtMs > input.nowMs ||
    relevance.expiresAtMs <= input.nowMs
  ) {
    return {kind: 'hidden', reason: 'not-relevant'};
  }

  const facts = sanitizeFacts(input.snapshot.facts, input.nowMs);
  const ageMs = facts
    ? Math.max(0, input.nowMs - facts.observedAtMs)
    : undefined;
  const ageMinutes =
    ageMs === undefined ? undefined : Math.floor(ageMs / 60_000);
  const availability =
    input.snapshot.sourceState.kind === 'offline'
      ? 'offline'
      : ageMs === undefined || ageMs > CURRENT_FACT_AGE_MS
        ? 'stale'
        : 'current';

  return {
    kind: 'visible',
    availability,
    ...(ageMinutes === undefined ? {} : {ageMinutes}),
    ...(facts === undefined ? {} : {facts}),
  };
};
