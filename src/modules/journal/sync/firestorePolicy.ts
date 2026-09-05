import type {JournalWorkspaceScope} from '../domain/journal';

export type JournalFirestoreScopeDecision =
  | {readonly allowed: true}
  | {
      readonly allowed: false;
      readonly reason:
        | 'missing_authentication'
        | 'authenticated_owner_mismatch';
    };

export const evaluateJournalFirestoreScope = (
  authenticatedUid: string | null | undefined,
  scope: JournalWorkspaceScope,
): JournalFirestoreScopeDecision => {
  if (authenticatedUid === undefined || authenticatedUid === null) {
    return {allowed: false, reason: 'missing_authentication'};
  }
  return authenticatedUid === scope.productUserId
    ? {allowed: true}
    : {allowed: false, reason: 'authenticated_owner_mismatch'};
};

const safePathSegment = (value: string, label: string): string => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error(`${label} cannot be used in a Firestore path.`);
  }
  return value;
};

export const buildJournalFirestorePaths = (
  scope: JournalWorkspaceScope,
  entityId: string,
  operationId: string,
): {readonly entry: string; readonly operation: string} => {
  const owner = safePathSegment(scope.productUserId, 'Product User ID');
  const workspace = safePathSegment(scope.workspaceId, 'Workspace ID');
  const entry = safePathSegment(entityId, 'Journal Entry ID');
  const operation = safePathSegment(operationId, 'Journal operation ID');
  const root = `users/${owner}/workspaces/${workspace}`;
  return {
    entry: `${root}/journalEntries/${entry}`,
    operation: `${root}/journalOperations/${operation}`,
  };
};

export const buildJournalFirestoreCollectionPaths = (
  scope: JournalWorkspaceScope,
): {
  readonly entries: string;
  readonly operations: string;
} => {
  const owner = safePathSegment(scope.productUserId, 'Product User ID');
  const workspace = safePathSegment(scope.workspaceId, 'Workspace ID');
  const root = `users/${owner}/workspaces/${workspace}`;
  return {
    entries: `${root}/journalEntries`,
    operations: `${root}/journalOperations`,
  };
};
