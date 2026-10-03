import {AuthenticatedWebApiClient} from '../../../src/platform/web/api/authenticatedWebApiClient';
import {createNativeAuthenticatedBackendClient} from '../../../src/services/backend/nativeAuthenticatedBackendClient';
import {
  clearPrivacySession,
  PRIVACY_POLICY_VERSION,
  registerPrivacySession,
} from '../../../src/modules/privacy';
jest.mock('@react-native-firebase/app', () => ({getApp: () => ({})}));
jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => ({currentUser: null}),
}));
const consent = {
  policyVersion: PRIVACY_POLICY_VERSION,
  cloudSync: true,
  aiProcessing: true,
  updatedAtMs: 1,
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return {promise, resolve};
};
beforeEach(() => {
  clearPrivacySession();
  registerPrivacySession('owner-A', consent);
});
test('web health transmission stops when consent is withdrawn during token lookup', async () => {
  const token = deferred<string>();
  const fetch = jest.fn();
  const api = new AuthenticatedWebApiClient({
    baseUrl: 'https://backend.test',
    auth: {getIdToken: () => token.promise},
    fetch,
  });
  const pending = api.requestJson('/v1/llm/chat', {
    method: 'POST',
    body: {messages: ['health data']},
  });
  registerPrivacySession('owner-A', null);
  token.resolve('token');
  await expect(pending).rejects.toBeDefined();
  expect(fetch).not.toHaveBeenCalled();
});
test('native credential transmission stops on an A to B to A session change during auth lookup', async () => {
  const session = deferred<{userId: string; idToken: string}>();
  const fetch = jest.fn();
  const client = createNativeAuthenticatedBackendClient({
    baseUrl: 'https://backend.test',
    getSession: () => session.promise,
    fetch,
  });
  const pending = client.requestJson('/v1/vault/nightscout/provision', {
    expectedUserId: 'owner-A',
    body: {credential: 'private-token'},
  });
  registerPrivacySession('owner-B', consent);
  registerPrivacySession('owner-A', consent);
  session.resolve({userId: 'owner-A', idToken: 'token'});
  await expect(pending).rejects.toBeDefined();
  expect(fetch).not.toHaveBeenCalled();
});
test('web consent endpoints remain owner-bound through same-UID reauthentication', async () => {
  const token = deferred<string>();
  let revision = 1;
  const fetch = jest.fn();
  const api = new AuthenticatedWebApiClient({
    baseUrl: 'https://backend.test',
    auth: {
      getIdToken: () => token.promise,
      getIdentity: () => ({uid: 'owner-A', email: 'a@example.test'}),
      getSessionRevision: () => revision,
    },
    fetch,
  });
  const pending = api.requestJson('/v1/privacy/consent', {
    method: 'POST',
    expectedUserId: 'owner-A',
    body: {cloudSync: true},
  });
  revision += 2;
  token.resolve('old-token');
  await expect(pending).rejects.toMatchObject({code: 'account_changed'});
  expect(fetch).not.toHaveBeenCalled();
});
