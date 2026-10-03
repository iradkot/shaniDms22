import AsyncStorage from '@react-native-async-storage/async-storage';
import {PRIVACY_POLICY_VERSION, registerPrivacySession} from '../../../../src/modules/privacy';

const mockAuth: {currentUser: {uid: string} | null} = {currentUser: {uid: 'owner-A'}};
const mockRequest = jest.fn();
const mockPrepare = jest.fn();
const mockPurgeProfiles = jest.fn(async (..._args: unknown[]) => {});
const mockPurgeCaches = jest.fn(async (..._args: unknown[]) => {});
const mockBlockImages = jest.fn(async (..._args: unknown[]) => {});
const mockRemoveSecret = jest.fn(async (..._args: unknown[]) => {});
const mockClearSource = jest.fn();
const mockTerminate = jest.fn(async () => {});
const mockClearPersistence = jest.fn(async () => {});
const mockSignOut = jest.fn(async () => {mockAuth.currentUser = null;});
const sourceIdentity = 'c'.repeat(40);
const receipt = 'a'.repeat(64);
const cloudConsent = {policyVersion: PRIVACY_POLICY_VERSION, cloudSync: true, aiProcessing: true, updatedAtMs: 1};

jest.mock('@react-native-firebase/auth', () => ({getAuth: () => mockAuth, signOut: () => mockSignOut()}));
jest.mock('@react-native-firebase/firestore', () => ({getFirestore: () => ({}), terminate: () => mockTerminate(), clearPersistence: () => mockClearPersistence()}));
jest.mock('../../../../src/services/backend/nativeAuthenticatedBackendClient', () => ({nativeAuthenticatedBackendClient: {requestJson: (...args: unknown[]) => mockRequest(...args)}}));
jest.mock('../../../../src/services/secureCredentialStore', () => ({nativeSecureCredentialStore: {remove: (...args: unknown[]) => mockRemoveSecret(...args)}}));
jest.mock('../../../../src/services/nightscoutProfiles', () => ({prepareAccountNightscoutDeletionCacheSources: (...args: unknown[]) => mockPrepare(...args), purgeAccountNightscoutCredentials: (...args: unknown[]) => mockPurgeProfiles(...args)}));
jest.mock('../../../../src/services/nightscoutAccountCleanup', () => ({purgeAccountNightscoutCaches: (...args: unknown[]) => mockPurgeCaches(...args)}));
jest.mock('../../../../src/platform/native/mealMedia/reactNativeFsMealImageFileAdapter', () => ({blockNativeMealImageOwner: (...args: unknown[]) => mockBlockImages(...args), createReactNativeFsMealImageFileAdapter: () => ({remove: jest.fn(async () => {})})}));
jest.mock('../../../../src/api/shaniNightscoutInstances', () => ({clearNightscoutInstance: () => mockClearSource()}));

import {nativePrivacyService} from '../../../../src/platform/native/privacy/nativePrivacyService';

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  mockRequest.mockReset();
  mockPrepare.mockReset().mockResolvedValue([sourceIdentity]);
  mockAuth.currentUser = {uid: 'owner-A'};
  registerPrivacySession('owner-A', cloudConsent);
});

const storePendingDeletion = async (status = 'requested') => {
  await AsyncStorage.setItem('privacy.deletion.receipt:owner-A', receipt);
  await AsyncStorage.setItem('privacy.deletion.recovery.v1', 'owner-A');
  await AsyncStorage.setItem('privacy.deletion.pending:owner-A', status);
  await AsyncStorage.setItem('privacy.deletion.sources:owner-A', JSON.stringify([sourceIdentity]));
};

test('failed withdrawal stays denied after restart and retries the server update', async () => {
  await AsyncStorage.setItem('privacy.consent.v1:owner-A', JSON.stringify(cloudConsent));
  mockRequest.mockRejectedValueOnce(new Error('offline'));
  await expect(nativePrivacyService.save('owner-A', false, false)).rejects.toThrow('offline');
  expect(await nativePrivacyService.load('owner-A')).toEqual({consent: null, deleting: false});
  mockRequest.mockResolvedValueOnce({version: 1, consent: {...cloudConsent, cloudSync: false, aiProcessing: false}});
  await nativePrivacyService.save('owner-A', false, false);
  expect(mockRequest).toHaveBeenCalledTimes(2);
  expect(mockRequest.mock.calls[1][0]).toBe('/v1/privacy/consent');
  expect(await AsyncStorage.getItem('privacy.consent.pending:owner-A')).toBeNull();
});

test('receipt and cache identities are durable before destructive request, even if response is lost', async () => {
  mockRequest.mockImplementation(async path => {
    if (path === '/v1/account/delete/receipt') {return {version: 1, receipt};}
    expect(await nativePrivacyService.recoveryOwner()).toBe('owner-A');
    expect(await AsyncStorage.getItem('privacy.deletion.sources:owner-A')).toBe(JSON.stringify([sourceIdentity]));
    throw new Error('lost response');
  });
  await expect(nativePrivacyService.deleteAccount('owner-A')).rejects.toThrow('lost response');
  expect(await AsyncStorage.getItem('privacy.deletion.receipt:owner-A')).toBe(receipt);
  expect(mockPurgeProfiles).not.toHaveBeenCalled();
  expect(mockPurgeCaches).not.toHaveBeenCalled();
  expect(mockClearPersistence).not.toHaveBeenCalled();
});

