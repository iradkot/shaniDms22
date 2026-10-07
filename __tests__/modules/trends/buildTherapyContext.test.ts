import {
  buildTherapyContextSnapshot,
  evaluateTherapyContextAvailability,
} from 'app/modules/trends';

const hour = 60 * 60 * 1000;
const start = 1_800_000_000_000;
const period = {startMs: start, endMs: start + 24 * hour};

const glucose = Array.from({length: 288}, (_, index) => ({
  timestampMs: start + index * 5 * 60_000,
  valueMgDl: index % 5 === 0 ? 190 : 120,
}));

describe('buildTherapyContextSnapshot', () => {
  it('keeps recorded totals factual and includes only local Journal meals', () => {
    const snapshot = buildTherapyContextSnapshot({
      period,
      glucoseSamples: glucose,
      sourceReliability: 'reliable',
      recordedInsulin: {quality: 'available', basalUnits: 8, bolusUnits: 3.5},
      treatments: [
        {timestampMs: start + hour, insulinUnits: 2, carbohydrateGrams: 10},
        {
          timestampMs: start + 2 * hour,
          insulinUnits: 1.5,
          carbohydrateGrams: 5,
        },
        {timestampMs: period.endMs + 1, insulinUnits: 100},
      ],
      mealStartedAtMs: [start + hour, start + 4 * hour, period.endMs],
      activities: [
        {startedAtMs: start + 3 * hour, endedAtMs: start + 3.5 * hour},
      ],
      modeChanges: [],
    });

    expect(snapshot.totals).toEqual({
      insulinUnits: 11.5,
      carbohydrateGrams: 15,
      mealCount: 2,
      activityMinutes: 30,
      aidAvailabilityPercent: undefined,
    });
    expect(snapshot.aidModes).toEqual([]);
    expect(evaluateTherapyContextAvailability(snapshot.quality).available).toBe(
      true,
    );
  });

  it('cannot manufacture total insulin by summing incomplete treatment projection', () => {
    const snapshot = buildTherapyContextSnapshot({
      period,
      glucoseSamples: glucose,
      sourceReliability: 'reliable',
      treatments: [{timestampMs: start + hour, insulinUnits: 99}],
      mealStartedAtMs: [],
      activities: [],
      modeChanges: [],
      recordedInsulin: {
        quality: 'partial',
        basalUnits: 6.8,
        bolusUnits: 33.85,
        basalCoveredMs: hour,
        basalCoveragePercent: 30,
      },
    });
    expect(snapshot.totals.insulinUnits).toBeUndefined();
    expect(snapshot.insulinSummary).toMatchObject({
      quality: 'partial',
      bolusUnits: 33.85,
    });
  });

  it('shows open-versus-closed observations only with exposure in both modes', () => {
    const snapshot = buildTherapyContextSnapshot({
      period,
      glucoseSamples: glucose,
      sourceReliability: 'reliable',
      treatments: [],
      mealStartedAtMs: [],
      activities: [],
      modeChanges: [
        {timestampMs: start - hour, mode: 'open-loop'},
        {timestampMs: start + 12 * hour, mode: 'closed-loop'},
      ],
    });

    expect(snapshot.totals.aidAvailabilityPercent).toBe(100);
    expect(snapshot.aidModes).toHaveLength(2);
    expect(snapshot.aidModes.map(mode => mode.observedHours)).toEqual([12, 12]);
  });

  it('fails the visible gate when glucose coverage is incomplete', () => {
    const snapshot = buildTherapyContextSnapshot({
      period,
      glucoseSamples: glucose.slice(0, 20),
      sourceReliability: 'reliable',
      treatments: [],
      mealStartedAtMs: [],
      activities: [],
      modeChanges: [],
    });

    expect(evaluateTherapyContextAvailability(snapshot.quality)).toEqual({
      available: false,
      reason: 'coverage-low',
    });
  });
});
