import type {UpdateCenterItem} from '../domain/updates';

export type UpdateCenterSnapshot =
  | {readonly status: 'loading'}
  | {readonly status: 'ready'; readonly items: readonly UpdateCenterItem[]}
  | {readonly status: 'error'};

/** Local-first observation seam. The UI has no Firebase dependency. */
export interface UpdateCenterRepository {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => UpdateCenterSnapshot;
  readonly refresh: () => Promise<void>;
  readonly markRead: (itemId: string) => Promise<void>;
}

export type NewUpdateCenterItem = Omit<
  UpdateCenterItem,
  'id' | 'readState'
> & {
  /**
   * Stable producer key used to make an offline retry idempotent. It is not
   * stored as health content or uploaded as a separate field.
   */
  readonly idempotencyKey?: string;
};

/** Write-capable seam used by app-owned alert and reminder producers. */
export interface AppOwnedUpdateCenterRepository
  extends UpdateCenterRepository {
  readonly append: (item: NewUpdateCenterItem) => Promise<UpdateCenterItem>;
}
