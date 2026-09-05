import {
  createDefaultProductPersonalization,
  buildPersonalizationSyncMutation,
  decodeRemotePersonalizationDocument,
  encodeRemotePersonalizationDocument,
  type ProductPersonalizationSyncScope,
} from 'app/product/personalization';
import {
  buildProductPersonalizationFirestorePath,
  createFirebaseProductPersonalizationRemoteAdapter,
  type PersonalizationFirestoreDocumentSnapshot,
  type PersonalizationFirestoreGateway,
  type PersonalizationFirestoreTransaction,
} from 'app/platform/native/personalization/firebaseProductPersonalizationRemoteAdapter';
import {
  PERSONALIZATION_FIRESTORE_RULES_RELEASE_VERIFIED,
  createNativeProductPersonalizationRemoteRegistration,
} from 'app/platform/native/personalization/nativeFirebaseProductPersonalizationRemoteAdapter';

class MemoryGateway implements PersonalizationFirestoreGateway {
  readonly documents = new Map<string, Readonly<Record<string, unknown>>>();
  reads = 0;

  async get(path: string): Promise<PersonalizationFirestoreDocumentSnapshot> {
    this.reads += 1;
    const data = this.documents.get(path);
    return data === undefined ? {exists: false} : {exists: true, data};
  }

  async runTransaction<T>(
    operation: (transaction: PersonalizationFirestoreTransaction) => Promise<T>,
  ): Promise<T> {
    const staged = new Map<string, Readonly<Record<string, unknown>>>();
    const result = await operation({
      get: async path => {
        const data = staged.get(path) ?? this.documents.get(path);
        return data === undefined ? {exists: false} : {exists: true, data};
      },
      set: (path, value) => {
        staged.set(path, value);
      },
    });
    staged.forEach((value, path) => this.documents.set(path, value));
    return result;
  }
}

const scope: ProductPersonalizationSyncScope = {
  productUserId: 'owner-1',
  workspaceId: 'workspace-1',
  nightscoutSourceId: 'nightscout-1',
  layout: 'phone',
};

const mutation = (savedAt: number, mutationId: string) =>
  buildPersonalizationSyncMutation({
    scope,
    section: 'account',
    preferences: createDefaultProductPersonalization(),
    savedAt,
    mutationId,
  });

describe('Firebase Product Personalization remote adapter', () => {
  it('keeps a tested release gate with an explicit fail-closed override', () => {
    const gateway = new MemoryGateway();
    expect(PERSONALIZATION_FIRESTORE_RULES_RELEASE_VERIFIED).toBe(false);
    expect(
      createNativeProductPersonalizationRemoteRegistration({
        rulesVerified: false,
      }),
    ).toEqual({
      enabled: false,
      reason: 'firestore_rules_not_emulator_verified',
    });
    expect(
      createNativeProductPersonalizationRemoteRegistration({
        rulesVerified: true,
        gateway,
        authenticatedUid: () => 'owner-1',
      }).enabled,
    ).toBe(true);
  });

  it('uses owner, Workspace, and independent Layout document paths', () => {
    expect(buildProductPersonalizationFirestorePath(scope, 'account')).toBe(
      'users/owner-1/productPersonalization/account',
    );
    expect(buildProductPersonalizationFirestorePath(scope, 'workspace')).toBe(
      'users/owner-1/workspaces/workspace-1/productPersonalization/current',
    );
    expect(
      buildProductPersonalizationFirestorePath(scope, 'layout:tablet'),
    ).toBe('users/owner-1/productPersonalization/layout_tablet');
    expect(() =>
      buildProductPersonalizationFirestorePath(
        {...scope, workspaceId: '../other'},
        'workspace',
      ),
    ).toThrow('Workspace ID cannot be used in a Firestore path.');
  });

  it('rejects cross-owner access before touching Firestore', async () => {
    const gateway = new MemoryGateway();
    const adapter = createFirebaseProductPersonalizationRemoteAdapter({
      gateway,
      authenticatedUid: () => 'other-owner',
    });

    await expect(adapter.fetch(scope, 'account')).rejects.toThrow(
      'cannot access',
    );
    await expect(adapter.commit(scope, mutation(1, 'mutation_1'))).rejects.toThrow(
      'cannot access',
    );
    expect(gateway.reads).toBe(0);
    expect(gateway.documents.size).toBe(0);
  });

  it('commits idempotently and keeps the deterministic newer mutation', async () => {
    const gateway = new MemoryGateway();
    const adapter = createFirebaseProductPersonalizationRemoteAdapter({
      gateway,
      authenticatedUid: () => 'owner-1',
    });
    const first = mutation(10, 'mutation_a');
    const older = mutation(9, 'mutation_z');
    const newer = mutation(10, 'mutation_z');

    expect(await adapter.commit(scope, first)).toMatchObject({revision: 1});
    expect(await adapter.commit(scope, first)).toMatchObject({
      revision: 1,
      mutationId: 'mutation_a',
    });
    expect(await adapter.commit(scope, older)).toMatchObject({
      revision: 1,
      mutationId: 'mutation_a',
    });
    expect(await adapter.commit(scope, newer)).toMatchObject({
      revision: 2,
      mutationId: 'mutation_z',
    });
  });

  it('rejects unknown fields, credentials, and mismatched source scopes', () => {
    const workspaceMutation = buildPersonalizationSyncMutation({
      scope,
      section: 'workspace',
      preferences: createDefaultProductPersonalization(),
      savedAt: 1,
      mutationId: 'mutation_1',
    });
    const encoded = encodeRemotePersonalizationDocument({
      ...workspaceMutation,
      revision: 1,
    });

    expect(() =>
      decodeRemotePersonalizationDocument(
        {...encoded, apiKey: 'secret'},
        scope,
        'workspace',
      ),
    ).toThrow('invalid');
    expect(() =>
      decodeRemotePersonalizationDocument(
        {...encoded, nightscoutSourceId: 'nightscout-2'},
        scope,
        'workspace',
      ),
    ).toThrow('scope is invalid');
  });
});
