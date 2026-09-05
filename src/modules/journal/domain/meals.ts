import {
  areExactExternalDuplicates,
  ExternalCarbRecordSnapshot,
  ExternalEventLink,
  ExternalTreatmentRecordSnapshot,
  ReportedCarbohydrateRole,
  SupportingTreatmentRole,
  validateExternalLinksFromOneSource,
} from './externalRecords';
import {ExternalRecordKey, MealEntryId, Revision} from './identifiers';
import {FieldChange, JournalSnapshotBase} from './journal';
import {
  collectIssues,
  invalid,
  isRecord,
  issue,
  ParseResult,
  parseNonNegativeInteger,
  parseObject,
  parseOptionalString,
  parsePositiveNumber,
  parseStringArray,
  parseTimestampMs,
  valid,
  ValidationIssue,
  ValidationPathSegment,
  VALIDATION_ISSUE_CODES,
} from './validation';

export interface MealCarbohydrates {
  readonly kind: 'meal_carbohydrates';
  readonly grams: number;
}

export interface ReportedCarbohydrateComponent {
  readonly recordKey: ExternalRecordKey;
  readonly grams: number | null;
  readonly externalCarbTime: number | null;
  readonly stale: boolean;
}

export interface ReportedCarbohydrates {
  readonly kind: 'reported_carbohydrates';
  readonly totalGrams: number | null;
  readonly componentCount: number;
  readonly knownComponentCount: number;
  readonly stale: boolean;
  readonly components: readonly ReportedCarbohydrateComponent[];
}

export interface MealImageInput {
  readonly uri: string;
  readonly mimeType: string;
  readonly fileName?: string;
  readonly byteSize?: number;
  readonly widthPx?: number;
  readonly heightPx?: number;
}

export type MealImageSyncState =
  | {readonly kind: 'local_only'; readonly localUri: string}
  | {
      readonly kind: 'upload_pending';
      readonly localUri: string;
      /** Stable app-owned object name. Never contains a local path. */
      readonly objectName?: string;
    }
  | {
      readonly kind: 'available';
      readonly localUri?: string;
      readonly objectName?: string;
      /** Owner/Workspace-scoped Firebase Storage path. */
      readonly objectPath?: string;
      readonly displayUri: string;
      readonly thumbnailUri: string;
    }
  | {
      readonly kind: 'failed';
      readonly localUri: string;
      readonly objectName?: string;
      readonly message: string;
      readonly retryable: boolean;
    };

export interface MealImageSnapshot {
  readonly mimeType: string;
  readonly fileName?: string;
  readonly byteSize?: number;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly syncState: MealImageSyncState;
}

export type MealExternalEventLink =
  | ExternalEventLink<ReportedCarbohydrateRole, ExternalCarbRecordSnapshot>
  | ExternalEventLink<SupportingTreatmentRole, ExternalTreatmentRecordSnapshot>;

export interface MealSnapshot extends JournalSnapshotBase<'meal', MealEntryId> {
  readonly mealStart: number;
  readonly name?: string;
  readonly mealCarbohydrates?: MealCarbohydrates;
  readonly image?: MealImageSnapshot;
  readonly notes?: string;
  readonly tags: readonly string[];
  readonly externalLinks: readonly MealExternalEventLink[];
  readonly reportedCarbohydrates?: ReportedCarbohydrates;
}

export interface CaptureMealInput {
  readonly mealStart: number;
  readonly name?: string;
  readonly mealCarbohydrates?: MealCarbohydrates;
  readonly image?: MealImageInput;
  readonly notes?: string;
  readonly tags?: readonly string[];
}

export interface NormalizedCaptureMealInput extends CaptureMealInput {
  readonly tags: readonly string[];
}

export interface ReviseMealInput {
  readonly mealId: MealEntryId;
  readonly expectedRevision: Revision;
  readonly mealStart?: FieldChange<number>;
  readonly name?: FieldChange<string>;
  readonly mealCarbohydrates?: FieldChange<MealCarbohydrates>;
  readonly image?: FieldChange<MealImageInput>;
  readonly notes?: FieldChange<string>;
  readonly tags?: FieldChange<readonly string[]>;
}

export function parseMealCarbohydrates(
  value: unknown,
  path: readonly ValidationPathSegment[] = [],
): ParseResult<MealCarbohydrates> {
  const object = parseObject(value, path);
  if (!object.ok) {
    return object;
  }

  const grams = parsePositiveNumber(object.value.grams, [...path, 'grams']);
  return grams.ok
    ? valid({kind: 'meal_carbohydrates', grams: grams.value})
    : grams;
}

