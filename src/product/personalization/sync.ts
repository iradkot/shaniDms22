import type {
  PersonalizationLayout,
  StoredAccountPersonalization,
  StoredLayoutProfile,
  StoredProductPersonalization,
  StoredWorkspacePersonalization,
} from './types';
import type {ProductPersonalizationStorageScope} from './persistence';
import {
  parseStoredAccountPersonalization,
  parseStoredLayoutProfile,
  parseStoredProductPersonalization,
  parseStoredWorkspacePersonalization,
} from './validation';

export const PERSONALIZATION_SYNC_SECTION_IDS = [
  'account',
  'workspace',
  'layout:phone',
  'layout:tablet',
  'layout:desktop',
] as const;

export type PersonalizationSyncSectionId =
  (typeof PERSONALIZATION_SYNC_SECTION_IDS)[number];

export interface ProductPersonalizationSyncScope
  extends ProductPersonalizationStorageScope {
  /** Derived identifier only. It never contains a Nightscout URL or secret. */
  readonly nightscoutSourceId: string;
}

interface SyncMutationBase {
  readonly schemaVersion: 1;
  readonly ownerProductUserId: string;
  readonly mutationId: string;
  readonly savedAt: number;
}

export interface AccountPersonalizationSyncMutation extends SyncMutationBase {
  readonly section: 'account';
  readonly value: StoredAccountPersonalization;
}

export interface WorkspacePersonalizationSyncMutation
  extends SyncMutationBase {
  readonly section: 'workspace';
  readonly workspaceId: string;
  readonly nightscoutSourceId: string;
  readonly value: StoredWorkspacePersonalization;
}

export interface LayoutPersonalizationSyncMutation extends SyncMutationBase {
  readonly section: `layout:${PersonalizationLayout}`;
  readonly layout: PersonalizationLayout;
  readonly value: StoredLayoutProfile;
}

export type PersonalizationSyncMutation =
  | AccountPersonalizationSyncMutation
  | WorkspacePersonalizationSyncMutation
  | LayoutPersonalizationSyncMutation;

export type RemotePersonalizationSnapshot = PersonalizationSyncMutation & {
  readonly revision: number;
};

export interface ProductPersonalizationRemoteAdapter {
  fetch(
    scope: ProductPersonalizationSyncScope,
    section: PersonalizationSyncSectionId,
  ): Promise<RemotePersonalizationSnapshot | undefined>;
  /**
   * Returns the deterministic winner. A returned different mutation means the
   * server already held a later value according to compareSyncPrecedence.
   */
  commit(
    scope: ProductPersonalizationSyncScope,
    mutation: PersonalizationSyncMutation,
  ): Promise<RemotePersonalizationSnapshot>;
}

export const personalizationSyncSections =
  (): readonly PersonalizationSyncSectionId[] =>
    PERSONALIZATION_SYNC_SECTION_IDS;

const layoutFromSection = (
  section: PersonalizationSyncSectionId,
): PersonalizationLayout | undefined => {
  switch (section) {
    case 'layout:phone':
      return 'phone';
    case 'layout:tablet':
      return 'tablet';
    case 'layout:desktop':
      return 'desktop';
    case 'account':
    case 'workspace':
      return undefined;
  }
};

export const isPersonalizationSyncSectionId = (
  value: unknown,
): value is PersonalizationSyncSectionId =>
  typeof value === 'string' &&
  PERSONALIZATION_SYNC_SECTION_IDS.includes(
    value as PersonalizationSyncSectionId,
  );

export const buildPersonalizationSyncMutation = (input: {
  readonly scope: ProductPersonalizationSyncScope;
  readonly section: PersonalizationSyncSectionId;
  readonly preferences: StoredProductPersonalization;
  readonly mutationId: string;
  readonly savedAt: number;
}): PersonalizationSyncMutation => {
  const common = {
    schemaVersion: 1 as const,
    ownerProductUserId: input.scope.productUserId,
    mutationId: input.mutationId,
    savedAt: input.savedAt,
  };
  if (input.section === 'account') {
    return {
      ...common,
      section: 'account',
      value: parseStoredAccountPersonalization(input.preferences.account),
    };
  }
  if (input.section === 'workspace') {
    return {
      ...common,
      section: 'workspace',
      workspaceId: input.scope.workspaceId,
      nightscoutSourceId: input.scope.nightscoutSourceId,
      value: parseStoredWorkspacePersonalization(input.preferences.workspace),
    };
  }
  const layout = layoutFromSection(input.section);
  const profile = input.preferences.layout.profiles.find(
    candidate => candidate.layout === layout,
  );
  if (layout === undefined || profile === undefined) {
    throw new Error(`Missing ${input.section} personalization profile.`);
  }
  return {
    ...common,
    section: input.section,
    layout,
    value: parseStoredLayoutProfile(profile),
  };
};

