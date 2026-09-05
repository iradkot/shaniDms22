import type {
  JournalMediaStore,
  JournalWorkspaceScope,
  MealImageSnapshot,
} from '../../../modules/journal';
import {
  DurableMealImageDeletionQueue,
  MEAL_IMAGE_MAX_BYTES,
  OfflineFirstMealImageStore,
  type MealImagePickResult,
  type MealImageRemoteAdapter,
  type MealImagesRuntime,
} from '../../../modules/mealMedia';
import type {BrowserFirebaseAuth} from '../auth';
import type {IndexedDbKeyValueStore} from '../storage';
import {
  IndexedDbMealImageBlobRepository,
  type BrowserMealImageBlobRepository,
} from './browserMealImageBlobStore';
import {
  createBrowserMealImageFileAdapter,
  isBrowserMealImageLocalUri,
} from './browserMealImageFileAdapter';
import {
  createFirebaseStorageRestMealImageRemoteAdapter,
  type BrowserFirebaseMealImageRemoteAdapter,
} from './firebaseStorageRestMealImageRemoteAdapter';

const MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

interface BlobUrlEntry {
  readonly key: string;
  readonly url: string;
  references: number;
}

class BrowserBlobUrlRegistry {
  private readonly entries = new Map<string, BlobUrlEntry>();
  private readonly byUrl = new Map<string, BlobUrlEntry>();
  private readonly pending = new Map<string, Promise<string | undefined>>();

  constructor(
    private readonly create: (blob: Blob) => string,
    private readonly revoke: (url: string) => void,
  ) {}

  async acquire(
    key: string,
    load: () => Promise<Blob | undefined>,
  ): Promise<string | undefined> {
    const cached = this.entries.get(key);
    if (cached !== undefined) {
      cached.references += 1;
      return cached.url;
    }
    let pending = this.pending.get(key);
    if (pending === undefined) {
      pending = load().then(blob => {
        if (blob === undefined) {
          return undefined;
        }
        const url = this.create(blob);
        const entry: BlobUrlEntry = {key, url, references: 0};
        this.entries.set(key, entry);
        this.byUrl.set(url, entry);
        return url;
      });
      this.pending.set(key, pending);
      pending.finally(() => this.pending.delete(key)).catch(() => undefined);
    }
    const url = await pending;
    if (url !== undefined) {
      const entry = this.entries.get(key);
      if (entry !== undefined) {
        entry.references += 1;
      }
    }
    return url;
  }

  release(url: string): void {
    const entry = this.byUrl.get(url);
    if (entry === undefined) {
      return;
    }
    entry.references -= 1;
    if (entry.references > 0) {
      return;
    }
    this.entries.delete(entry.key);
    this.byUrl.delete(entry.url);
    this.revoke(entry.url);
  }

  dispose(): void {
    this.byUrl.forEach(entry => this.revoke(entry.url));
    this.entries.clear();
    this.byUrl.clear();
  }
}

const scopedStrings = (
  storage: Pick<IndexedDbKeyValueStore, 'getItem' | 'setItem'>,
  scope: JournalWorkspaceScope,
) => {
  const prefix = `shani.web.meal-media-queue.v1:${scope.productUserId}:${scope.workspaceId}:`;
  return {
    getItem: (key: string) => storage.getItem(`${prefix}${key}`),
    setItem: (key: string, value: string) =>
      storage.setItem(`${prefix}${key}`, value),
  };
};

const randomObjectName = (crypto: Pick<Crypto, 'getRandomValues'>): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `image_${[...bytes]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('')}`;
};

const localUri = (image: MealImageSnapshot): string | undefined =>
  image.syncState.localUri;

const remotePath = (image: MealImageSnapshot): string | undefined =>
  image.syncState.kind === 'available' ? image.syncState.objectPath : undefined;

