import type {
  ActivityCategory,
  ActivityIntensity,
  ActivitySnapshot,
  CaptureActivityInput,
  FieldChange,
  Revision,
  ReviseActivityInput,
} from '../../modules/journal';
import {
  formatJournalDateTime,
  formatJournalTags,
  parseJournalDateTime,
  parseJournalTags,
  sameJournalTags,
} from '../journal/formValues';

export interface ActivityDraft {
  readonly category: ActivityCategory;
  readonly customName: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly ongoing: boolean;
  readonly intensity: ActivityIntensity | undefined;
  readonly notes: string;
  readonly tags: string;
}

export type ActivityFormFailure =
  | 'invalid_start'
  | 'invalid_end'
  | 'time_order'
  | 'custom_name_required'
  | 'no_changes';

export type ActivityFormResult<T> =
  | {readonly ok: true; readonly value: T}
  | {readonly ok: false; readonly reason: ActivityFormFailure};

interface ParsedActivityDraft {
  readonly category: ActivityCategory;
  readonly customName?: string;
  readonly startedAt: number;
  readonly endedAt?: number;
  readonly intensity?: ActivityIntensity;
  readonly notes?: string;
  readonly tags: readonly string[];
}

const parseDraft = (
  draft: ActivityDraft,
): ActivityFormResult<ParsedActivityDraft> => {
  const startedAt = parseJournalDateTime(draft.startedAt);
  if (startedAt === undefined) {
    return {ok: false, reason: 'invalid_start'};
  }
  const customName = draft.customName.trim();
  if (draft.category === 'other' && customName.length === 0) {
    return {ok: false, reason: 'custom_name_required'};
  }
  const endedAt = draft.ongoing
    ? undefined
    : parseJournalDateTime(draft.endedAt);
  if (!draft.ongoing && endedAt === undefined) {
    return {ok: false, reason: 'invalid_end'};
  }
  if (endedAt !== undefined && endedAt < startedAt) {
    return {ok: false, reason: 'time_order'};
  }
  const notes = draft.notes.trim();
  return {
    ok: true,
    value: {
      category: draft.category,
      ...(draft.category === 'other' ? {customName} : {}),
      startedAt,
      ...(endedAt === undefined ? {} : {endedAt}),
      ...(draft.intensity === undefined ? {} : {intensity: draft.intensity}),
      ...(notes.length === 0 ? {} : {notes}),
      tags: parseJournalTags(draft.tags),
    },
  };
};

export const emptyActivityDraft = (timestamp: number): ActivityDraft => ({
  category: 'walking',
  customName: '',
  startedAt: formatJournalDateTime(timestamp),
  endedAt: formatJournalDateTime(timestamp),
  ongoing: true,
  intensity: undefined,
  notes: '',
  tags: '',
});

export const activityDraftFromSnapshot = (
  activity: ActivitySnapshot,
): ActivityDraft => ({
  category: activity.category,
  customName: activity.customName ?? '',
  startedAt: formatJournalDateTime(activity.startedAt),
  endedAt: formatJournalDateTime(activity.endedAt ?? activity.startedAt),
  ongoing: activity.endedAt === undefined,
  intensity: activity.intensity,
  notes: activity.notes ?? '',
  tags: formatJournalTags(activity.tags),
});

export const buildActivityCapture = (
  draft: ActivityDraft,
): ActivityFormResult<CaptureActivityInput> => parseDraft(draft);

const optionalStringChange = (
  current: string | undefined,
  next: string | undefined,
): FieldChange<string> | undefined => {
  if (current === next) {
    return undefined;
  }
  return next === undefined ? {kind: 'clear'} : {kind: 'set', value: next};
};

const optionalValueChange = <T>(
  current: T | undefined,
  next: T | undefined,
): FieldChange<T> | undefined => {
  if (current === next) {
    return undefined;
  }
  return next === undefined ? {kind: 'clear'} : {kind: 'set', value: next};
};

export const buildActivityRevision = (
  source: ActivitySnapshot,
  expectedRevision: Revision,
  draft: ActivityDraft,
): ActivityFormResult<ReviseActivityInput> => {
  const parsed = parseDraft(draft);
  if (!parsed.ok) {
    return parsed;
  }
  const next = parsed.value;
  const category =
    source.category === next.category
      ? undefined
      : ({kind: 'set', value: next.category} as const);
  const customName = optionalStringChange(source.customName, next.customName);
  const startedAt =
    source.startedAt === next.startedAt
      ? undefined
      : ({kind: 'set', value: next.startedAt} as const);
  const endedAt = optionalValueChange(source.endedAt, next.endedAt);
  const intensity = optionalValueChange(source.intensity, next.intensity);
  const notes = optionalStringChange(source.notes, next.notes);
  const tags = sameJournalTags(source.tags, next.tags)
    ? undefined
    : ({kind: 'set', value: next.tags} as const);
  if (
    category === undefined &&
    customName === undefined &&
    startedAt === undefined &&
    endedAt === undefined &&
    intensity === undefined &&
    notes === undefined &&
    tags === undefined
  ) {
    return {ok: false, reason: 'no_changes'};
  }
  return {
    ok: true,
    value: {
      activityId: source.id,
      expectedRevision,
      ...(category === undefined ? {} : {category}),
      ...(customName === undefined ? {} : {customName}),
      ...(startedAt === undefined ? {} : {startedAt}),
      ...(endedAt === undefined ? {} : {endedAt}),
      ...(intensity === undefined ? {} : {intensity}),
      ...(notes === undefined ? {} : {notes}),
      ...(tags === undefined ? {} : {tags}),
    },
  };
};
