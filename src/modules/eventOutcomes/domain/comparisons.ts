import type {EventOutcome} from './outcome';

const HOUR_MS = 60 * 60 * 1000;

export interface ComparableMealFacts {
  readonly id: string;
  readonly mealStartMs: number;
  readonly name?: string;
  readonly templateId?: string;
  readonly tags: readonly string[];
  readonly carbohydratesGrams?: number;
  readonly outcome?: EventOutcome;
}

export interface ComparableMealCriteria {
  readonly matchNormalizedName: boolean;
  readonly requireSharedTag: boolean;
  readonly carbohydrateToleranceGrams: number;
  readonly matchTemplate?: boolean;
}

export type ComparableMealMatchedFact =
  | 'normalized_name'
  | 'template'
  | 'shared_tag'
  | 'carbohydrate_range';

export interface ComparableMealSet {
  readonly criteria: ComparableMealCriteria;
  readonly matches: readonly {
    readonly meal: ComparableMealFacts;
    readonly matchedFacts: readonly ComparableMealMatchedFact[];
  }[];
  readonly exclusions: readonly {
    readonly mealId: string;
    readonly reason: 'same_entry' | 'facts_mismatch' | 'outcome_quality';
  }[];
}

const normalize = (value: string | undefined): string | undefined => {
  const normalized = value?.trim().toLocaleLowerCase().replace(/\s+/g, ' ');
  return normalized ? normalized : undefined;
};

const normalizedTags = (meal: ComparableMealFacts): ReadonlySet<string> =>
  new Set(meal.tags.map(normalize).filter((tag): tag is string => !!tag));

export const selectComparableMealSet = (input: {
  readonly anchor: ComparableMealFacts;
  readonly candidates: readonly ComparableMealFacts[];
  readonly criteria?: Partial<ComparableMealCriteria>;
}): ComparableMealSet => {
  const criteria: ComparableMealCriteria = {
    matchNormalizedName: input.criteria?.matchNormalizedName ?? true,
    requireSharedTag: input.criteria?.requireSharedTag ?? false,
    carbohydrateToleranceGrams:
      input.criteria?.carbohydrateToleranceGrams ?? 15,
    matchTemplate: input.criteria?.matchTemplate ?? true,
  };
  if (
    !Number.isFinite(criteria.carbohydrateToleranceGrams) ||
    criteria.carbohydrateToleranceGrams < 0
  ) {
    throw new Error('Comparable Meal carbohydrate tolerance is invalid.');
  }

  const anchorName = normalize(input.anchor.name);
  const anchorTags = normalizedTags(input.anchor);
  const matches: ComparableMealSet['matches'][number][] = [];
  const exclusions: ComparableMealSet['exclusions'][number][] = [];

  input.candidates.forEach(candidate => {
    if (candidate.id === input.anchor.id) {
      exclusions.push({mealId: candidate.id, reason: 'same_entry'});
      return;
    }
    const outcome = candidate.outcome;
    if (
      outcome === undefined ||
      outcome.subject.kind !== 'meal' ||
      !outcome.quality.suitableForRepeatedObservation
    ) {
      exclusions.push({mealId: candidate.id, reason: 'outcome_quality'});
      return;
    }

    const matchedFacts: ComparableMealMatchedFact[] = [];
    const candidateName = normalize(candidate.name);
    const nameMatches =
      anchorName !== undefined &&
      candidateName !== undefined &&
      anchorName === candidateName;
    if (nameMatches) {matchedFacts.push('normalized_name');}

    const templateMatches =
      input.anchor.templateId !== undefined &&
      candidate.templateId === input.anchor.templateId;
    if (templateMatches) {matchedFacts.push('template');}

    const candidateTags = normalizedTags(candidate);
    const sharedTag = [...anchorTags].some(tag => candidateTags.has(tag));
    if (sharedTag) {matchedFacts.push('shared_tag');}

    const carbohydrateRangeMatches =
      input.anchor.carbohydratesGrams !== undefined &&
      candidate.carbohydratesGrams !== undefined &&
      Math.abs(
        input.anchor.carbohydratesGrams - candidate.carbohydratesGrams,
      ) <= criteria.carbohydrateToleranceGrams;
    if (carbohydrateRangeMatches) {matchedFacts.push('carbohydrate_range');}

    const requiredNameMatches =
      !criteria.matchNormalizedName || anchorName === undefined || nameMatches;
    const requiredTagMatches = !criteria.requireSharedTag || sharedTag;
    const requiredTemplateMatches =
      !criteria.matchTemplate ||
      input.anchor.templateId === undefined ||
      templateMatches;
    const hasDisclosedSimilarity = matchedFacts.length > 0;

    if (
      requiredNameMatches &&
      requiredTagMatches &&
      requiredTemplateMatches &&
      hasDisclosedSimilarity
    ) {
      matches.push({meal: candidate, matchedFacts});
    } else {
      exclusions.push({mealId: candidate.id, reason: 'facts_mismatch'});
    }
  });

  matches.sort(
    (left, right) => right.meal.mealStartMs - left.meal.mealStartMs,
  );
  return {criteria, matches, exclusions};
};