function optionalPositiveInteger(
  value: unknown,
  path: readonly ValidationPathSegment[],
): ParseResult<number | undefined> {
  if (value === undefined || value === null) {
    return valid(undefined);
  }
  const parsed = parseNonNegativeInteger(value, path);
  if (!parsed.ok) {
    return parsed;
  }
  return parsed.value > 0
    ? valid(parsed.value)
    : invalid([
        issue(
          VALIDATION_ISSUE_CODES.OUT_OF_RANGE,
          path,
          'Expected an integer greater than zero.',
        ),
      ]);
}

export function parseMealImageInput(
  value: unknown,
  path: readonly ValidationPathSegment[] = [],
): ParseResult<MealImageInput> {
  const object = parseObject(value, path);
  if (!object.ok) {
    return object;
  }

  const uri = parseOptionalString(object.value.uri, [...path, 'uri']);
  const mimeType = parseOptionalString(object.value.mimeType, [
    ...path,
    'mimeType',
  ]);
  const fileName = parseOptionalString(object.value.fileName, [
    ...path,
    'fileName',
  ]);
  const byteSize = optionalPositiveInteger(object.value.byteSize, [
    ...path,
    'byteSize',
  ]);
  const widthPx = optionalPositiveInteger(object.value.widthPx, [
    ...path,
    'widthPx',
  ]);
  const heightPx = optionalPositiveInteger(object.value.heightPx, [
    ...path,
    'heightPx',
  ]);
  const issues = collectIssues(
    uri,
    mimeType,
    fileName,
    byteSize,
    widthPx,
    heightPx,
  );

  if (uri.ok && uri.value === undefined) {
    issues.push(
      issue(
        VALIDATION_ISSUE_CODES.REQUIRED,
        [...path, 'uri'],
        'A URI is required.',
      ),
    );
  }
  if (mimeType.ok && mimeType.value === undefined) {
    issues.push(
      issue(
        VALIDATION_ISSUE_CODES.REQUIRED,
        [...path, 'mimeType'],
        'An image MIME type is required.',
      ),
    );
  } else if (
    mimeType.ok &&
    mimeType.value !== undefined &&
    !mimeType.value.toLocaleLowerCase().startsWith('image/')
  ) {
    issues.push(
      issue(
        VALIDATION_ISSUE_CODES.INVALID_FORMAT,
        [...path, 'mimeType'],
        'Expected an image MIME type.',
      ),
    );
  }

  if (issues.length > 0) {
    return invalid(issues);
  }
  if (!uri.ok) {
    return uri;
  }
  if (uri.value === undefined) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.REQUIRED,
        [...path, 'uri'],
        'A URI is required.',
      ),
    ]);
  }
  if (!mimeType.ok) {
    return mimeType;
  }
  if (mimeType.value === undefined) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.REQUIRED,
        [...path, 'mimeType'],
        'An image MIME type is required.',
      ),
    ]);
  }
  if (!fileName.ok) {
    return fileName;
  }
  if (!byteSize.ok) {
    return byteSize;
  }
  if (!widthPx.ok) {
    return widthPx;
  }
  if (!heightPx.ok) {
    return heightPx;
  }

  return valid({
    uri: uri.value,
    mimeType: mimeType.value,
    ...(fileName.value === undefined ? {} : {fileName: fileName.value}),
    ...(byteSize.value === undefined ? {} : {byteSize: byteSize.value}),
    ...(widthPx.value === undefined ? {} : {widthPx: widthPx.value}),
    ...(heightPx.value === undefined ? {} : {heightPx: heightPx.value}),
  });
}

