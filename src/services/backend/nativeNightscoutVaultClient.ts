import {isE2E} from 'app/utils/e2e';

import {
  NativeAuthenticatedBackendError,
  nativeAuthenticatedBackendClient,
  type NativeAuthenticatedBackendClient,
} from './nativeAuthenticatedBackendClient';
import type {
  NightscoutVaultProfileSecret,
  NightscoutVaultRemote,
} from './nightscoutVaultSynchronizer';

export interface CreateNativeNightscoutVaultClientInput {
  readonly api?: Pick<NativeAuthenticatedBackendClient, 'requestJson'>;
  readonly e2e?: boolean;
}

const validProfile = (profile: NightscoutVaultProfileSecret): boolean =>
  profile.baseUrl.length > 0 &&
  profile.baseUrl.length <= 2_048 &&
  /^https?:\/\//i.test(profile.baseUrl) &&
  /^[a-f0-9]{40}$/i.test(profile.apiSecretSha1);

/** Narrow adapter for the backend's encrypted Nightscout credential vault. */
export const createNativeNightscoutVaultClient = (
  input: CreateNativeNightscoutVaultClientInput = {},
): NightscoutVaultRemote => {
  const api = input.api ?? nativeAuthenticatedBackendClient;
  const e2e = input.e2e ?? isE2E;
  return {
    async provision(profile, expectedUserId) {
      if (!validProfile(profile) || !expectedUserId.trim()) {
        throw new NativeAuthenticatedBackendError(
          'invalid_request',
          'Nightscout credential is invalid',
        );
      }
      if (e2e) {
        return;
      }
      const response = await api.requestJson(
        '/v1/vault/nightscout/provision',
        {
          method: 'POST',
          expectedUserId,
          body: {
            version: 1,
            url: profile.baseUrl,
            apiKey: profile.apiSecretSha1,
          },
        },
      );
      if (
        response.version !== 1 ||
        response.configured !== true ||
        typeof response.sourceId !== 'string' ||
        !response.sourceId ||
        typeof response.workspaceId !== 'string' ||
        !response.workspaceId
      ) {
        throw new NativeAuthenticatedBackendError(
          'invalid_response',
          'Backend did not confirm credential provisioning',
        );
      }
    },

    async remove(expectedUserId) {
      if (!expectedUserId.trim()) {
        throw new NativeAuthenticatedBackendError(
          'unauthenticated',
          'Sign in is required to remove a Nightscout credential',
        );
      }
      if (e2e) {
        return;
      }
      const response = await api.requestJson('/v1/vault/nightscout/remove', {
        method: 'POST',
        expectedUserId,
        body: {version: 1},
      });
      if (response.version !== 1 || response.configured !== false) {
        throw new NativeAuthenticatedBackendError(
          'invalid_response',
          'Backend did not confirm credential removal',
        );
      }
    },
  };
};

export const nativeNightscoutVaultClient =
  createNativeNightscoutVaultClient();
