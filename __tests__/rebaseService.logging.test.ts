import AsyncStorage from '@react-native-async-storage/async-storage';

const mockFcmToken = 'fcm-token-super-secret-123456789';
const mockOtherServerToken = 'another-private-device-token';
const mockUid = 'private-firebase-uid-42';
const mockServerTimestamp = {operation: 'server-timestamp'};
const mockUpdate = jest.fn(
  async (_reference?: unknown, _data?: unknown) => undefined,
);
const mockGetToken = jest.fn(async (_messaging?: unknown) => mockFcmToken);
const mockUserRef = {path: `users/${mockUid}`};
const mockGet = jest.fn(async (_reference?: unknown) => ({
  data: () => ({phoneTokens: [mockOtherServerToken]}),
}));

jest.mock('@react-native-firebase/app', () => ({
  getApp: () => ({name: '[DEFAULT]'}),
}));

jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: () => ({app: '[DEFAULT]'}),
  getToken: (instance: unknown) => mockGetToken(instance),
}));

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => ({currentUser: {uid: mockUid}}),
}));

jest.mock('@react-native-firebase/firestore', () => {
  return {
    getFirestore: () => ({app: '[DEFAULT]'}),
    doc: () => mockUserRef,
    getDoc: (reference: unknown) => mockGet(reference),
    updateDoc: (reference: unknown, data: unknown) =>
      mockUpdate(reference, data),
    arrayUnion: (value: string) => ({operation: 'union', value}),
    arrayRemove: (value: string) => ({operation: 'remove', value}),
    serverTimestamp: () => mockServerTimestamp,
  };
});

import {
  registerDeviceToken,
  syncTokenIfNeeded,
  unregisterDeviceToken,
} from '../src/services/rebaseService';

describe('device-token log privacy', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('never writes FCM tokens or Firebase UIDs while syncing the public token lifecycle', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await syncTokenIfNeeded();
      await registerDeviceToken();
      await unregisterDeviceToken();

      const output = [
        ...log.mock.calls,
        ...warn.mock.calls,
        ...error.mock.calls,
      ]
        .flat()
        .map(value => String(value))
        .join('\n');

      expect(output).not.toContain(mockFcmToken);
      expect(output).not.toContain(mockFcmToken.slice(0, 20));
      expect(output).not.toContain(mockOtherServerToken);
      expect(output).not.toContain(mockUid);
    } finally {
      log.mockRestore();
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it('does not repeat the daily sync while its 24-hour checkpoint is fresh', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    try {
      await syncTokenIfNeeded();
      await syncTokenIfNeeded();

      expect(mockGetToken).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledTimes(1);
      expect(mockUpdate).toHaveBeenCalledWith(mockUserRef, {
        phoneTokens: {operation: 'union', value: mockFcmToken},
        updatedAt: mockServerTimestamp,
      });
    } finally {
      log.mockRestore();
    }
  });
});
