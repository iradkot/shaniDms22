import {
  capturePrivacyAuthorization,
  clearPrivacySession,
  decodePrivacyConsent,
  hasPrivacyConsent,
  PRIVACY_POLICY_VERSION,
  registerPrivacySession,
} from '../../../src/modules/privacy';
import {guardPrivacyCloudGateway} from '../../../src/modules/privacy/cloudGateway';
import {purgeLocalAccountData} from '../../../src/modules/privacy/localAccountCleanup';

const consent = {
  policyVersion: PRIVACY_POLICY_VERSION,
  cloudSync: true,
  aiProcessing: false,
  updatedAtMs: 1,
};
beforeEach(clearPrivacySession);
test('missing, outdated and other-owner consent never authorizes data sharing', () => {
  expect(hasPrivacyConsent('cloud')).toBe(false);
  registerPrivacySession('owner-A', {...consent, policyVersion: 'old'});
  expect(hasPrivacyConsent('cloud')).toBe(false);
  registerPrivacySession('owner-A', consent);
  expect(hasPrivacyConsent('cloud', 'owner-B')).toBe(false);
  expect(hasPrivacyConsent('ai', 'owner-A')).toBe(false);
  expect(
    decodePrivacyConsent({...consent, cloudSync: false, aiProcessing: true}),
  ).toBeNull();
});
test('withdrawal and A to B to A invalidate pending authorizations', () => {
  registerPrivacySession('owner-A', consent);
  const authorize = capturePrivacyAuthorization('cloud', 'owner-A');
  registerPrivacySession('owner-B', consent);
  registerPrivacySession('owner-A', consent);
  expect(authorize).toThrow('Review Privacy');
});
test('cloud gateways deny a stale owner path and transaction writes after withdrawal', async () => {
  registerPrivacySession('owner-A', consent);
  const set = jest.fn();
  const gateway = guardPrivacyCloudGateway({
    runTransaction: async (operation: (tx: {set: typeof set}) => unknown) =>
      operation({set}),
  });
  await expect(
    gateway.runTransaction(async tx => {
      registerPrivacySession('owner-B', consent);
      tx.set('users/owner-A/workspaces/w/journalEntries/e', {});
    }),
  ).rejects.toThrow('Review Privacy');
  expect(set).not.toHaveBeenCalled();
});
test('owner purge removes journal images and orphans without touching another account', async () => {
  const values = new Map([
    [
      'journal:v1:owner-A:w:s',
      JSON.stringify({
        scope: {productUserId: 'owner-A'},
        localUri: 'file:///private/meal-images/image_1.jpg',
      }),
    ],
    [
      'meal.image.ownership.v1:owner-A',
      JSON.stringify(['file:///private/meal-images/image_2.jpg']),
    ],
    [
      'journal:v1:owner-B:w:s',
      JSON.stringify({scope: {productUserId: 'owner-B'}}),
    ],
    ['privacy.deletion.pending:owner-A', 'requested'],
    ['privacy.deletion.receipt:owner-A', 'a'.repeat(64)],
    ['privacy.deletion.sources:owner-A', '["source-A"]'],
  ]);
  const removeImage = jest.fn(async () => {});
  await purgeLocalAccountData(
    {
      getAllKeys: async () => [...values.keys()],
      getItem: async key => values.get(key) ?? null,
      removeItem: async key => {
        values.delete(key);
      },
      setItem: async (key, value) => {
        values.set(key, value);
      },
    },
    'owner-A',
    removeImage,
  );
  expect(removeImage).toHaveBeenCalledTimes(2);
  expect(values.has('journal:v1:owner-B:w:s')).toBe(true);
  expect(values.has('privacy.deletion.pending:owner-A')).toBe(true);
  expect(values.has('privacy.deletion.receipt:owner-A')).toBe(true);
  expect(values.has('privacy.deletion.sources:owner-A')).toBe(true);
  expect(values.has('meal.image.ownership.v1:owner-A')).toBe(false);
});
test('shared legacy arrays retain other owners and unknown records', async () => {
  const values = new Map([
    [
      'shared-cache',
      JSON.stringify([
        {
          productUserId: 'owner-A',
          image: 'file:///private/meal-images/image_A.jpg',
        },
        {
          productUserId: 'owner-B',
          image: 'file:///private/meal-images/image_B.jpg',
        },
        {label: 'unknown owner'},
      ]),
    ],
  ]);
  const removeImage = jest.fn(async () => {});
  await purgeLocalAccountData(
    {
      getAllKeys: async () => [...values.keys()],
      getItem: async key => values.get(key) ?? null,
      removeItem: async key => {
        values.delete(key);
      },
      setItem: async (key, value) => {
        values.set(key, value);
      },
    },
    'owner-A',
    removeImage,
  );
  expect(JSON.parse(values.get('shared-cache')!)).toHaveLength(2);
  expect(removeImage).toHaveBeenCalledWith(
    'file:///private/meal-images/image_A.jpg',
  );
  expect(removeImage).not.toHaveBeenCalledWith(
    'file:///private/meal-images/image_B.jpg',
  );
});
