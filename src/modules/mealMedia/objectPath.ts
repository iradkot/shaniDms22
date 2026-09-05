import type {
  JournalWorkspaceScope,
  MealEntryId,
} from '../journal';

const SEGMENT_PATTERN = '[A-Za-z0-9_-]{1,128}';
const OBJECT_NAME_PATTERN =
  'image_[0-9a-f]{32}\\.(?:jpg|png|webp|heic|heif)';
const OBJECT_PATH_PATTERN = new RegExp(
  `^users/(${SEGMENT_PATTERN})/workspaces/(${SEGMENT_PATTERN})/mealImages/(${SEGMENT_PATTERN})/(${OBJECT_NAME_PATTERN})$`,
);

export interface MealImageObjectPathParts {
  readonly productUserId: string;
  readonly workspaceId: string;
  readonly mealId: string;
  readonly objectName: string;
}

const safeSegment = (value: string, label: string): string => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error(`${label} cannot be used in a Meal Image path.`);
  }
  return value;
};

const safeObjectName = (value: string): string => {
  if (!/^image_[0-9a-f]{32}\.(?:jpg|png|webp|heic|heif)$/.test(value)) {
    throw new Error('The Meal Image object name is invalid.');
  }
  return value;
};

export const buildMealImageObjectPath = (
  scope: JournalWorkspaceScope,
  mealId: MealEntryId,
  objectName: string,
): string =>
  `users/${safeSegment(
    scope.productUserId,
    'Product User ID',
  )}/workspaces/${safeSegment(
    scope.workspaceId,
    'Workspace ID',
  )}/mealImages/${safeSegment(mealId, 'Meal Entry ID')}/${safeObjectName(
    objectName,
  )}`;

export const mealImageStorageUri = (objectPath: string): string =>
  `storage-object://${encodeURIComponent(objectPath)}`;

export const parseMealImageObjectPath = (
  objectPath: string,
): MealImageObjectPathParts | undefined => {
  const matched = OBJECT_PATH_PATTERN.exec(objectPath);
  return matched === null
    ? undefined
    : {
        productUserId: matched[1]!,
        workspaceId: matched[2]!,
        mealId: matched[3]!,
        objectName: matched[4]!,
      };
};

export const isManagedMealImageObjectPath = (
  scope: JournalWorkspaceScope,
  objectPath: string,
): boolean => {
  const parsed = parseMealImageObjectPath(objectPath);
  return (
    parsed !== undefined &&
    parsed.productUserId === scope.productUserId &&
    parsed.workspaceId === scope.workspaceId
  );
};
