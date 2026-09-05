import {sha1} from 'js-sha1';
import type {WorkspaceIdentityDigest} from '../domain/workspaceIdentity';

/** SHA-1 is used as a stable opaque identifier here, never for a secret. */
export const sha1WorkspaceIdentityDigest: WorkspaceIdentityDigest = {
  digest: value => sha1(value),
};
