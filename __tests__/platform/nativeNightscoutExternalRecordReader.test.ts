import {
  createNativeNightscoutExternalRecordReader,
  projectNightscoutActivityCandidates,
  projectNightscoutMealCandidates,
} from 'app/platform/native/journal/nativeNightscoutExternalRecordReader';
import {
  parseNightscoutSourceId,
  parseProductUserId,
  parseWorkspaceId,
} from 'app/modules/journal';

const valueOf = <T>(result: {ok: true; value: T} | {ok: false}): T => {
  if (!result.ok) {
    throw new Error('Expected a valid branded identifier.');
  }
  return result.value;
};

const sourceId = valueOf(parseNightscoutSourceId('nightscout_test_source'));
const scope = {
  workspaceId: valueOf(parseWorkspaceId('workspace_test')),
  productUserId: valueOf(parseProductUserId('user_test')),
  nightscoutSourceId: sourceId,
};

describe('native read-only Nightscout Journal candidate reader', () => {
  it('keeps intentional incremental carb records separate and deduplicates only exact identity', () => {
    const timestamp = 1_700_000_000_000;
    const candidates = projectNightscoutMealCandidates(
      [
        {_id: 'carb-a', date: timestamp, carbs: 5, eventType: 'Carb Correction'},
        {_id: 'carb-b', date: timestamp, carbs: 5, eventType: 'Carb Correction'},
        {_id: 'carb-c', date: timestamp, carbs: 5, eventType: 'Carb Correction'},
        {_id: 'carb-a', date: timestamp, carbs: 5, eventType: 'Carb Correction'},
      ],
      sourceId,
      {startMs: timestamp - 60_000, endMs: timestamp + 60_000},
      timestamp,
    );

    expect(candidates).toHaveLength(3);
    expect(candidates.map(candidate => candidate.record.identifiers._id)).toEqual([
      'carb-a',
      'carb-b',
      'carb-c',
    ]);
    expect(
      candidates.map(candidate =>
        candidate.kind === 'carbohydrate'
          ? candidate.snapshot.carbohydratesGrams
          : undefined,
      ),
    ).toEqual([5, 5, 5]);
  });

  it('projects only identified, in-window carbohydrate or insulin facts', () => {
    const timestamp = 1_700_000_000_000;
    const candidates = projectNightscoutMealCandidates(
      [
        {
          _id: 'carb',
          syncIdentifier: 'loop-carb',
          date: timestamp,
          created_at: new Date(timestamp + 5_000).toISOString(),
          carbs: 30,
          enteredBy: 'loop://phone',
          eventType: 'Carb Correction',
        },
        {
          identifier: 'bolus',
          timestamp: new Date(timestamp + 30_000).toISOString(),
          insulin: 2.5,
          eventType: 'Correction Bolus',
        },
        {date: timestamp, carbs: 99},
        {_id: 'outside', date: timestamp + 120_000, carbs: 8},
      ],
      sourceId,
      {startMs: timestamp - 60_000, endMs: timestamp + 60_000},
      timestamp,
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      kind: 'carbohydrate',
      snapshot: {
        externalCarbTime: timestamp,
        externalEntryTime: timestamp + 5_000,
        carbohydratesGrams: 30,
        enteredBy: 'loop://phone',
      },
    });
    expect(candidates[1]).toMatchObject({
      kind: 'treatment',
      snapshot: {treatmentTime: timestamp + 30_000, insulinUnits: 2.5},
    });
  });

  it('projects explicit activity records independently from supporting treatments', () => {
    const timestamp = 1_700_000_000_000;
    const candidates = projectNightscoutActivityCandidates(
      [
        {
          _id: 'exercise',
          created_at: new Date(timestamp).toISOString(),
          eventType: 'Exercise',
          duration: 45,
          enteredBy: 'Nightscout',
        },
        {
          _id: 'bolus',
          date: timestamp + 60_000,
          eventType: 'Correction Bolus',
          insulin: 1,
        },
        {_id: 'note', date: timestamp, eventType: 'Note', notes: 'walk'},
      ],
      sourceId,
      {startMs: timestamp - 60_000, endMs: timestamp + 120_000},
      timestamp,
    );

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      kind: 'activity',
      snapshot: {
        startedAt: timestamp,
        endedAt: timestamp + 45 * 60_000,
        eventType: 'Exercise',
      },
    });
    expect(candidates[1]).toMatchObject({
      kind: 'treatment',
      snapshot: {insulinUnits: 1},
    });
  });

  it('uses explicit search windows and reports source failures instead of fake empty results', async () => {
    const timestamp = 1_700_000_000_000;
    const loadTreatments = jest.fn(async () => {
      throw new Error('network down');
    });
    const reader = createNativeNightscoutExternalRecordReader({
      loadTreatments,
      assertActiveScope: () => undefined,
    });

    const result = await reader.findMealCandidates(scope, {
      nearMealStart: timestamp,
      beforeMs: 15 * 60_000,
      afterMs: 30 * 60_000,
    });

    expect(loadTreatments).toHaveBeenCalledWith({
      startMs: timestamp - 15 * 60_000,
      endMs: timestamp + 30 * 60_000,
    });
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({
        code: 'journal.offline',
        retryable: true,
      }),
    });
  });

  it('discards a response if the active Nightscout Workspace changes in flight', async () => {
    let checks = 0;
    const reader = createNativeNightscoutExternalRecordReader({
      loadTreatments: async () => [
        {_id: 'carb', date: 1_700_000_000_000, carbs: 10},
      ],
      assertActiveScope: () => {
        checks += 1;
        if (checks === 2) {
          throw new Error('source changed');
        }
      },
    });

    const result = await reader.findMealCandidates(scope, {
      nearMealStart: 1_700_000_000_000,
    });

    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({code: 'journal.offline'}),
    });
  });
});