const createPicker =
  (input: {
    readonly document?: Document;
    readonly createObjectUrl: (blob: Blob) => string;
    readonly pickedUrls: Set<string>;
  }): ((source: 'camera' | 'library') => Promise<MealImagePickResult>) =>
  async source => {
    if (
      input.document === undefined ||
      typeof input.document.createElement !== 'function' ||
      input.document.body === undefined
    ) {
      return {
        kind: 'error',
        code: 'unavailable',
        message: 'Image selection is unavailable in this browser.',
      };
    }
    const file = await new Promise<File | undefined>(resolve => {
      const picker = input.document!.createElement('input');
      picker.type = 'file';
      picker.accept = 'image/jpeg,image/png,image/webp,image/heic,image/heif';
      if (source === 'camera') {
        picker.setAttribute('capture', 'environment');
      }
      picker.style.display = 'none';
      const finish = (selected?: File) => {
        picker.remove();
        resolve(selected);
      };
      picker.onchange = () => finish(picker.files?.[0]);
      picker.addEventListener('cancel', () => finish(), {once: true});
      input.document!.body.appendChild(picker);
      picker.click();
    });
    if (file === undefined) {
      return {kind: 'cancelled'};
    }
    const mimeType = file.type.toLocaleLowerCase('en-US');
    if (!MIME_TYPES.has(mimeType)) {
      return {
        kind: 'error',
        code: 'selection_failed',
        message: 'Choose a supported image (JPEG, PNG, WebP or HEIC).',
      };
    }
    if (file.size <= 0 || file.size > MEAL_IMAGE_MAX_BYTES) {
      return {
        kind: 'error',
        code: 'too_large',
        message: 'Meal Images must be 10 MB or smaller.',
      };
    }
    const uri = input.createObjectUrl(file);
    input.pickedUrls.add(uri);
    return {
      kind: 'selected',
      image: {
        uri,
        mimeType,
        byteSize: file.size,
        ...(file.name.trim().length === 0 || file.name.length > 255
          ? {}
          : {fileName: file.name}),
      },
    };
  };

const queuedRemote = (
  delegate: BrowserFirebaseMealImageRemoteAdapter,
  queue: DurableMealImageDeletionQueue,
): {
  readonly adapter: MealImageRemoteAdapter;
  readonly retryPendingDeletions: () => Promise<{
    readonly removed: number;
    readonly pending: number;
  }>;
} => {
  const retryPendingDeletions = () =>
    queue.flush(objectPath => delegate.remove(objectPath));
  return {
    retryPendingDeletions,
    adapter: {
      async upload(input) {
        await retryPendingDeletions().catch(() => undefined);
        return delegate.upload(input);
      },
      resolve: objectPath => delegate.resolve(objectPath),
      async remove(objectPath) {
        await queue.enqueue(objectPath);
        await retryPendingDeletions().catch(() => undefined);
      },
    },
  };
};

export interface BrowserMealImagesRuntimeHandle {
  readonly runtime: MealImagesRuntime;
  readonly store: JournalMediaStore;
  readonly retryPendingDeletions: () => Promise<{
    readonly removed: number;
    readonly pending: number;
  }>;
  dispose(): void;
}

