export {
  canonicalizeNightscoutBaseUrl,
  deriveWorkspaceIdentity,
} from './domain/workspaceIdentity';
export type {
  WorkspaceIdentity,
  WorkspaceIdentityDigest,
  WorkspaceIdentityResult,
} from './domain/workspaceIdentity';
export {sha1WorkspaceIdentityDigest} from './adapters/sha1WorkspaceIdentityDigest';
