import type {
  ActivitySnapshot,
  ActivityExternalEventLink,
} from '../domain/activities';
import {createExternalRecordKey} from '../domain/identifiers';
import type {
  ExternalIdentityNamespace,
  ExternalRecordReference,
} from '../domain/externalRecords';
import type {MealExternalEventLink, MealSnapshot} from '../domain/meals';
import {invalid, issue, valid} from '../domain/validation';
import type {ParseResult} from '../domain/validation';
import {VALIDATION_ISSUE_CODES} from '../domain/validation';
import {
  decodeRemoteActivityDocument,
  decodeRemoteMealDocument,
} from './remoteDocumentCodec';
import {
  JOURNAL_REMOTE_DOCUMENT_SCHEMA_VERSION,
  type RemoteActivityDocument,
  type RemoteExternalRecordIdentity,
  type RemoteMealDocument,
} from './remoteDocumentTypes';

const safeStoredImage = (snapshot: MealSnapshot) => {
  const image = snapshot.image;
  if (
    image === undefined ||
    image.syncState.kind !== 'available' ||
    image.syncState.objectName === undefined ||
    image.syncState.objectPath === undefined
  ) {
    return undefined;
  }
  const expectedPath = `users/${snapshot.scope.productUserId}/workspaces/${snapshot.scope.workspaceId}/mealImages/${snapshot.id}/${image.syncState.objectName}`;
  if (
    image.syncState.objectPath !== expectedPath ||
    !/^image_[0-9a-f]{32}\.(?:jpg|png|webp|heic|heif)$/.test(
      image.syncState.objectName,
    )
  ) {
    return undefined;
  }
  return {
    kind: 'stored' as const,
    objectName: image.syncState.objectName,
    mimeType: image.mimeType,
    ...(image.byteSize === undefined ? {} : {byteSize: image.byteSize}),
    ...(image.widthPx === undefined ? {} : {widthPx: image.widthPx}),
    ...(image.heightPx === undefined ? {} : {heightPx: image.heightPx}),
  };
};

const selectPrimaryIdentity = (
  reference: ExternalRecordReference,
):
  | {readonly namespace: ExternalIdentityNamespace; readonly value: string}
  | undefined => {
  if (reference.identifiers._id !== undefined) {
    return {namespace: '_id', value: reference.identifiers._id};
  }
  if (reference.identifiers.identifier !== undefined) {
    return {namespace: 'identifier', value: reference.identifiers.identifier};
  }
  return reference.identifiers.syncIdentifier === undefined
    ? undefined
    : {
        namespace: 'syncIdentifier',
        value: reference.identifiers.syncIdentifier,
      };
};

const projectIdentity = (
  reference: ExternalRecordReference,
): ParseResult<RemoteExternalRecordIdentity> => {
  const primary = selectPrimaryIdentity(reference);
  if (primary === undefined) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        ['externalLinks', 'identity'],
        'A remote link needs one stable Nightscout identity.',
      ),
    ]);
  }
  const expectedRecordKey = createExternalRecordKey(
    reference.nightscoutSourceId,
    primary.namespace,
    primary.value,
  );
  if (expectedRecordKey !== reference.recordKey) {
    return invalid([
      issue(
        VALIDATION_ISSUE_CODES.INVARIANT,
        ['externalLinks', 'identity', 'recordKey'],
        'The record key does not match its stable Nightscout identity.',
      ),
    ]);
  }
  return valid({
    nightscoutSourceId: reference.nightscoutSourceId,
    recordKey: reference.recordKey,
    namespace: primary.namespace,
    value: primary.value,
  });
};

const projectLinks = <
  TLink extends MealExternalEventLink | ActivityExternalEventLink,
>(
  links: readonly TLink[],
): ParseResult<
  readonly {
    readonly identity: RemoteExternalRecordIdentity;
    readonly role: TLink['role'];
    readonly linkedAt: number;
  }[]
> => {
  const output: {
    identity: RemoteExternalRecordIdentity;
    role: TLink['role'];
    linkedAt: number;
  }[] = [];
  for (const link of links) {
    const identity = projectIdentity(link.record);
    if (!identity.ok) {
      return identity;
    }
    output.push({
      identity: identity.value,
      role: link.role,
      linkedAt: link.linkedAt,
    });
  }
  return valid(output);
};

export const projectMealRemoteDocument = (
  snapshot: MealSnapshot,
): ParseResult<RemoteMealDocument> => {
  const externalLinks = projectLinks(snapshot.externalLinks);
  if (!externalLinks.ok) {
    return externalLinks;
  }
  const storedImage = safeStoredImage(snapshot);
  const untrustedDocument: unknown = {
    schemaVersion: JOURNAL_REMOTE_DOCUMENT_SCHEMA_VERSION,
    documentKind: 'meal',
    scope: {
      ownerProductUserId: snapshot.scope.productUserId,
      workspaceId: snapshot.scope.workspaceId,
      nightscoutSourceId: snapshot.scope.nightscoutSourceId,
    },
    entityId: snapshot.id,
    revision: snapshot.revision,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    lifecycle: snapshot.lifecycle,
    mealStart: snapshot.mealStart,
    ...(snapshot.name === undefined ? {} : {name: snapshot.name}),
    ...(snapshot.mealCarbohydrates === undefined
      ? {}
      : {mealCarbohydrates: snapshot.mealCarbohydrates}),
    image:
      snapshot.image === undefined
        ? {kind: 'none'}
        : storedImage ?? {
            kind: 'omitted',
            reason: 'remote_object_identity_unavailable',
          },
    ...(snapshot.notes === undefined ? {} : {notes: snapshot.notes}),
    tags: snapshot.tags,
    externalLinks: externalLinks.value,
  };
  return decodeRemoteMealDocument(untrustedDocument);
};

export const projectActivityRemoteDocument = (
  snapshot: ActivitySnapshot,
): ParseResult<RemoteActivityDocument> => {
  const externalLinks = projectLinks(snapshot.externalLinks);
  if (!externalLinks.ok) {
    return externalLinks;
  }
  const untrustedDocument: unknown = {
    schemaVersion: JOURNAL_REMOTE_DOCUMENT_SCHEMA_VERSION,
    documentKind: 'activity',
    scope: {
      ownerProductUserId: snapshot.scope.productUserId,
      workspaceId: snapshot.scope.workspaceId,
      nightscoutSourceId: snapshot.scope.nightscoutSourceId,
    },
    entityId: snapshot.id,
    revision: snapshot.revision,
    createdAt: snapshot.createdAt,
    updatedAt: snapshot.updatedAt,
    lifecycle: snapshot.lifecycle,
    category: snapshot.category,
    ...(snapshot.customName === undefined
      ? {}
      : {customName: snapshot.customName}),
    startedAt: snapshot.startedAt,
    ...(snapshot.endedAt === undefined ? {} : {endedAt: snapshot.endedAt}),
    ...(snapshot.intensity === undefined
      ? {}
      : {intensity: snapshot.intensity}),
    ...(snapshot.notes === undefined ? {} : {notes: snapshot.notes}),
    tags: snapshot.tags,
    externalLinks: externalLinks.value,
  };
  return decodeRemoteActivityDocument(untrustedDocument);
};