test('authorized deletion completes while signed out and preserves the other account', async () => {
  await storePendingDeletion();
  await AsyncStorage.setItem('journal:v1:owner-A:workspace', '{}');
  await AsyncStorage.setItem('journal:v1:owner-B:workspace', '{}');
  mockAuth.currentUser = null;
  mockRequest.mockResolvedValueOnce({version: 1, deleted: true});
  await nativePrivacyService.deleteAccount('owner-A');
  expect(mockRequest).toHaveBeenCalledTimes(1);
  expect(mockRequest.mock.calls[0][0]).toBe('/v1/account/delete/finish');
  expect(mockPurgeCaches).toHaveBeenCalledWith([sourceIdentity]);
  expect(mockPurgeProfiles).toHaveBeenCalledWith('owner-A');
  expect(await AsyncStorage.getItem('journal:v1:owner-A:workspace')).toBeNull();
  expect(await AsyncStorage.getItem('journal:v1:owner-B:workspace')).toBe('{}');
  expect(await nativePrivacyService.recoveryOwner()).toBeNull();
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(mockClearPersistence).toHaveBeenCalledTimes(1);
});

test('an unused expired receipt renews through recent same-owner authentication', async () => {
  await storePendingDeletion();
  const expired = Object.assign(new Error('expired'), {code: 'invalid_deletion_receipt'});
  mockRequest.mockRejectedValueOnce(expired).mockRejectedValueOnce(expired)
    .mockResolvedValueOnce({version: 1, receipt: 'b'.repeat(64)})
    .mockResolvedValueOnce({version: 1, deleted: true});
  await nativePrivacyService.deleteAccount('owner-A');
  expect(mockRequest.mock.calls[2][0]).toBe('/v1/account/delete/receipt');
  expect(mockRequest.mock.calls[3][1].body.receipt).toBe('b'.repeat(64));
  expect(mockSignOut).toHaveBeenCalledTimes(1);
});

test('another signed-in owner blocks global cleanup until sign-out, with durable recovery', async () => {
  await storePendingDeletion('cloud-complete');
  await AsyncStorage.setItem('journal:v1:owner-B:workspace', '{}');
  mockAuth.currentUser = {uid: 'owner-B'};
  await expect(nativePrivacyService.deleteAccount('owner-A')).rejects.toMatchObject({code: 'local_cleanup_account_changed'});
  expect(mockClearSource).not.toHaveBeenCalled();
  expect(mockTerminate).not.toHaveBeenCalled();
  expect(mockSignOut).not.toHaveBeenCalled();
  expect(await nativePrivacyService.recoveryOwner()).toBe('owner-A');
  expect(await AsyncStorage.getItem('privacy.deletion.sources:owner-A')).toBe(JSON.stringify([sourceIdentity]));
  expect(await AsyncStorage.getItem('privacy.deletion.receipt:owner-A')).toBe(receipt);
  mockAuth.currentUser = null;
  await nativePrivacyService.deleteAccount('owner-A');
  expect(mockClearPersistence).toHaveBeenCalledTimes(1);
  expect(await AsyncStorage.getItem('journal:v1:owner-B:workspace')).toBe('{}');
  expect(await nativePrivacyService.recoveryOwner()).toBeNull();
});

test('rejected recent authentication never creates a pending deletion or blocks profile writes', async () => {
  mockRequest.mockRejectedValueOnce(Object.assign(new Error('sign in again'), {code: 'recent_auth_required'}));
  await expect(nativePrivacyService.deleteAccount('owner-A')).rejects.toMatchObject({code: 'recent_auth_required'});
  expect(await nativePrivacyService.recoveryOwner()).toBeNull();
  expect(await AsyncStorage.getItem('privacy.deletion.pending:owner-A')).toBeNull();
  expect(mockPrepare).not.toHaveBeenCalled();
  expect(mockBlockImages).not.toHaveBeenCalled();
});

test('cloud-complete recovery rebuilds a missing source manifest before profile removal', async () => {
  await storePendingDeletion('cloud-complete');
  await AsyncStorage.removeItem('privacy.deletion.sources:owner-A');
  await nativePrivacyService.deleteAccount('owner-A');
  expect(mockPrepare).toHaveBeenCalledWith('owner-A');
  expect(mockPurgeCaches).toHaveBeenCalledWith([sourceIdentity]);
  expect(mockPrepare.mock.invocationCallOrder[0]).toBeLessThan(mockPurgeProfiles.mock.invocationCallOrder[0]);
  expect(mockRequest).not.toHaveBeenCalled();
});

test('failed Firebase persistence clearing retains receipts and cache identities for retry', async () => {
  await storePendingDeletion('cloud-complete');
  mockClearPersistence.mockRejectedValueOnce(new Error('local cache busy'));
  await expect(nativePrivacyService.deleteAccount('owner-A')).rejects.toThrow('local cache busy');
  expect(await AsyncStorage.getItem('privacy.deletion.sources:owner-A')).toBe(JSON.stringify([sourceIdentity]));
  expect(await AsyncStorage.getItem('privacy.deletion.receipt:owner-A')).toBe(receipt);
  expect(await AsyncStorage.getItem('privacy.deletion.pending:owner-A')).toBe('cloud-complete');
  expect(mockSignOut).not.toHaveBeenCalled();
  await nativePrivacyService.deleteAccount('owner-A');
  expect(mockRequest).not.toHaveBeenCalled();
  expect(mockPurgeCaches).toHaveBeenNthCalledWith(2, [sourceIdentity]);
  expect(await nativePrivacyService.recoveryOwner()).toBeNull();
  expect(await AsyncStorage.getItem('privacy.deletion.sources:owner-A')).toBeNull();
});
