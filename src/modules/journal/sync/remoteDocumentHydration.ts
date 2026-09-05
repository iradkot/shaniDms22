import type {
  ActivityExternalEventLink,
  ActivitySnapshot,
} from '../domain/activities';
import type {ExternalRecordReference} from '../domain/externalRecords';
import type {JournalWorkspaceScope} from '../domain/journal';
import {deriveReportedCarbohydrates} from '../domain/meals';
import type {MealExternalEventLink, MealSnapshot} from '../domain/meals';
import type {
  RemoteActivityDocument,
  RemoteExternalRecordIdentity,
  RemoteMealDocument,
} from './remoteDocumentTypes';

const hydrateMealImage = (
  document: RemoteMealDocument,
): MealSnapshot['image'] => {
  if (document.image.kind !== 'stored') {
    return undefined;
  }
  const objectPath = `users/${document.scope.ownerProductUserId}/workspaces/${document.scope.workspaceId}/mealImages/${document.entityId}/${document.image.objectName}`;
  const storageUri = `storage-object://${encodeURIComponent(objectPath)}`;
  return {
    mimeType: document.image.mimeType,
    ...(document.image.byteSize === undefined
      ? {}
      : {byteSize: document.image.byteSize}),
    ...(document.image.widthPx === undefined
      ? {}
      : {widthPx: document.image.widthPx}),
    ...(document.image.heightPx === undefined
      ? {}
      : {heightPx: document.image.heightPx}),
    syncState: {
      kind: 'available',
      objectName: document.image.objectName,
      objectPath,
      displayUri: storageUri,
      thumbnailUri: storageUri,
    },
  };
};

const referenceFrom = (
  identity: RemoteExternalRecordIdentity,
): ExternalRecordReference => ({
  nightscoutSourceId: identity.nightscoutSourceId,
  recordKey: identity.recordKey,
  identifiers: {[identity.namespace]: identity.value},
});

const mealLinksFrom = (
  document: RemoteMealDocument,
): readonly MealExternalEventLink[] =>
  document.externalLinks.map(link => ({
    record: referenceFrom(link.identity),
    role: link.role,
    linkedAt: link.linkedAt,
    external: {
      kind: 'unavailable',
      checkedAt: link.linkedAt,
      reason: 'unknown',
    },
  })) as readonly MealExternalEventLink[];

const activityLinksFrom = (
  document: RemoteActivityDocument,
): readonly ActivityExternalEventLink[] =>
  document.externalLinks.map(link => ({
    record: referenceFrom(link.identity),
    role: link.role,
    linkedAt: link.linkedAt,
    external: {
      kind: 'unavailable',
      checkedAt: link.linkedAt,
      reason: 'unknown',
    },
  })) as readonly ActivityExternalEventLink[];

export const hydrateRemoteMealDocument = (
  document: RemoteMealDocument,
  scope: JournalWorkspaceScope,
  syncedAt: number,
): MealSnapshot => {
  const externalLinks = mealLinksFrom(document);
  const reportedCarbohydrates = deriveReportedCarbohydrates(externalLinks);
  const image = hydrateMealImage(document);
  return {
    kind: 'meal',
    id: document.entityId,
    scope,
    revision: document.revision,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    lifecycle: document.lifecycle,
    syncState: {
      kind: 'synced',
      syncedAt,
      syncedRevision: document.revision,
    },
    mealStart: document.mealStart,
    ...(document.name === undefined ? {} : {name: document.name}),
    ...(document.mealCarbohydrates === undefined
      ? {}
      : {mealCarbohydrates: document.mealCarbohydrates}),
    ...(image === undefined ? {} : {image}),
    ...(document.notes === undefined ? {} : {notes: document.notes}),
    tags: document.tags,
    externalLinks,
    ...(reportedCarbohydrates === undefined ? {} : {reportedCarbohydrates}),
  };
};

export const hydrateRemoteActivityDocument = (
  document: RemoteActivityDocument,
  scope: JournalWorkspaceScope,
  syncedAt: number,
): ActivitySnapshot => ({
  kind: 'activity',
  id: document.entityId,
  scope,
  revision: document.revision,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
  lifecycle: document.lifecycle,
  syncState: {
    kind: 'synced',
    syncedAt,
    syncedRevision: document.revision,
  },
  category: document.category,
  ...(document.customName === undefined
    ? {}
    : {customName: document.customName}),
  startedAt: document.startedAt,
  ...(document.endedAt === undefined ? {} : {endedAt: document.endedAt}),
  ...(document.intensity === undefined ? {} : {intensity: document.intensity}),
  ...(document.notes === undefined ? {} : {notes: document.notes}),
  tags: document.tags,
  externalLinks: activityLinksFrom(document),
});
