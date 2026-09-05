import type {
  ActivityExternalCandidate,
  LinkActivityExternalEventInput,
} from '../contracts/activitiesWorkspace';
import type {
  LinkMealExternalEventInput,
  MealExternalCandidate,
} from '../contracts/mealsWorkspace';
import {
  decodeExternalRecordPayload,
  parseExternalActivityRecordSnapshot,
  parseExternalCarbRecordSnapshot,
  parseExternalTreatmentRecordSnapshot,
  toExternalRecordReference,
} from '../domain/externalRecords';
import type {ExternalRecordReference} from '../domain/externalRecords';
import type {NightscoutSourceId} from '../domain/identifiers';
import {
  invalid,
  isRecord,
  issue,
  ParseResult,
  valid,
  ValidationIssue,
  VALIDATION_ISSUE_CODES,
} from '../domain/validation';

const parseReference = (
  value: unknown,
  expectedSource: NightscoutSourceId,
  path: readonly (string | number)[],
): ParseResult<ExternalRecordReference> => {
  if (!isRecord(value)) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_TYPE,
        path,
        'Expected an external record reference.',
      ),
    ]);
  }
  if (value.nightscoutSourceId !== expectedSource) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        [...path, 'nightscoutSourceId'],
        'The external record belongs to another Nightscout source.',
      ),
    ]);
  }
  const decoded = decodeExternalRecordPayload(
    value.identifiers,
    expectedSource,
    [...path, 'identifiers'],
  );
  if (!decoded.ok) {
    return decoded;
  }
  const canonical = toExternalRecordReference(decoded.value, path);
  if (!canonical.ok) {
    return canonical;
  }
  if (canonical.value.recordKey !== value.recordKey) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        [...path, 'recordKey'],
        'The external record key does not match its stable identity.',
      ),
    ]);
  }
  return canonical;
};

const invalidRole = (path: readonly (string | number)[]) =>
  invalid<never>([
    issue(
      VALIDATION_ISSUE_CODES.INVALID_VALUE,
      path,
      'The external role does not match the record snapshot.',
    ),
  ]);

export const parseMealLinkInput = (
  input: LinkMealExternalEventInput,
  expectedSource: NightscoutSourceId,
): ParseResult<LinkMealExternalEventInput> => {
  const record = parseReference(input.record, expectedSource, ['record']);
  if (!record.ok) {
    return record;
  }
  if (!isRecord(input.snapshot) || !isRecord(input.role)) {
    return invalidRole([]);
  }
  if (
    input.snapshot.kind === 'carbohydrate' &&
    input.role.kind === 'reported_carbohydrate' &&
    (input.role.purpose === 'meal' ||
      input.role.purpose === 'low_treatment' ||
      input.role.purpose === 'unknown')
  ) {
    const snapshot = parseExternalCarbRecordSnapshot(input.snapshot, [
      'snapshot',
    ]);
    return snapshot.ok
      ? valid({
          mealId: input.mealId,
          expectedRevision: input.expectedRevision,
          record: record.value,
          snapshot: snapshot.value,
          role: {
            kind: 'reported_carbohydrate',
            purpose: input.role.purpose,
          },
        })
      : snapshot;
  }
  if (
    input.snapshot.kind === 'treatment' &&
    input.role.kind === 'supporting_treatment' &&
    (input.role.purpose === 'bolus' ||
      input.role.purpose === 'correction' ||
      input.role.purpose === 'other')
  ) {
    const snapshot = parseExternalTreatmentRecordSnapshot(input.snapshot, [
      'snapshot',
    ]);
    return snapshot.ok
      ? valid({
          mealId: input.mealId,
          expectedRevision: input.expectedRevision,
          record: record.value,
          snapshot: snapshot.value,
          role: {
            kind: 'supporting_treatment',
            purpose: input.role.purpose,
          },
        })
      : snapshot;
  }
  return invalidRole(['role']);
};

