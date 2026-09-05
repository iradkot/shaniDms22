import {
  ExternalActivityRecordSnapshot,
  ExternalActivityRole,
  ExternalEventLink,
  ExternalTreatmentRecordSnapshot,
  SupportingTreatmentRole,
  validateExternalLinksFromOneSource,
} from './externalRecords';
import {ActivityEntryId, Revision} from './identifiers';
import {FieldChange, JournalSnapshotBase} from './journal';
import {
  collectIssues,
  invalid,
  isRecord,
  issue,
  ParseResult,
  parseOptionalString,
  parseStringArray,
  parseTimestampMs,
  valid,
  ValidationIssue,
  ValidationPathSegment,
  VALIDATION_ISSUE_CODES,
} from './validation';

export type ActivityCategory =
  | 'walking'
  | 'running'
  | 'cycling'
  | 'strength'
  | 'swimming'
  | 'sport'
  | 'other';

export type ActivityIntensity =
  | 'very_low'
  | 'low'
  | 'medium'
  | 'high'
  | 'very_high';

export type ActivityExternalEventLink =
  | ExternalEventLink<ExternalActivityRole, ExternalActivityRecordSnapshot>
  | ExternalEventLink<SupportingTreatmentRole, ExternalTreatmentRecordSnapshot>;

export interface ActivitySnapshot
  extends JournalSnapshotBase<'activity', ActivityEntryId> {
  readonly category: ActivityCategory;
  readonly customName?: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly intensity?: ActivityIntensity;
  readonly notes?: string;
  readonly tags: readonly string[];
  readonly externalLinks: readonly ActivityExternalEventLink[];
}

export interface CaptureActivityInput {
  readonly category: ActivityCategory;
  readonly customName?: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly intensity?: ActivityIntensity;
  readonly notes?: string;
  readonly tags?: readonly string[];
}

export interface NormalizedCaptureActivityInput extends CaptureActivityInput {
  readonly tags: readonly string[];
}

export interface ReviseActivityInput {
  readonly activityId: ActivityEntryId;
  readonly expectedRevision: Revision;
  readonly category?: FieldChange<ActivityCategory>;
  readonly customName?: FieldChange<string>;
  readonly startedAt?: FieldChange<number>;
  readonly endedAt?: FieldChange<number>;
  readonly intensity?: FieldChange<ActivityIntensity>;
  readonly notes?: FieldChange<string>;
  readonly tags?: FieldChange<readonly string[]>;
}

export interface FinishActivityInput {
  readonly activityId: ActivityEntryId;
  readonly expectedRevision: Revision;
  readonly endedAt: number;
}

export function parseActivityCategory(
  value: unknown,
  path: readonly ValidationPathSegment[] = [],
): ParseResult<ActivityCategory> {
  switch (value) {
    case 'walking':
    case 'running':
    case 'cycling':
    case 'strength':
    case 'swimming':
    case 'sport':
    case 'other':
      return valid(value);
    default:
      return invalid([
        issue(
          value === undefined
            ? VALIDATION_ISSUE_CODES.REQUIRED
            : VALIDATION_ISSUE_CODES.INVALID_VALUE,
          path,
          'Expected a supported Activity Category.',
        ),
      ]);
  }
}

export function parseActivityIntensity(
  value: unknown,
  path: readonly ValidationPathSegment[] = [],
): ParseResult<ActivityIntensity | undefined> {
  if (value === undefined || value === null) {
    return valid(undefined);
  }

  if (typeof value !== 'string') {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_TYPE,
        path,
        'Expected an Activity Intensity string.',
      ),
    ]);
  }

  switch (value) {
    case 'very_low':
    case 'low':
    case 'medium':
    case 'high':
    case 'very_high':
      return valid(value);
    default:
      return invalid([
        issue(
          VALIDATION_ISSUE_CODES.INVALID_VALUE,
          path,
          'Expected a supported Activity Intensity.',
        ),
      ]);
  }
}

export function parseCaptureActivityInput(
  value: unknown,
  path: readonly ValidationPathSegment[] = [],
): ParseResult<NormalizedCaptureActivityInput> {
  if (!isRecord(value)) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_TYPE,
        path,
        'Expected an activity capture object.',
      ),
    ]);
  }

  const category = parseActivityCategory(value.category, [...path, 'category']);
  const customName = parseOptionalString(value.customName, [
    ...path,
    'customName',
  ]);
  const startedAt = parseTimestampMs(value.startedAt, [...path, 'startedAt']);
  const endedAt =
    value.endedAt === undefined || value.endedAt === null
      ? valid<number | undefined>(undefined)
      : parseTimestampMs(value.endedAt, [...path, 'endedAt']);
  const intensity = parseActivityIntensity(value.intensity, [
    ...path,
    'intensity',
  ]);
  const notes = parseOptionalString(value.notes, [...path, 'notes'], {
    allowEmpty: true,
  });
  const tags = parseStringArray(value.tags, [...path, 'tags']);
  const issues = collectIssues(
    category,
    customName,
    startedAt,
    endedAt,
    intensity,
    notes,
    tags,
  );

  if (
    startedAt.ok &&
    endedAt.ok &&
    endedAt.value !== undefined &&
    endedAt.value < startedAt.value
  ) {
    issues.push(
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        [...path, 'endedAt'],
        'An activity cannot end before it starts.',
      ),
    );
  }
  if (
    category.ok &&
    category.value === 'other' &&
    customName.ok &&
    customName.value === undefined
  ) {
    issues.push(
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        [...path, 'customName'],
        'A custom name is required for the Other Activity Category.',
      ),
    );
  }

  if (issues.length > 0) {
    return invalid(issues);
  }
  if (!category.ok) {
    return category;
  }
  if (!customName.ok) {
    return customName;
  }
  if (!startedAt.ok) {
    return startedAt;
  }
  if (!endedAt.ok) {
    return endedAt;
  }
  if (!intensity.ok) {
    return intensity;
  }
  if (!notes.ok) {
    return notes;
  }
  if (!tags.ok) {
    return tags;
  }

  return valid({
    category: category.value,
    ...(customName.value === undefined ? {} : {customName: customName.value}),
    startedAt: startedAt.value,
    ...(endedAt.value === undefined ? {} : {endedAt: endedAt.value}),
    ...(intensity.value === undefined ? {} : {intensity: intensity.value}),
    ...(notes.value === undefined ? {} : {notes: notes.value}),
    tags: tags.value,
  });
}

export function validateActivitySnapshot(
  activity: ActivitySnapshot,
): readonly ValidationIssue[] {
  const issues = [
    ...validateExternalLinksFromOneSource(
      activity.externalLinks,
      activity.scope.nightscoutSourceId,
    ),
  ];

  if (activity.endedAt !== undefined && activity.endedAt < activity.startedAt) {
    issues.push(
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        ['endedAt'],
        'An activity cannot end before it starts.',
      ),
    );
  }

  return issues;
}
