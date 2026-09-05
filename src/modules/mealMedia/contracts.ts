import type {JournalMediaStore, MealImageSnapshot} from '../journal';

export const MEAL_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export interface MealImageFileAdapter {
  stage(input: {
    readonly sourceUri: string;
    readonly destinationName: string;
  }): Promise<{readonly localUri: string; readonly byteSize: number}>;
  remove(localUri: string): Promise<void>;
}

export type MealImageRemoteMutationResult =
  | {readonly ok: true}
  | {
      readonly ok: false;
      readonly error: {readonly message: string; readonly retryable: boolean};
    };

export interface MealImageRemoteAdapter {
  upload(input: {
    readonly objectPath: string;
    readonly localUri: string;
    readonly mimeType: string;
  }): Promise<MealImageRemoteMutationResult>;
  resolve(objectPath: string): Promise<string>;
  remove(objectPath: string): Promise<void>;
}

export interface MealImageObjectNameGenerator {
  next(): string;
}

/** Product UI uses this small Interface without learning Firebase or files. */
export interface MealImagesRuntime {
  readonly store: JournalMediaStore;
  pick(source: 'camera' | 'library'): Promise<MealImagePickResult>;
  resolve(image: MealImageSnapshot): Promise<string | undefined>;
  /** Releases browser object URLs. Native runtimes do not need this hook. */
  release?(resolvedUri: string): void;
}

export type MealImagePickResult =
  | {
      readonly kind: 'selected';
      readonly image: {
        readonly uri: string;
        readonly mimeType: string;
        readonly fileName?: string;
        readonly byteSize?: number;
        readonly widthPx?: number;
        readonly heightPx?: number;
      };
    }
  | {readonly kind: 'cancelled'}
  | {
      readonly kind: 'error';
      readonly code:
        | 'permission_denied'
        | 'selection_failed'
        | 'unavailable'
        | 'too_large';
      readonly message: string;
    };