export const parseActivityLinkInput = (
  input: LinkActivityExternalEventInput,
  expectedSource: NightscoutSourceId,
): ParseResult<LinkActivityExternalEventInput> => {
  const record = parseReference(input.record, expectedSource, ['record']);
  if (!record.ok) {
    return record;
  }
  if (!isRecord(input.snapshot) || !isRecord(input.role)) {
    return invalidRole([]);
  }
  if (input.snapshot.kind === 'activity' && input.role.kind === 'activity') {
    const snapshot = parseExternalActivityRecordSnapshot(input.snapshot, [
      'snapshot',
    ]);
    return snapshot.ok
      ? valid({
          activityId: input.activityId,
          expectedRevision: input.expectedRevision,
          record: record.value,
          snapshot: snapshot.value,
          role: {kind: 'activity'},
        })
      : snapshot;
  }
  if (
    input.snapshot.kind === 'treatment' &&
    input.role.kind === 'supporting_treatment' &&
    (input.role.purpose === 'bolus' ||
      input.role.purpose === 'correction' ||
      input.role.purpose === 'other')
  ) {
    const snapshot = parseExternalTreatmentRecordSnapshot(input.snapshot, [
      'snapshot',
    ]);
    return snapshot.ok
      ? valid({
          activityId: input.activityId,
          expectedRevision: input.expectedRevision,
          record: record.value,
          snapshot: snapshot.value,
          role: {
            kind: 'supporting_treatment',
            purpose: input.role.purpose,
          },
        })
      : snapshot;
  }
  return invalidRole(['role']);
};

const candidateIssues = (
  candidates: readonly unknown[],
  expectedSource: NightscoutSourceId,
  kind: 'meal' | 'activity',
): {
  readonly meals: readonly MealExternalCandidate[];
  readonly activities: readonly ActivityExternalCandidate[];
  readonly issues: readonly ValidationIssue[];
} => {
  const meals: MealExternalCandidate[] = [];
  const activities: ActivityExternalCandidate[] = [];
  const issues: ValidationIssue[] = [];
  candidates.forEach((candidate, index) => {
    const path = ['candidates', index] as const;
    if (!isRecord(candidate)) {
      issues.push(
        issue(
          VALIDATION_ISSUE_CODES.INVALID_TYPE,
          path,
          'Expected an external candidate.',
        ),
      );
      return;
    }
    const record = parseReference(candidate.record, expectedSource, [
      ...path,
      'record',
    ]);
    if (!record.ok) {
      issues.push(...record.issues);
      return;
    }
    const reason = candidate.reason;
    if (typeof reason !== 'string' || reason.trim().length === 0) {
      issues.push(
        issue(
          VALIDATION_ISSUE_CODES.INVALID_TYPE,
          [...path, 'reason'],
          'Expected a candidate reason.',
        ),
      );
      return;
    }
    if (kind === 'meal' && candidate.kind === 'carbohydrate') {
      const snapshot = parseExternalCarbRecordSnapshot(candidate.snapshot, [
        ...path,
        'snapshot',
      ]);
      if (snapshot.ok) {
        meals.push({
          kind: 'carbohydrate',
          record: record.value,
          snapshot: snapshot.value,
          reason,
        });
      } else {
        issues.push(...snapshot.issues);
      }
      return;
    }
    if (candidate.kind === 'treatment') {
      const snapshot = parseExternalTreatmentRecordSnapshot(
        candidate.snapshot,
        [...path, 'snapshot'],
      );
      if (!snapshot.ok) {
        issues.push(...snapshot.issues);
        return;
      }
      if (kind === 'meal') {
        meals.push({
          kind: 'treatment',
          record: record.value,
          snapshot: snapshot.value,
          reason,
        });
      } else {
        activities.push({
          kind: 'treatment',
          record: record.value,
          snapshot: snapshot.value,
          reason,
        });
      }
      return;
    }
    if (kind === 'activity' && candidate.kind === 'activity') {
      const snapshot = parseExternalActivityRecordSnapshot(candidate.snapshot, [
        ...path,
        'snapshot',
      ]);
      if (snapshot.ok) {
        activities.push({
          kind: 'activity',
          record: record.value,
          snapshot: snapshot.value,
          reason,
        });
      } else {
        issues.push(...snapshot.issues);
      }
      return;
    }
    issues.push(
      issue(
        VALIDATION_ISSUE_CODES.INVALID_VALUE,
        [...path, 'kind'],
        'Candidate kind does not match the requested Journal entry kind.',
      ),
    );
  });
  return {meals, activities, issues};
};

export const sanitizeMealCandidates = (
  candidates: readonly MealExternalCandidate[],
  expectedSource: NightscoutSourceId,
) => candidateIssues(candidates, expectedSource, 'meal');

export const sanitizeActivityCandidates = (
  candidates: readonly ActivityExternalCandidate[],
  expectedSource: NightscoutSourceId,
) => candidateIssues(candidates, expectedSource, 'activity');
