import type {
  CaptureMealInput,
  FieldChange,
  MealCarbohydrates,
  MealImageInput,
  MealSnapshot,
  Revision,
  ReviseMealInput,
} from '../../modules/journal';
import {
  formatJournalDateTime,
  formatJournalTags,
  parseJournalDateTime,
  parseJournalTags,
  sameJournalTags,
} from '../journal/formValues';

export interface MealDraft {
  readonly mealStart: string;
  readonly name: string;
  readonly mealCarbohydrates: string;
  readonly notes: string;
  readonly tags: string;
  /** undefined keeps the current image; null explicitly removes it. */
  readonly image?: MealImageInput | null;
}

export type MealFormFailure =
  | 'invalid_time'
  | 'invalid_carbohydrates'
  | 'meal_required'
  | 'no_changes';

export type MealFormResult<T> =
  | {readonly ok: true; readonly value: T}
  | {readonly ok: false; readonly reason: MealFormFailure};

interface ParsedMealDraft {
  readonly mealStart: number;
  readonly name?: string;
  readonly mealCarbohydrates?: MealCarbohydrates;
  readonly notes?: string;
  readonly tags: readonly string[];
  readonly image?: MealImageInput;
}

const parseDraft = (
  draft: MealDraft,
  hasImage: boolean,
): MealFormResult<ParsedMealDraft> => {
  const mealStart = parseJournalDateTime(draft.mealStart);
  if (mealStart === undefined) {
    return {ok: false, reason: 'invalid_time'};
  }
  const name = draft.name.trim();
  const carbohydratesText = draft.mealCarbohydrates.trim();
  const carbohydrates =
    carbohydratesText.length === 0 ? undefined : Number(carbohydratesText);
  if (
    carbohydrates !== undefined &&
    (!Number.isFinite(carbohydrates) || carbohydrates <= 0)
  ) {
    return {ok: false, reason: 'invalid_carbohydrates'};
  }
  const image = draft.image === null ? undefined : draft.image;
  if (
    name.length === 0 &&
    carbohydrates === undefined &&
    image === undefined &&
    !hasImage
  ) {
    return {ok: false, reason: 'meal_required'};
  }
  const notes = draft.notes.trim();
  return {
    ok: true,
    value: {
      mealStart,
      ...(name.length === 0 ? {} : {name}),
      ...(carbohydrates === undefined
        ? {}
        : {
            mealCarbohydrates: {
              kind: 'meal_carbohydrates' as const,
              grams: carbohydrates,
            },
          }),
      ...(notes.length === 0 ? {} : {notes}),
      tags: parseJournalTags(draft.tags),
      ...(image === undefined ? {} : {image}),
    },
  };
};

export const emptyMealDraft = (timestamp: number): MealDraft => ({
  mealStart: formatJournalDateTime(timestamp),
  name: '',
  mealCarbohydrates: '',
  notes: '',
  tags: '',
});

export const mealDraftFromSnapshot = (meal: MealSnapshot): MealDraft => ({
  mealStart: formatJournalDateTime(meal.mealStart),
  name: meal.name ?? '',
  mealCarbohydrates:
    meal.mealCarbohydrates === undefined
      ? ''
      : String(meal.mealCarbohydrates.grams),
  notes: meal.notes ?? '',
  tags: formatJournalTags(meal.tags),
});

export const buildMealCapture = (
  draft: MealDraft,
): MealFormResult<CaptureMealInput> => parseDraft(draft, false);

const optionalStringChange = (
  current: string | undefined,
  next: string | undefined,
): FieldChange<string> | undefined => {
  if (current === next) {
    return undefined;
  }
  return next === undefined ? {kind: 'clear'} : {kind: 'set', value: next};
};

const carbohydrateChange = (
  current: MealCarbohydrates | undefined,
  next: MealCarbohydrates | undefined,
): FieldChange<MealCarbohydrates> | undefined => {
  if (current?.grams === next?.grams) {
    return undefined;
  }
  return next === undefined ? {kind: 'clear'} : {kind: 'set', value: next};
};

export const buildMealRevision = (
  source: MealSnapshot,
  expectedRevision: Revision,
  draft: MealDraft,
): MealFormResult<ReviseMealInput> => {
  const parsed = parseDraft(
    draft,
    draft.image === null ? false : source.image !== undefined,
  );
  if (!parsed.ok) {
    return parsed;
  }
  const next = parsed.value;
  const mealStart =
    next.mealStart === source.mealStart
      ? undefined
      : ({kind: 'set', value: next.mealStart} as const);
  const name = optionalStringChange(source.name, next.name);
  const mealCarbohydrates = carbohydrateChange(
    source.mealCarbohydrates,
    next.mealCarbohydrates,
  );
  const notes = optionalStringChange(source.notes, next.notes);
  const tags = sameJournalTags(source.tags, next.tags)
    ? undefined
    : ({kind: 'set', value: next.tags} as const);
  const image: FieldChange<MealImageInput> | undefined =
    draft.image === undefined
      ? undefined
      : draft.image === null
      ? source.image === undefined
        ? undefined
        : {kind: 'clear'}
      : {kind: 'set', value: draft.image};
  if (
    mealStart === undefined &&
    name === undefined &&
    mealCarbohydrates === undefined &&
    notes === undefined &&
    tags === undefined &&
    image === undefined
  ) {
    return {ok: false, reason: 'no_changes'};
  }
  return {
    ok: true,
    value: {
      mealId: source.id,
      expectedRevision,
      ...(mealStart === undefined ? {} : {mealStart}),
      ...(name === undefined ? {} : {name}),
      ...(mealCarbohydrates === undefined ? {} : {mealCarbohydrates}),
      ...(notes === undefined ? {} : {notes}),
      ...(tags === undefined ? {} : {tags}),
      ...(image === undefined ? {} : {image}),
    },
  };
};
