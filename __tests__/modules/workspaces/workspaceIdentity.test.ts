import {
  canonicalizeNightscoutBaseUrl,
  deriveWorkspaceIdentity,
  sha1WorkspaceIdentityDigest,
} from '../../../src/modules/workspaces';

describe('stable Workspace identity', () => {
  it('normalizes equivalent Nightscout URLs to one cross-device scope', () => {
    const first = deriveWorkspaceIdentity(
      {
        firebaseUserId: 'firebase-user-1',
        nightscoutBaseUrl:
          'HTTPS://Example.COM:443/nightscout/?token=ignored#x',
      },
      sha1WorkspaceIdentityDigest,
    );
    const second = deriveWorkspaceIdentity(
      {
        firebaseUserId: 'firebase-user-1',
        nightscoutBaseUrl: 'https://example.com/nightscout',
      },
      sha1WorkspaceIdentityDigest,
    );

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.scope).toEqual(second.value.scope);
      expect(first.value.canonicalNightscoutUrl).toBe(
        'https://example.com/nightscout',
      );
      // Contract constants are also asserted by functions/nightscoutVault.test.ts.
      // This catches native/backend drift before Web opens a different Firestore path.
      expect(first.value.scope).toEqual({
        productUserId: 'firebase-user-1',
        workspaceId:
          'workspace_a01fd8458e8e9be480f79288fd052f37ed8d6dcc',
        nightscoutSourceId:
          'nightscout_d60c6d0a777a2ecf5bf6501664801fd2907dfec8',
      });
    }
  });

  it('isolates private Journal data by Product User even for one source', () => {
    const first = deriveWorkspaceIdentity(
      {
        firebaseUserId: 'parent-account',
        nightscoutBaseUrl: 'https://example.com',
      },
      sha1WorkspaceIdentityDigest,
    );
    const second = deriveWorkspaceIdentity(
      {
        firebaseUserId: 'clinician-account',
        nightscoutBaseUrl: 'https://example.com',
      },
      sha1WorkspaceIdentityDigest,
    );

    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.value.scope.workspaceId).not.toBe(
        second.value.scope.workspaceId,
      );
      expect(first.value.scope.nightscoutSourceId).toBe(
        second.value.scope.nightscoutSourceId,
      );
    }
  });

  it('never includes API credentials, query strings, or fragments', () => {
    expect(
      canonicalizeNightscoutBaseUrl(
        'https://user:secret@example.com/?api-secret=secret#secret',
      ),
    ).toBeUndefined();
    expect(
      canonicalizeNightscoutBaseUrl(
        'https://example.com/path?api-secret=secret#secret',
      ),
    ).toBe('https://example.com/path');
  });
});
