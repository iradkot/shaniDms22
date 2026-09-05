import type {TrendsEvidenceMetadata} from './evidence';
import type {TrendsPeriod} from './overview';
import {TrendsOverviewInputError, assertTrendsPeriod} from './sampleSet';

export const THERAPY_CONTEXT_MIN_COVERAGE_PERCENT = 70;

export type TherapyContextSourceReliability = 'unverified' | 'reliable';

export interface TherapyContextQualityGateInput {
  readonly sourceReliability: TherapyContextSourceReliability;
  readonly coveragePercent: number;
}

export type TherapyContextUnavailableReason =
  | 'source-unverified'
  | 'coverage-low';

export interface TherapyContextAvailability {
  readonly available: boolean;
  readonly reason: TherapyContextUnavailableReason | undefined;
}

/** One quality gate shared by navigation and the loaded destination. */
export const evaluateTherapyContextAvailability = (
  quality: TherapyContextQualityGateInput,
): TherapyContextAvailability => {
  if (
    !Number.isFinite(quality.coveragePercent) ||
    quality.coveragePercent < 0 ||
    quality.coveragePercent > 100
  ) {
    throw new TrendsOverviewInputError(
      'Therapy Context coverage must be between 0 and 100 percent.',
    );
  }
  if (quality.sourceReliability !== 'reliable') {
    return {available: false, reason: 'source-unverified'};
  }
  if (quality.coveragePercent < THERAPY_CONTEXT_MIN_COVERAGE_PERCENT) {
    return {available: false, reason: 'coverage-low'};
  }
  return {available: true, reason: undefined};
};

export interface TherapyContextTotals {
  readonly insulinUnits: number | undefined;
  readonly carbohydrateGrams: number | undefined;
  readonly mealCount: number | undefined;
  readonly activityMinutes: number | undefined;
  readonly aidAvailabilityPercent: number | undefined;
}

export interface ObservedAidModeSummary {
  readonly mode: 'open-loop' | 'closed-loop';
  readonly observedHours: number;
  readonly targetRangePercent: number | undefined;
}

/** Factual, read-only context. Values stay optional instead of being inferred. */
export interface TherapyContextSnapshot {
  readonly period: TrendsPeriod;
  readonly quality: TherapyContextQualityGateInput;
  readonly evidence: TrendsEvidenceMetadata;
  readonly totals: TherapyContextTotals;
  readonly aidModes: readonly ObservedAidModeSummary[];
}

export const assertTherapyContextSnapshot = (
  snapshot: TherapyContextSnapshot,
): void => {
  assertTrendsPeriod(snapshot.period);
  if (
    snapshot.evidence.period.startMs !== snapshot.period.startMs ||
    snapshot.evidence.period.endMs !== snapshot.period.endMs
  ) {
    throw new TrendsOverviewInputError(
      'Therapy Context evidence must describe the same period as its snapshot.',
    );
  }
  if (snapshot.evidence.coveragePercent !== snapshot.quality.coveragePercent) {
    throw new TrendsOverviewInputError(
      'Therapy Context quality and evidence coverage must match.',
    );
  }
  const totals: readonly [string, number | undefined][] = [
    ['insulinUnits', snapshot.totals.insulinUnits],
    ['carbohydrateGrams', snapshot.totals.carbohydrateGrams],
    ['mealCount', snapshot.totals.mealCount],
    ['activityMinutes', snapshot.totals.activityMinutes],
  ];
  totals.forEach(([label, value]) => {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
      throw new TrendsOverviewInputError(
        `Therapy Context ${label} must be a non-negative finite number.`,
      );
    }
  });
  if (
    snapshot.totals.mealCount !== undefined &&
    !Number.isInteger(snapshot.totals.mealCount)
  ) {
    throw new TrendsOverviewInputError(
      'Therapy Context mealCount must be a whole number.',
    );
  }
  const aidAvailability = snapshot.totals.aidAvailabilityPercent;
  if (
    aidAvailability !== undefined &&
    (!Number.isFinite(aidAvailability) ||
      aidAvailability < 0 ||
      aidAvailability > 100)
  ) {
    throw new TrendsOverviewInputError(
      'Therapy Context aidAvailabilityPercent must be between 0 and 100.',
    );
  }
  const modes = new Set<string>();
  snapshot.aidModes.forEach(mode => {
    if (modes.has(mode.mode)) {
      throw new TrendsOverviewInputError(
        'Therapy Context contains a duplicate AID mode.',
      );
    }
    modes.add(mode.mode);
    if (!Number.isFinite(mode.observedHours) || mode.observedHours <= 0) {
      throw new TrendsOverviewInputError(
        'Therapy Context observedHours must be a positive finite number.',
      );
    }
    if (
      mode.targetRangePercent !== undefined &&
      (!Number.isFinite(mode.targetRangePercent) ||
        mode.targetRangePercent < 0 ||
        mode.targetRangePercent > 100)
    ) {
      throw new TrendsOverviewInputError(
        'Therapy Context targetRangePercent must be between 0 and 100.',
      );
    }
  });
  evaluateTherapyContextAvailability(snapshot.quality);
};
