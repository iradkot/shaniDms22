import {createBrowserPrivacyService} from '../../../src/platform/web/privacy/browserPrivacyService';
import {PRIVACY_POLICY_VERSION} from '../../../src/modules/privacy';
jest.mock(
  '../../../src/platform/web/mealMedia/browserMealImageBlobStore',
  () => ({
    IndexedDbMealImageBlobRepository: class {
      removeAccount = jest.fn(async () => {});
      remove = jest.fn(async () => {});
    },
  }),
);
const make = () => {
  const values = new Map<string, string>();
  const requestJson = jest.fn();
  const auth = {
    getIdentity: jest.fn(() => ({uid: 'owner-A'})),
    signOut: jest.fn(async () => {}),
  };
  const storage = {
    getAllKeys: async () => [...values.keys()],
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: async (key: string) => {
      values.delete(key);
    },
  };
  const service = createBrowserPrivacyService({
    api: {requestJson} as never,
    storage: storage as never,
    auth: auth as never,
  });
  return {values, requestJson, auth, service};
};
test('failed withdrawal persists local denial and cannot rehydrate previous consent', async () => {
  const fixture = make();
  fixture.values.set(
    'privacy.consent.v1:owner-A',
    JSON.stringify({
      policyVersion: PRIVACY_POLICY_VERSION,
      cloudSync: true,
      aiProcessing: true,
      updatedAtMs: 1,
    }),
  );
  fixture.requestJson.mockRejectedValue(new Error('offline'));
  await expect(fixture.service.save('owner-A', false, false)).rejects.toThrow(
    'offline',
  );
  expect(await fixture.service.load('owner-A')).toEqual({
    consent: null,
    deleting: false,
  });
  fixture.requestJson.mockResolvedValueOnce({
    version: 1,
    consent: {
      policyVersion: PRIVACY_POLICY_VERSION,
      cloudSync: false,
      aiProcessing: false,
      updatedAtMs: 2,
    },
  });
  await fixture.service.save('owner-A', false, false);
  expect(fixture.requestJson).toHaveBeenCalledTimes(2);
  expect(fixture.requestJson.mock.calls[1][0]).toBe('/v1/privacy/consent');
});
test('persists a recovery receipt before starting deletion and never purges on failure', async () => {
  const fixture = make();
  fixture.requestJson
    .mockResolvedValueOnce({version: 1, receipt: 'a'.repeat(64)})
    .mockRejectedValueOnce(new Error('lost response'));
  await expect(fixture.service.deleteAccount('owner-A')).rejects.toThrow(
    'lost response',
  );
  expect(fixture.values.get('privacy.deletion.receipt:owner-A')).toBe(
    'a'.repeat(64),
  );
  expect(await fixture.service.recoveryOwner()).toBe('owner-A');
  expect(fixture.auth.signOut).not.toHaveBeenCalled();
});
test('expired never-started receipt renews only through the same signed-in owner', async () => {
  const fixture = make();
  fixture.values.set('privacy.deletion.receipt:owner-A', 'a'.repeat(64));
  fixture.values.set('privacy.deletion.pending:owner-A', 'requested');
  const error = Object.assign(new Error('expired'), {
    code: 'invalid_deletion_receipt',
  });
  fixture.requestJson
    .mockRejectedValueOnce(error)
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce({version: 1, receipt: 'b'.repeat(64)})
    .mockResolvedValueOnce({version: 1, deleted: true});
  await fixture.service.deleteAccount('owner-A');
  expect(fixture.requestJson.mock.calls[2][0]).toBe(
    '/v1/account/delete/receipt',
  );
  expect(fixture.requestJson.mock.calls[3][1].body.receipt).toBe(
    'b'.repeat(64),
  );
  expect(fixture.auth.signOut).toHaveBeenCalled();
});

test('a receipt left between local writes restores recovery markers before contacting the server', async () => {
  const fixture = make();
  fixture.values.set('privacy.deletion.receipt:owner-A', 'a'.repeat(64));
  fixture.requestJson.mockImplementation(async () => {
    expect(fixture.values.get('privacy.deletion.recovery.v1')).toBe('owner-A');
    expect(fixture.values.get('privacy.deletion.pending:owner-A')).toBe(
      'requested',
    );
    throw new Error('offline');
  });
  await expect(fixture.service.deleteAccount('owner-A')).rejects.toThrow(
    'offline',
  );
  expect(await fixture.service.recoveryOwner()).toBe('owner-A');
  expect(fixture.auth.signOut).not.toHaveBeenCalled();
});
test('already-authorized deletion finishes while signed out without creating a new account', async () => {
  const fixture = make();
  fixture.auth.getIdentity.mockReturnValue(null as never);
  fixture.values.set('privacy.deletion.receipt:owner-A', 'a'.repeat(64));
  fixture.values.set('privacy.deletion.pending:owner-A', 'requested');
  fixture.values.set('journal:v1:owner-A:w:s', '{}');
  fixture.values.set('journal:v1:owner-B:w:s', '{}');
  fixture.requestJson.mockResolvedValueOnce({version: 1, deleted: true});
  await fixture.service.deleteAccount('owner-A');
  expect(fixture.requestJson).toHaveBeenCalledTimes(1);
  expect(fixture.requestJson.mock.calls[0][0]).toBe(
    '/v1/account/delete/finish',
  );
  expect(fixture.values.has('journal:v1:owner-A:w:s')).toBe(false);
  expect(fixture.values.has('journal:v1:owner-B:w:s')).toBe(true);
});