export const createBrowserMealImagesRuntime = (input: {
  readonly scope: JournalWorkspaceScope;
  readonly strings: Pick<IndexedDbKeyValueStore, 'getItem' | 'setItem'>;
  readonly auth?: Pick<BrowserFirebaseAuth, 'getIdToken'>;
  readonly storageBucket?: string;
  readonly indexedDbFactory?: IDBFactory;
  readonly blobs?: BrowserMealImageBlobRepository;
  readonly fetch?: typeof globalThis.fetch;
  readonly document?: Document;
  readonly eventTarget?: Pick<
    Window,
    'addEventListener' | 'removeEventListener'
  >;
  readonly crypto?: Pick<Crypto, 'getRandomValues'>;
  readonly createObjectUrl?: (blob: Blob) => string;
  readonly revokeObjectUrl?: (url: string) => void;
}): BrowserMealImagesRuntimeHandle => {
  const indexedDbFactory = input.indexedDbFactory ?? globalThis.indexedDB;
  if (input.blobs === undefined && indexedDbFactory === undefined) {
    throw new Error('This browser cannot store Meal Images offline.');
  }
  const blobs =
    input.blobs ?? new IndexedDbMealImageBlobRepository(indexedDbFactory);
  const createObjectUrl =
    input.createObjectUrl ?? URL.createObjectURL.bind(URL);
  const revokeObjectUrl =
    input.revokeObjectUrl ?? URL.revokeObjectURL.bind(URL);
  const urls = new BrowserBlobUrlRegistry(createObjectUrl, revokeObjectUrl);
  const pickedUrls = new Set<string>();
  const releasePickedUri = (uri: string) => {
    if (pickedUrls.delete(uri)) {
      revokeObjectUrl(uri);
    }
  };
  const remote =
    input.auth !== undefined && input.storageBucket !== undefined
      ? createFirebaseStorageRestMealImageRemoteAdapter({
          scope: input.scope,
          auth: input.auth,
          storageBucket: input.storageBucket,
          blobs,
          ...(input.fetch === undefined ? {} : {fetch: input.fetch}),
          createObjectUrl,
        })
      : undefined;
  const queue = new DurableMealImageDeletionQueue(
    scopedStrings(input.strings, input.scope),
  );
  const queued = remote === undefined ? undefined : queuedRemote(remote, queue);
  const store = new OfflineFirstMealImageStore({
    files: createBrowserMealImageFileAdapter({
      scope: input.scope,
      blobs,
      ...(input.fetch === undefined ? {} : {fetch: input.fetch}),
      releasePickedUri,
    }),
    objectNames: {
      next: () => randomObjectName(input.crypto ?? globalThis.crypto),
    },
    ...(queued === undefined ? {} : {remote: queued.adapter}),
  });
  const pick = createPicker({
    document: input.document ?? globalThis.document,
    createObjectUrl,
    pickedUrls,
  });
  const retryPendingDeletions = () =>
    queued?.retryPendingDeletions() ??
    Promise.resolve({removed: 0, pending: 0});
  const online = () => {
    retryPendingDeletions().catch(() => undefined);
    blobs.pruneUploaded().catch(() => undefined);
  };
  const candidateEventTarget = input.eventTarget ?? globalThis.window;
  const eventTarget =
    candidateEventTarget !== undefined &&
    typeof candidateEventTarget.addEventListener === 'function' &&
    typeof candidateEventTarget.removeEventListener === 'function'
      ? candidateEventTarget
      : undefined;
  eventTarget?.addEventListener('online', online);
  online();

  const runtime: MealImagesRuntime = {
    store,
    pick,
    async resolve(image) {
      const local = localUri(image);
      if (
        local !== undefined &&
        isBrowserMealImageLocalUri(input.scope, local)
      ) {
        const resolved = await urls.acquire(local, () => blobs.get(local));
        if (resolved !== undefined) {
          return resolved;
        }
      } else if (
        local !== undefined &&
        /^(?:blob:|data:image\/|https:)/.test(local)
      ) {
        return local;
      }
      const objectPath = remotePath(image);
      return objectPath === undefined || remote === undefined
        ? undefined
        : urls.acquire(`remote:${objectPath}`, () =>
            remote.download(objectPath),
          );
    },
    release: uri => {
      if (pickedUrls.has(uri)) {
        releasePickedUri(uri);
      } else {
        urls.release(uri);
      }
    },
  };

  return {
    runtime,
    store,
    retryPendingDeletions,
    dispose() {
      eventTarget?.removeEventListener('online', online);
      urls.dispose();
      pickedUrls.forEach(revokeObjectUrl);
      pickedUrls.clear();
    },
  };
};
