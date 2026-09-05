import {useMemo} from 'react';
import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';

import {useNightscoutConfig} from 'app/contexts/NightscoutConfigContext';
import {
  deriveWorkspaceIdentity,
  sha1WorkspaceIdentityDigest,
} from 'app/modules/workspaces';

import type {AiWorkspaceScope} from './aiWorkspaceScope';

/** Resolves the active AI owner from the authenticated Product User and Workspace. */
export const useActiveAiWorkspaceScope = (): AiWorkspaceScope | null => {
  const {activeProfile} = useNightscoutConfig();
  const productUserId = getAuth(getApp()).currentUser?.uid ?? null;
  const nightscoutBaseUrl = activeProfile?.baseUrl ?? null;

  return useMemo(() => {
    if (productUserId === null || nightscoutBaseUrl === null) {
      return null;
    }
    const identity = deriveWorkspaceIdentity(
      {firebaseUserId: productUserId, nightscoutBaseUrl},
      sha1WorkspaceIdentityDigest,
    );
    return identity.ok
      ? {
          productUserId: identity.value.scope.productUserId,
          workspaceId: identity.value.scope.workspaceId,
        }
      : null;
  }, [nightscoutBaseUrl, productUserId]);
};
