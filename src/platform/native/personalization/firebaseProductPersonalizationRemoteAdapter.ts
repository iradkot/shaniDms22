import {
  compareSyncPrecedence,
  decodeRemotePersonalizationDocument,
  encodeRemotePersonalizationDocument,
  validatePersonalizationSyncMutation,
  type PersonalizationSyncMutation,
  type PersonalizationSyncSectionId,
  type ProductPersonalizationRemoteAdapter,
  type ProductPersonalizationSyncScope,
  type RemotePersonalizationSnapshot,
} from '../../../product/personalization';

export type PersonalizationFirestoreDocumentSnapshot =
  | {readonly exists: false}
  | {readonly exists: true; readonly data: unknown};

export interface PersonalizationFirestoreTransaction {
  get(documentPath: string): Promise<PersonalizationFirestoreDocumentSnapshot>;
  set(documentPath: string, value: Readonly<Record<string, unknown>>): void;
}

export interface PersonalizationFirestoreGateway {
  get(documentPath: string): Promise<PersonalizationFirestoreDocumentSnapshot>;
  runTransaction<T>(
    operation: (
      transaction: PersonalizationFirestoreTransaction,
    ) => Promise<T>,
  ): Promise<T>;
}

export interface FirebaseProductPersonalizationRemoteAdapterDependencies {
  readonly gateway: PersonalizationFirestoreGateway;
  readonly authenticatedUid: () => string | null;
}

const safePathId = (value: string, label: string): string => {
  const normalized = value.trim();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(normalized)) {
    throw new Error(`${label} cannot be used in a Firestore path.`);
  }
  return normalized;
};

export const buildProductPersonalizationFirestorePath = (
  scope: ProductPersonalizationSyncScope,
  section: PersonalizationSyncSectionId,
): string => {
  const owner = safePathId(scope.productUserId, 'Product User ID');
  if (section === 'account') {
    return `users/${owner}/productPersonalization/account`;
  }
  if (section === 'workspace') {
    const workspace = safePathId(scope.workspaceId, 'Workspace ID');
    return `users/${owner}/workspaces/${workspace}/productPersonalization/current`;
  }
  return `users/${owner}/productPersonalization/${section.replace(':', '_')}`;
};

const assertOwner = (
  authenticatedUid: string | null,
  scope: ProductPersonalizationSyncScope,
) => {
  if (authenticatedUid === null || authenticatedUid !== scope.productUserId) {
    throw new Error(
      'The signed-in user cannot access these product preferences.',
    );
  }
};

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`;
  }
  if (typeof value !== 'object' || value === null) {
    return JSON.stringify(value);
  }
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonical(nested)}`)
    .join(',')}}`;
};

const sameMutation = (
  current: RemotePersonalizationSnapshot,
  incoming: PersonalizationSyncMutation,
): boolean =>
  canonical(
    encodeRemotePersonalizationDocument({...current, revision: 1}),
  ) ===
  canonical(
    encodeRemotePersonalizationDocument({...incoming, revision: 1}),
  );

export const createFirebaseProductPersonalizationRemoteAdapter = (
  dependencies: FirebaseProductPersonalizationRemoteAdapterDependencies,
): ProductPersonalizationRemoteAdapter => ({
  async fetch(scope, section) {
    assertOwner(dependencies.authenticatedUid(), scope);
    const snapshot = await dependencies.gateway.get(
      buildProductPersonalizationFirestorePath(scope, section),
    );
    return snapshot.exists
      ? decodeRemotePersonalizationDocument(snapshot.data, scope, section)
      : undefined;
  },

  async commit(scope, untrustedMutation) {
    assertOwner(dependencies.authenticatedUid(), scope);
    const mutation = validatePersonalizationSyncMutation(
      untrustedMutation,
      scope,
      untrustedMutation.section,
    );
    const path = buildProductPersonalizationFirestorePath(
      scope,
      mutation.section,
    );
    return dependencies.gateway.runTransaction(async transaction => {
      const existing = await transaction.get(path);
      if (!existing.exists) {
        const created: RemotePersonalizationSnapshot = {
          ...mutation,
          revision: 1,
        };
        transaction.set(path, encodeRemotePersonalizationDocument(created));
        return created;
      }
      const current = decodeRemotePersonalizationDocument(
        existing.data,
        scope,
        mutation.section,
      );
      if (current.mutationId === mutation.mutationId) {
        if (!sameMutation(current, mutation)) {
          throw new Error(
            'Personalization mutation ID is bound to different content.',
          );
        }
        return current;
      }
      if (compareSyncPrecedence(mutation, current) <= 0) {
        return current;
      }
      const replacement: RemotePersonalizationSnapshot = {
        ...mutation,
        revision: current.revision + 1,
      };
      transaction.set(
        path,
        encodeRemotePersonalizationDocument(replacement),
      );
      return replacement;
    });
  },
});
