import type {ProductUserId, WorkspaceId} from 'app/modules/journal';

/** The ownership boundary for every persisted AI artefact. */
export type AiWorkspaceScope = {
  readonly productUserId: ProductUserId;
  readonly workspaceId: WorkspaceId;
};

const keyComponent = (value: string): string => encodeURIComponent(value);

/**
 * Builds a local key from validated identifiers only. Nightscout URLs and
 * credentials never enter AI persistence keys.
 */
export const aiWorkspaceStorageKey = (
  namespace: string,
  scope: AiWorkspaceScope,
): string => {
  if (!/^[a-z][a-z0-9._-]{0,79}$/.test(namespace)) {
    throw new Error('AI storage namespace is invalid.');
  }
  return `shani.ai:v2:${namespace}:${keyComponent(
    scope.productUserId,
  )}:${keyComponent(scope.workspaceId)}`;
};