export const applyPersonalizationSyncMutation = (
  current: StoredProductPersonalization,
  mutation: PersonalizationSyncMutation,
): StoredProductPersonalization => {
  if (mutation.section === 'account') {
    return parseStoredProductPersonalization({
      ...current,
      account: parseStoredAccountPersonalization(mutation.value),
    });
  }
  if (mutation.section === 'workspace') {
    return parseStoredProductPersonalization({
      ...current,
      workspace: parseStoredWorkspacePersonalization(mutation.value),
    });
  }
  const profile = parseStoredLayoutProfile(mutation.value);
  return parseStoredProductPersonalization({
    ...current,
    layout: {
      ...current.layout,
      profiles: current.layout.profiles.map(candidate =>
        candidate.layout === profile.layout ? profile : candidate,
      ),
    },
  });
};

export const personalizationSectionChanged = (
  before: StoredProductPersonalization,
  after: StoredProductPersonalization,
  section: PersonalizationSyncSectionId,
): boolean => {
  const mutationInput = {
    scope: {
      productUserId: 'comparison-user',
      workspaceId: 'comparison-workspace',
      nightscoutSourceId: 'comparison-source',
      layout: 'phone' as const,
    },
    section,
    mutationId: 'comparison',
    savedAt: 0,
  };
  const beforeValue = buildPersonalizationSyncMutation({
    ...mutationInput,
    preferences: before,
  }).value;
  const afterValue = buildPersonalizationSyncMutation({
    ...mutationInput,
    preferences: after,
  }).value;
  return JSON.stringify(beforeValue) !== JSON.stringify(afterValue);
};

/** Last writer wins by local save time, then by opaque mutation ID. */
export const compareSyncPrecedence = (
  left: Pick<PersonalizationSyncMutation, 'savedAt' | 'mutationId'>,
  right: Pick<PersonalizationSyncMutation, 'savedAt' | 'mutationId'>,
): number =>
  left.savedAt === right.savedAt
    ? left.mutationId.localeCompare(right.mutationId)
    : left.savedAt - right.savedAt;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const hasExactly = (value: Record<string, unknown>, keys: readonly string[]) => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

const safeId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);

const safeTimestamp = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value >= 0;

const safeRevision = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value > 0;

export type PersonalizationRemoteDocument = Readonly<Record<string, unknown>>;

export const encodeRemotePersonalizationDocument = (
  snapshot: RemotePersonalizationSnapshot,
): PersonalizationRemoteDocument => {
  if (snapshot.section === 'account') {
    return {
      schemaVersion: 1,
      documentKind: 'account_personalization',
      ownerProductUserId: snapshot.ownerProductUserId,
      revision: snapshot.revision,
      mutationId: snapshot.mutationId,
      savedAt: snapshot.savedAt,
      value: snapshot.value,
    };
  }
  if (snapshot.section === 'workspace') {
    return {
      schemaVersion: 1,
      documentKind: 'workspace_personalization',
      ownerProductUserId: snapshot.ownerProductUserId,
      workspaceId: snapshot.workspaceId,
      nightscoutSourceId: snapshot.nightscoutSourceId,
      revision: snapshot.revision,
      mutationId: snapshot.mutationId,
      savedAt: snapshot.savedAt,
      value: snapshot.value,
    };
  }
  return {
    schemaVersion: 1,
    documentKind: 'layout_personalization',
    ownerProductUserId: snapshot.ownerProductUserId,
    layout: snapshot.layout,
    revision: snapshot.revision,
    mutationId: snapshot.mutationId,
    savedAt: snapshot.savedAt,
    value: snapshot.value,
  };
};

