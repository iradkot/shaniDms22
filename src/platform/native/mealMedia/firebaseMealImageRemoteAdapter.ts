import {
  parseMealImageObjectPath,
  type MealImageRemoteAdapter,
  type MealImageRemoteMutationResult,
} from '../../../modules/mealMedia';

export interface MealImageRemoteObjectMetadata {
  readonly contentType?: string;
  readonly size?: number;
  readonly customMetadata?: Readonly<Record<string, string>>;
}

export interface MealImageStorageGateway {
  inspect(objectPath: string): Promise<MealImageRemoteObjectMetadata | undefined>;
  upload(input: {
    readonly objectPath: string;
    readonly localUri: string;
    readonly mimeType: string;
    readonly customMetadata: Readonly<Record<string, string>>;
  }): Promise<void>;
  resolve(objectPath: string): Promise<string>;
  remove(objectPath: string): Promise<void>;
}

const errorCode = (error: unknown): string =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  typeof error.code === 'string'
    ? error.code.toLocaleLowerCase('en-US')
    : '';

const isNotFound = (error: unknown): boolean =>
  errorCode(error).includes('object-not-found');

const mapFailure = (error: unknown): MealImageRemoteMutationResult => {
  const code = errorCode(error);
  const retryable =
    code.length === 0 ||
    code.includes('retry-limit-exceeded') ||
    code.includes('cancelled') ||
    code.includes('network') ||
    code.includes('unknown');
  return {
    ok: false,
    error: {
      message: retryable
        ? 'Meal Image cloud sync is temporarily unavailable.'
        : 'Meal Image cloud sync was rejected.',
      retryable,
    },
  };
};

const metadataFor = (objectPath: string) => {
  const parsed = parseMealImageObjectPath(objectPath);
  if (parsed === undefined) {
    return undefined;
  }
  return {
    schemaVersion: '1',
    ownerProductUserId: parsed.productUserId,
    workspaceId: parsed.workspaceId,
    mealId: parsed.mealId,
    objectName: parsed.objectName,
  };
};

/** Idempotent remote Adapter: a unique object name is never overwritten. */
export const createFirebaseMealImageRemoteAdapter = (
  gateway: MealImageStorageGateway,
): MealImageRemoteAdapter => ({
  async upload(input) {
    const expectedMetadata = metadataFor(input.objectPath);
    if (expectedMetadata === undefined) {
      return {
        ok: false,
        error: {
          message: 'The Meal Image cloud path is invalid.',
          retryable: false,
        },
      };
    }
    try {
      let existing: MealImageRemoteObjectMetadata | undefined;
      try {
        existing = await gateway.inspect(input.objectPath);
      } catch (error) {
        if (!isNotFound(error)) {
          return mapFailure(error);
        }
      }
      if (existing !== undefined) {
        const metadata = existing.customMetadata ?? {};
        const matches =
          existing.contentType === input.mimeType &&
          Object.entries(expectedMetadata).every(
            ([key, value]) => metadata[key] === value,
          );
        return matches
          ? {ok: true}
          : {
              ok: false,
              error: {
                message: 'The Meal Image object name is already in use.',
                retryable: false,
              },
            };
      }
      await gateway.upload({...input, customMetadata: expectedMetadata});
      return {ok: true};
    } catch (error) {
      return mapFailure(error);
    }
  },
  resolve: objectPath => gateway.resolve(objectPath),
  async remove(objectPath) {
    try {
      await gateway.remove(objectPath);
    } catch (error) {
      if (!isNotFound(error)) {
        throw error;
      }
    }
  },
});
