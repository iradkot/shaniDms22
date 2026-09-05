import {
  buildEventOutcome,
  buildRepeatedObservation,
  selectComparableMealSet,
  type EventOutcome,
} from 'app/modules/eventOutcomes';

const minute = 60_000;
const hour = 60 * minute;

const completeMealOutcome = (
  id: string,
  startedAtMs: number,
  peakRiseMgDl: number,
  iauc: number,
): EventOutcome => ({
  subject: {kind: 'meal', id, startedAtMs},
  window: {
    baselineStartMs: startedAtMs - 30 * minute,
    subjectStartMs: startedAtMs,
    subjectEndMs: startedAtMs,
    observationEndMs: startedAtMs + 3 * hour,
  },
  glucose: {
    baselineMgDl: 100,
    peakMgDl: 100 + peakRiseMgDl,
    peakTimestampMs: startedAtMs + hour,
    nadirMgDl: 95,
    nadirTimestampMs: startedAtMs + 2 * hour,
    oneHourMgDl: 100 + peakRiseMgDl,
    twoHourMgDl: 110,
    peakRiseMgDl,
  },
  advanced: {
    mealIauc0To2h: {
      status: 'available',
      valueMgDlHours: iauc,
      formulaVersion: 'meal_iauc_positive_above_start_v1',
    },
  },
  quality: {
    validSampleCount: 43,
    expectedSampleCount: 43,
    coveragePercent: 100,
    largestGapMs: 5 * minute,
    overlapCount: 0,
    overlappingContext: [],
    suitableForRepeatedObservation: true,
    reasons: [],
  },
});