export const decodeRemotePersonalizationDocument = (
  untrusted: unknown,
  expectedScope: ProductPersonalizationSyncScope,
  expectedSection: PersonalizationSyncSectionId,
): RemotePersonalizationSnapshot => {
  if (!isRecord(untrusted)) {
    throw new Error('Remote personalization document is not an object.');
  }
  const commonKeys = [
    'schemaVersion',
    'documentKind',
    'ownerProductUserId',
    'revision',
    'mutationId',
    'savedAt',
    'value',
  ];
  const expectedKeys =
    expectedSection === 'workspace'
      ? [...commonKeys, 'workspaceId', 'nightscoutSourceId']
      : expectedSection === 'account'
      ? commonKeys
      : [...commonKeys, 'layout'];
  if (
    !hasExactly(untrusted, expectedKeys) ||
    untrusted.schemaVersion !== 1 ||
    untrusted.ownerProductUserId !== expectedScope.productUserId ||
    !safeRevision(untrusted.revision) ||
    !safeId(untrusted.mutationId) ||
    !safeTimestamp(untrusted.savedAt)
  ) {
    throw new Error('Remote personalization document is invalid.');
  }
  const common = {
    schemaVersion: 1 as const,
    ownerProductUserId: expectedScope.productUserId,
    revision: untrusted.revision,
    mutationId: untrusted.mutationId,
    savedAt: untrusted.savedAt,
  };
  if (expectedSection === 'account') {
    if (untrusted.documentKind !== 'account_personalization') {
      throw new Error('Remote Account personalization kind is invalid.');
    }
    return {
      ...common,
      section: 'account',
      value: parseStoredAccountPersonalization(untrusted.value),
    };
  }
  if (expectedSection === 'workspace') {
    if (
      untrusted.documentKind !== 'workspace_personalization' ||
      untrusted.workspaceId !== expectedScope.workspaceId ||
      untrusted.nightscoutSourceId !== expectedScope.nightscoutSourceId
    ) {
      throw new Error('Remote Workspace personalization scope is invalid.');
    }
    return {
      ...common,
      section: 'workspace',
      workspaceId: expectedScope.workspaceId,
      nightscoutSourceId: expectedScope.nightscoutSourceId,
      value: parseStoredWorkspacePersonalization(untrusted.value),
    };
  }
  const layout = layoutFromSection(expectedSection);
  if (
    layout === undefined ||
    untrusted.documentKind !== 'layout_personalization' ||
    untrusted.layout !== layout
  ) {
    throw new Error('Remote Layout personalization scope is invalid.');
  }
  const profile = parseStoredLayoutProfile(untrusted.value);
  if (profile.layout !== layout) {
    throw new Error('Remote Layout Profile does not match its document.');
  }
  return {
    ...common,
    section: expectedSection,
    layout,
    value: profile,
  };
};

export const validatePersonalizationSyncMutation = (
  untrusted: unknown,
  expectedScope: ProductPersonalizationSyncScope,
  expectedSection: PersonalizationSyncSectionId,
): PersonalizationSyncMutation => {
  if (!isRecord(untrusted)) {
    throw new Error('Personalization sync mutation is not an object.');
  }
  const commonKeys = [
    'schemaVersion',
    'section',
    'ownerProductUserId',
    'mutationId',
    'savedAt',
    'value',
  ];
  const expectedKeys =
    expectedSection === 'workspace'
      ? [...commonKeys, 'workspaceId', 'nightscoutSourceId']
      : expectedSection === 'account'
      ? commonKeys
      : [...commonKeys, 'layout'];
  if (
    !hasExactly(untrusted, expectedKeys) ||
    untrusted.schemaVersion !== 1 ||
    untrusted.section !== expectedSection ||
    untrusted.ownerProductUserId !== expectedScope.productUserId ||
    !safeId(untrusted.mutationId) ||
    !safeTimestamp(untrusted.savedAt)
  ) {
    throw new Error('Personalization sync mutation is invalid.');
  }
  const common = {
    schemaVersion: 1 as const,
    ownerProductUserId: expectedScope.productUserId,
    mutationId: untrusted.mutationId,
    savedAt: untrusted.savedAt,
  };
  if (expectedSection === 'account') {
    return {
      ...common,
      section: 'account',
      value: parseStoredAccountPersonalization(untrusted.value),
    };
  }
  if (expectedSection === 'workspace') {
    if (
      untrusted.workspaceId !== expectedScope.workspaceId ||
      untrusted.nightscoutSourceId !== expectedScope.nightscoutSourceId
    ) {
      throw new Error('Personalization sync mutation scope is invalid.');
    }
    return {
      ...common,
      section: 'workspace',
      workspaceId: expectedScope.workspaceId,
      nightscoutSourceId: expectedScope.nightscoutSourceId,
      value: parseStoredWorkspacePersonalization(untrusted.value),
    };
  }
  const layout = layoutFromSection(expectedSection);
  if (layout === undefined || untrusted.layout !== layout) {
    throw new Error('Personalization sync mutation layout is invalid.');
  }
  const profile = parseStoredLayoutProfile(untrusted.value);
  if (profile.layout !== layout) {
    throw new Error('Personalization sync mutation profile is invalid.');
  }
  return {
    ...common,
    section: expectedSection,
    layout,
    value: profile,
  };
};
