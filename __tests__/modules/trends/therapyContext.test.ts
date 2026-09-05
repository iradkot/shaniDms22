import {
  assertTherapyContextSnapshot,
  buildTrendsEvidenceMetadata,
  evaluateTherapyContextAvailability,
  THERAPY_CONTEXT_MIN_COVERAGE_PERCENT,
} from 'app/modules/trends';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('Therapy Context quality gate', () => {
  it('opens only for reliable source classification and adequate coverage', () => {
    expect(
      evaluateTherapyContextAvailability({
        sourceReliability: 'reliable',
        coveragePercent: THERAPY_CONTEXT_MIN_COVERAGE_PERCENT,
      }),
    ).toEqual({available: true, reason: undefined});
  });

  it.each([
    [
      {sourceReliability: 'unverified' as const, coveragePercent: 100},
      'source-unverified',
    ],
    [
      {sourceReliability: 'reliable' as const, coveragePercent: 69.99},
      'coverage-low',
    ],
  ])('keeps incomplete evidence hidden: %o', (quality, reason) => {
    expect(evaluateTherapyContextAvailability(quality)).toEqual({
      available: false,
      reason,
    });
  });

  it('rejects impossible totals and duplicate AID modes at the source seam', () => {
    const period = {startMs: 0, endMs: 14 * DAY_MS};
    const base = {
      period,
      quality: {sourceReliability: 'reliable' as const, coveragePercent: 80},
      evidence: buildTrendsEvidenceMetadata({
        period,
        coveragePercent: 80,
        coverageQuality: 'adequate',
        daysWithData: 14,
        expectedSampleIntervalMs: DAY_MS,
        lastReadingTimestampMs: 13 * DAY_MS,
        targetRange: {minMgDl: 70, maxMgDl: 180},
        timeZoneOffsetMinutes: 120,
      }),
      totals: {
        insulinUnits: 200,
        carbohydrateGrams: 300,
        mealCount: 14,
        activityMinutes: 60,
        aidAvailabilityPercent: 90,
      },
      aidModes: [
        {mode: 'closed-loop' as const, observedHours: 200, targetRangePercent: 75},
      ],
    };

    expect(() =>
      assertTherapyContextSnapshot({
        ...base,
        totals: {...base.totals, insulinUnits: -1},
      }),
    ).toThrow(/insulinUnits/);
    expect(() =>
      assertTherapyContextSnapshot({
        ...base,
        aidModes: [...base.aidModes, ...base.aidModes],
      }),
    ).toThrow(/duplicate AID mode/);
  });
});
