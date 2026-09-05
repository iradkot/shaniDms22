import {
  areExactExternalDuplicates,
  decodeExternalRecordPayload,
  deriveReportedCarbohydrates,
  ExternalEventLink,
  ExternalRecordReference,
  ExternalCarbRecordSnapshot,
  JOURNAL_ERROR_CODES,
  NightscoutSourceId,
  parseCaptureActivityInput,
  parseCaptureMealInput,
  parseExternalCarbRecordSnapshot,
  parseJournalConflictId,
  parseNightscoutSourceId,
  parseProductUserId,
  ReportedCarbohydrateRole,
  toExternalRecordReference,
  validateExternalLinksFromOneSource,
} from '../../../src/modules/journal';
import type {ParseResult} from '../../../src/modules/journal';

function valueOf<T>(result: ParseResult<T>): T {
  if (!result.ok) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.value;
}

function source(value: string): NightscoutSourceId {
  return valueOf(parseNightscoutSourceId(value));
}

function reference(
  sourceId: NightscoutSourceId,
  payload: Record<string, unknown>,
): ExternalRecordReference {
  return valueOf(
    toExternalRecordReference(
      valueOf(decodeExternalRecordPayload(payload, sourceId)),
    ),
  );
}

describe('Journal contracts', () => {
  it('returns path-aware issues for invalid branded identifiers', () => {
    const result = parseProductUserId(' user-1 ', ['owner', 'productUserId']);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        expect.objectContaining({
          code: 'validation.invalid_format',
          path: ['owner', 'productUserId'],
        }),
      ]);
    }
  });

  it('brands conflict IDs only after runtime validation', () => {
    expect(valueOf(parseJournalConflictId('conflict-operation-1'))).toBe(
      'conflict-operation-1',
    );
    const invalidConflict = parseJournalConflictId(' conflict-operation-1 ', [
      'conflictId',
    ]);
    expect(invalidConflict).toMatchObject({
      ok: false,
      issues: [{path: ['conflictId']}],
    });
  });

  it('requires Meal Start and at least a name, Meal Carbohydrates, or image', () => {
    const result = parseCaptureMealInput({mealStart: 1_700_000_000_000});

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: 'validation.invariant',
          path: [],
        }),
      );
    }
  });

  it('normalizes missing meal tags to an empty list', () => {
    const result = valueOf(
      parseCaptureMealInput({
        mealStart: 1_700_000_000_000,
        name: 'Breakfast',
      }),
    );

    expect(result.tags).toEqual([]);
  });

  it('bounds tags before they can reach local or remote persistence', () => {
    const tooMany = parseCaptureMealInput({
      mealStart: 1_700_000_000_000,
      name: 'Breakfast',
      tags: Array.from({length: 9}, (_, index) => `tag-${index}`),
    });
    const tooLong = parseCaptureMealInput({
      mealStart: 1_700_000_000_000,
      name: 'Breakfast',
      tags: ['x'.repeat(81)],
    });

    expect(tooMany).toMatchObject({ok: false});
    expect(tooLong).toMatchObject({ok: false});
  });

  it('keeps Meal Start, External Carb Time, and External Entry Time distinct', () => {
    const meal = valueOf(
      parseCaptureMealInput({
        mealStart: 1_700_000_000_000,
        mealCarbohydrates: {grams: 30},
      }),
    );
    const external = valueOf(
      parseExternalCarbRecordSnapshot({
        externalCarbTime: 1_699_999_700_000,
        externalEntryTime: 1_699_999_760_000,
        carbohydratesGrams: 20,
      }),
    );

    expect(meal.mealStart).toBe(1_700_000_000_000);
    expect(meal.mealCarbohydrates?.grams).toBe(30);
    expect(external.externalCarbTime).toBe(1_699_999_700_000);
    expect(external.externalEntryTime).toBe(1_699_999_760_000);
    expect(external.carbohydratesGrams).toBe(20);
  });

  it('uses a plain image descriptor and reports the exact invalid field', () => {
    const result = parseCaptureMealInput({
      mealStart: 1_700_000_000_000,
      image: {uri: 'content://meal/1', mimeType: 'application/pdf'},
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          code: 'validation.invalid_format',
          path: ['image', 'mimeType'],
        }),
      );
    }
  });

  it('preserves every supported external identity field', () => {
    const result = valueOf(
      decodeExternalRecordPayload(
        {
          _id: 'nightscout-id',
          identifier: 'loop-identifier',
          syncIdentifier: 'sync-identifier',
          carbs: 5,
        },
        source('ns-a'),
      ),
    );

    expect(result.identityStatus).toBe('identified');
    expect(result.identifiers).toEqual({
      _id: 'nightscout-id',
      identifier: 'loop-identifier',
      syncIdentifier: 'sync-identifier',
    });
    expect(result.raw.carbs).toBe(5);
  });

  it('marks records without stable identity and refuses a live link', () => {
    const decoded = valueOf(
      decodeExternalRecordPayload(
        {carbs: 5, date: 1_700_000_000_000},
        source('ns-a'),
      ),
    );
    const linked = toExternalRecordReference(decoded, ['candidate']);

    expect(decoded.identityStatus).toBe('unidentified');
    expect(linked.ok).toBe(false);
    if (!linked.ok) {
      expect(linked.issues[0]).toEqual(
        expect.objectContaining({path: ['candidate']}),
      );
    }
  });

  it('calls records duplicates only when stable identity and source match', () => {
    const sameA = valueOf(
      decodeExternalRecordPayload({_id: 'a', carbs: 5}, source('ns-a')),
    );
    const sameAAgain = valueOf(
      decodeExternalRecordPayload({_id: 'a', carbs: 99}, source('ns-a')),
    );
    const similarButDistinct = valueOf(
      decodeExternalRecordPayload(
        {_id: 'b', carbs: 5, date: 1_700_000_000_000},
        source('ns-a'),
      ),
    );
    const otherSource = valueOf(
      decodeExternalRecordPayload({_id: 'a', carbs: 5}, source('ns-b')),
    );

    expect(areExactExternalDuplicates(sameA, sameAAgain)).toBe(true);
    expect(areExactExternalDuplicates(sameA, similarButDistinct)).toBe(false);
    expect(areExactExternalDuplicates(sameA, otherSource)).toBe(false);
  });

  it('keeps incremental carb records separate and derives their total', () => {
    const sourceId = source('ns-a');
    const role: ReportedCarbohydrateRole = {
      kind: 'reported_carbohydrate',
      purpose: 'meal',
    };
    const links: ExternalEventLink<
      ReportedCarbohydrateRole,
      ExternalCarbRecordSnapshot
    >[] = [15, 5, 5].map((grams, index) => ({
      record: reference(sourceId, {_id: `carb-${index + 1}`}),
      role,
      linkedAt: 1_700_000_100_000 + index,
      external: {
        kind: 'available',
        checkedAt: 1_700_000_200_000,
        snapshot: {
          kind: 'carbohydrate',
          externalCarbTime: 1_700_000_000_000 + index * 60_000,
          carbohydratesGrams: grams,
        },
      },
    }));

    const reported = deriveReportedCarbohydrates(links);
    expect(reported).toEqual(
      expect.objectContaining({
        totalGrams: 25,
        componentCount: 3,
        knownComponentCount: 3,
      }),
    );
  });

  it('rejects duplicate links and links from another Workspace source', () => {
    const expectedSource = source('ns-a');
    const record = reference(expectedSource, {_id: 'carb-1'});
    const role: ReportedCarbohydrateRole = {
      kind: 'reported_carbohydrate',
      purpose: 'meal',
    };
    const snapshot: ExternalCarbRecordSnapshot = {
      kind: 'carbohydrate',
      externalCarbTime: 1_700_000_000_000,
      carbohydratesGrams: 5,
    };
    const links: ExternalEventLink<
      ReportedCarbohydrateRole,
      ExternalCarbRecordSnapshot
    >[] = [
      {
        record,
        role,
        linkedAt: 1_700_000_000_000,
        external: {kind: 'available', checkedAt: 1_700_000_000_000, snapshot},
      },
      {
        record,
        role,
        linkedAt: 1_700_000_000_001,
        external: {kind: 'available', checkedAt: 1_700_000_000_001, snapshot},
      },
      {
        record: reference(source('ns-b'), {_id: 'carb-2'}),
        role,
        linkedAt: 1_700_000_000_002,
        external: {kind: 'available', checkedAt: 1_700_000_000_002, snapshot},
      },
    ];

    expect(
      validateExternalLinksFromOneSource(links, expectedSource).map(
        issue => issue.code,
      ),
    ).toEqual([
      'validation.out_of_range',
      'validation.duplicate',
      'validation.invariant',
    ]);
  });

  it('allows an ongoing Activity but rejects an end before its start', () => {
    const ongoing = valueOf(
      parseCaptureActivityInput({
        category: 'walking',
        startedAt: 1_700_000_000_000,
      }),
    );
    expect(ongoing.tags).toEqual([]);

    const invalidActivity = parseCaptureActivityInput({
      category: 'walking',
      startedAt: 1_700_000_000_000,
      endedAt: 1_699_999_999_999,
    });
    expect(invalidActivity.ok).toBe(false);
    if (!invalidActivity.ok) {
      expect(invalidActivity.issues).toContainEqual(
        expect.objectContaining({path: ['endedAt']}),
      );
    }
  });

  it('exposes stable namespaced operation error codes', () => {
    expect(JOURNAL_ERROR_CODES.REVISION_CONFLICT).toBe(
      'journal.revision_conflict',
    );
    expect(JOURNAL_ERROR_CODES.EXTERNAL_RECORD_UNIDENTIFIED).toBe(
      'journal.external_record_unidentified',
    );
  });
});