type MetricRange = {
  readonly median: number;
  readonly minimum: number;
  readonly maximum: number;
};

export type RepeatedObservation =
  | {
      readonly status: 'unavailable';
      readonly reason: 'insufficient_sample_size';
      readonly eligibleSampleSize: number;
      readonly minimumSampleSize: number;
    }
  | {
      readonly status: 'available';
      readonly interpretation: 'descriptive_observation';
      readonly sampleSize: number;
      readonly dateCoverage: {
        readonly startMs: number;
        readonly endMs: number;
        readonly days: number;
      };
      readonly metrics: {
        readonly peakRiseMgDl: MetricRange;
        readonly mealIauc0To2hMgDlHours: MetricRange;
      };
    };

const metricRange = (values: readonly number[]): MetricRange => {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[middle - 1]! + sorted[middle]!) / 2
      : sorted[middle]!;
  return {
    median,
    minimum: sorted[0]!,
    maximum: sorted[sorted.length - 1]!,
  };
};

export const buildRepeatedObservation = (input: {
  readonly outcomes: readonly EventOutcome[];
  readonly minimumSampleSize?: number;
}): RepeatedObservation => {
  const minimumSampleSize = input.minimumSampleSize ?? 3;
  if (!Number.isInteger(minimumSampleSize) || minimumSampleSize < 2) {
    throw new Error('Repeated Observation minimum sample size is invalid.');
  }
  const eligible = input.outcomes.filter(
    outcome =>
      outcome.subject.kind === 'meal' &&
      outcome.quality.suitableForRepeatedObservation &&
      outcome.glucose.peakRiseMgDl !== null &&
      outcome.advanced.mealIauc0To2h.status === 'available',
  );
  if (eligible.length < minimumSampleSize) {
    return {
      status: 'unavailable',
      reason: 'insufficient_sample_size',
      eligibleSampleSize: eligible.length,
      minimumSampleSize,
    };
  }
  const timestamps = eligible
    .map(outcome => outcome.subject.startedAtMs)
    .sort((left, right) => left - right);
  const startMs = timestamps[0]!;
  const endMs = timestamps[timestamps.length - 1]!;
  const peakValues = eligible.map(outcome => outcome.glucose.peakRiseMgDl!);
  const iaucValues = eligible.map(outcome => {
    const result = outcome.advanced.mealIauc0To2h;
    if (result.status !== 'available') {
      throw new Error('Eligible Event Outcome lost its iAUC value.');
    }
    return result.valueMgDlHours;
  });
  return {
    status: 'available',
    interpretation: 'descriptive_observation',
    sampleSize: eligible.length,
    dateCoverage: {
      startMs,
      endMs,
      days: Math.floor((endMs - startMs) / (24 * HOUR_MS)) + 1,
    },
    metrics: {
      peakRiseMgDl: metricRange(peakValues),
      mealIauc0To2hMgDlHours: metricRange(iaucValues),
    },
  };
};