describe('Event Outcomes', () => {
  it('describes a meal response and calculates positive iAUC without grading it', () => {
    const start = 1_700_000_000_000;
    const samples = [
      {timestampMs: start - 30 * minute, valueMgDl: 100},
      {timestampMs: start - 15 * minute, valueMgDl: 100},
      {timestampMs: start, valueMgDl: 100},
      {timestampMs: start + 30 * minute, valueMgDl: 140},
      {timestampMs: start + hour, valueMgDl: 180},
      {timestampMs: start + 90 * minute, valueMgDl: 140},
      {timestampMs: start + 2 * hour, valueMgDl: 90},
      {timestampMs: start + 150 * minute, valueMgDl: 95},
      {timestampMs: start + 3 * hour, valueMgDl: 100},
      // Exact timestamp duplicates are excluded, not averaged.
      {timestampMs: start + hour, valueMgDl: 250},
    ];

    const outcome = buildEventOutcome({
      subject: {kind: 'meal', id: 'meal-1', startedAtMs: start},
      glucoseSamples: samples,
      contextEvents: [],
      expectedSampleIntervalMs: 30 * minute,
    });

    expect(outcome.glucose).toMatchObject({
      baselineMgDl: 100,
      peakMgDl: 180,
      peakRiseMgDl: 80,
      twoHourMgDl: 90,
    });
    expect(outcome.advanced.mealIauc0To2h).toEqual({
      status: 'available',
      valueMgDlHours: 80,
      formulaVersion: 'meal_iauc_positive_above_start_v1',
    });
    expect(outcome.quality.suitableForRepeatedObservation).toBe(true);
    expect(JSON.stringify(outcome)).not.toMatch(/score|grade|caus/i);
  });

  it('keeps an individual result but excludes low-coverage and overlapping context from repetition', () => {
    const start = 1_700_100_000_000;
    const outcome = buildEventOutcome({
      subject: {kind: 'meal', id: 'meal-gap', startedAtMs: start},
      glucoseSamples: [
        {timestampMs: start - 20 * minute, valueMgDl: 110},
        {timestampMs: start, valueMgDl: 112},
        {timestampMs: start + 2 * hour, valueMgDl: 150},
      ],
      contextEvents: [
        {
          id: 'correction-1',
          kind: 'treatment',
          timestampMs: start + 45 * minute,
          label: 'Correction',
        },
      ],
      expectedSampleIntervalMs: 5 * minute,
    });

    expect(outcome.quality.coveragePercent).toBeLessThan(70);
    expect(outcome.quality.overlapCount).toBe(1);
    expect(outcome.quality.suitableForRepeatedObservation).toBe(false);
    expect(outcome.quality.reasons).toEqual(
      expect.arrayContaining(['low_coverage', 'overlapping_context']),
    );
    expect(outcome.advanced.mealIauc0To2h.status).toBe('unavailable');
  });

  it('selects a disclosed, adjustable comparable meal set and applies outcome gates', () => {
    const start = 1_700_200_000_000;
    const anchorOutcome = completeMealOutcome('anchor', start, 50, 45);
    const result = selectComparableMealSet({
      anchor: {
        id: 'anchor',
        mealStartMs: start,
        name: 'Pasta',
        tags: ['dinner'],
        carbohydratesGrams: 60,
        outcome: anchorOutcome,
      },
      candidates: [
        {
          id: 'good',
          mealStartMs: start - 7 * 24 * hour,
          name: ' pasta ',
          tags: ['dinner'],
          carbohydratesGrams: 65,
          outcome: completeMealOutcome('good', start - 7 * 24 * hour, 55, 50),
        },
        {
          id: 'different',
          mealStartMs: start - 8 * 24 * hour,
          name: 'Soup',
          tags: ['lunch'],
          carbohydratesGrams: 20,
          outcome: completeMealOutcome(
            'different',
            start - 8 * 24 * hour,
            20,
            15,
          ),
        },
        {
          id: 'overlap',
          mealStartMs: start - 9 * 24 * hour,
          name: 'Pasta',
          tags: ['dinner'],
          carbohydratesGrams: 62,
          outcome: {
            ...completeMealOutcome('overlap', start - 9 * 24 * hour, 70, 80),
            quality: {
              ...completeMealOutcome('overlap', start, 70, 80).quality,
              overlapCount: 1,
              suitableForRepeatedObservation: false,
              reasons: ['overlapping_context'],
            },
          },
        },
      ],
      criteria: {
        matchNormalizedName: true,
        requireSharedTag: true,
        carbohydrateToleranceGrams: 10,
      },
    });

    expect(result.matches.map(match => match.meal.id)).toEqual(['good']);
    expect(result.matches[0]?.matchedFacts).toEqual([
      'normalized_name',
      'shared_tag',
      'carbohydrate_range',
    ]);
    expect(result.exclusions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({mealId: 'different', reason: 'facts_mismatch'}),
        expect.objectContaining({mealId: 'overlap', reason: 'outcome_quality'}),
      ]),
    );
  });

  it('exposes sample size, date coverage, and variation for a repeated observation', () => {
    const start = Date.UTC(2026, 7, 20, 12);
    const outcomes = [
      completeMealOutcome('a', start, 40, 30),
      completeMealOutcome('b', start - 7 * 24 * hour, 60, 50),
      completeMealOutcome('c', start - 14 * 24 * hour, 80, 70),
    ];

    const observation = buildRepeatedObservation({outcomes});

    expect(observation.status).toBe('available');
    if (observation.status !== 'available') {throw new Error('Expected result');}
    expect(observation.sampleSize).toBe(3);
    expect(observation.dateCoverage.days).toBe(15);
    expect(observation.metrics.peakRiseMgDl).toEqual({
      median: 60,
      minimum: 40,
      maximum: 80,
    });
    expect(observation.metrics.mealIauc0To2hMgDlHours.median).toBe(50);
    expect(observation.interpretation).toBe('descriptive_observation');
  });

  it('does not claim a repeated observation from an undersized set', () => {
    const start = Date.UTC(2026, 7, 20, 12);
    expect(
      buildRepeatedObservation({
        outcomes: [
          completeMealOutcome('a', start, 40, 30),
          completeMealOutcome('b', start - 24 * hour, 60, 50),
        ],
      }),
    ).toEqual({
      status: 'unavailable',
      reason: 'insufficient_sample_size',
      eligibleSampleSize: 2,
      minimumSampleSize: 3,
    });
  });
});