export function parseCaptureMealInput(
  value: unknown,
  path: readonly ValidationPathSegment[] = [],
): ParseResult<NormalizedCaptureMealInput> {
  if (!isRecord(value)) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVALID_TYPE,
        path,
        'Expected a meal capture object.',
      ),
    ]);
  }

  const mealStart = parseTimestampMs(value.mealStart, [...path, 'mealStart']);
  const name = parseOptionalString(value.name, [...path, 'name']);
  const carbohydrates =
    value.mealCarbohydrates === undefined || value.mealCarbohydrates === null
      ? valid<MealCarbohydrates | undefined>(undefined)
      : parseMealCarbohydrates(value.mealCarbohydrates, [
          ...path,
          'mealCarbohydrates',
        ]);
  const image =
    value.image === undefined || value.image === null
      ? valid<MealImageInput | undefined>(undefined)
      : parseMealImageInput(value.image, [...path, 'image']);
  const notes = parseOptionalString(value.notes, [...path, 'notes'], {
    allowEmpty: true,
  });
  const tags = parseStringArray(value.tags, [...path, 'tags']);
  const issues = collectIssues(
    mealStart,
    name,
    carbohydrates,
    image,
    notes,
    tags,
  );

  if (
    name.ok &&
    carbohydrates.ok &&
    image.ok &&
    name.value === undefined &&
    carbohydrates.value === undefined &&
    image.value === undefined
  ) {
    issues.push(
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        path,
        'A meal needs at least a name, Meal Carbohydrates, or an image.',
      ),
    );
  }

  if (issues.length > 0) {
    return invalid(issues);
  }
  if (!mealStart.ok) {
    return mealStart;
  }
  if (!name.ok) {
    return name;
  }
  if (!carbohydrates.ok) {
    return carbohydrates;
  }
  if (!image.ok) {
    return image;
  }
  if (!notes.ok) {
    return notes;
  }
  if (!tags.ok) {
    return tags;
  }

  return valid({
    mealStart: mealStart.value,
    ...(name.value === undefined ? {} : {name: name.value}),
    ...(carbohydrates.value === undefined
      ? {}
      : {mealCarbohydrates: carbohydrates.value}),
    ...(image.value === undefined ? {} : {image: image.value}),
    ...(notes.value === undefined ? {} : {notes: notes.value}),
    tags: tags.value,
  });
}

function latestCarbSnapshot(
  link: ExternalEventLink<ReportedCarbohydrateRole, ExternalCarbRecordSnapshot>,
): {readonly snapshot?: ExternalCarbRecordSnapshot; readonly stale: boolean} {
  if (link.external.kind === 'available') {
    return {snapshot: link.external.snapshot, stale: false};
  }
  return link.external.lastKnown === undefined
    ? {stale: true}
    : {snapshot: link.external.lastKnown, stale: true};
}

export function deriveReportedCarbohydrates(
  links: readonly MealExternalEventLink[],
): ReportedCarbohydrates | undefined {
  const carbohydrateLinks = links.filter(
    (
      link,
    ): link is ExternalEventLink<
      ReportedCarbohydrateRole,
      ExternalCarbRecordSnapshot
    > => link.role.kind === 'reported_carbohydrate',
  );
  if (carbohydrateLinks.length === 0) {
    return undefined;
  }

  const uniqueLinks: typeof carbohydrateLinks = [];
  const components: ReportedCarbohydrateComponent[] = [];
  carbohydrateLinks.forEach(link => {
    if (
      uniqueLinks.some(existing =>
        areExactExternalDuplicates(existing.record, link.record),
      )
    ) {
      return;
    }
    uniqueLinks.push(link);
    const latest = latestCarbSnapshot(link);
    components.push({
      recordKey: link.record.recordKey,
      grams: latest.snapshot?.carbohydratesGrams ?? null,
      externalCarbTime: latest.snapshot?.externalCarbTime ?? null,
      stale: latest.stale,
    });
  });

  const knownComponents = components.filter(
    component => component.grams !== null,
  );
  const complete = knownComponents.length === components.length;
  const totalGrams = complete
    ? knownComponents.reduce(
        (total, component) => total + (component.grams ?? 0),
        0,
      )
    : null;

  return {
    kind: 'reported_carbohydrates',
    totalGrams,
    componentCount: components.length,
    knownComponentCount: knownComponents.length,
    stale: components.some(component => component.stale),
    components,
  };
}

export function validateMealSnapshot(
  meal: MealSnapshot,
): readonly ValidationIssue[] {
  const issues = [
    ...validateExternalLinksFromOneSource(
      meal.externalLinks,
      meal.scope.nightscoutSourceId,
    ),
  ];
  const derived = deriveReportedCarbohydrates(meal.externalLinks);

  if (JSON.stringify(derived) !== JSON.stringify(meal.reportedCarbohydrates)) {
    issues.push(
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        ['reportedCarbohydrates'],
        'Reported Carbohydrates must be derived from distinct linked external carbohydrate records.',
      ),
    );
  }

  return issues;
}
