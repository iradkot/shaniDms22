import React from 'react';
import {Text} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, {act} from 'react-test-renderer';
import {sha1} from 'js-sha1';
import {AppLanguageProvider} from '../../../../src/contexts/AppLanguageContext';
import {NativePrivacyBoundary} from '../../../../src/platform/native/privacy/NativePrivacyBoundary';
import {PrivacyView} from '../../../../src/product/privacy/PrivacyView';
import {
  clearPrivacySession,
  hasPrivacyConsent,
} from '../../../../src/modules/privacy';

const mockRequest = jest.fn();
const mockAuth = {
  currentUser: {uid: 'owner-A'},
  onAuthStateChanged: jest.fn((listener: (user: {uid: string}) => void) => {
    let subscribed = true;
    // Firebase reports a restored user asynchronously even when currentUser
    // already exposes that same user before the boundary mounts.
    Promise.resolve().then(() => {
      if (subscribed) {
        listener(mockAuth.currentUser);
      }
    });
    return () => {subscribed = false;};
  }),
};

jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => mockAuth,
  signOut: jest.fn(async () => {}),
}));
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: () => ({}),
  setAutoInitEnabled: jest.fn(async () => {}),
}));
jest.mock('../../../../src/services/backend/nativeAuthenticatedBackendClient', () => ({
  nativeAuthenticatedBackendClient: {
    requestJson: (...args: unknown[]) => mockRequest(...args),
  },
}));
jest.mock('../../../../src/services/androidGlucoseLiveSurface', () => ({
  deleteAndroidGlucoseAccountData: jest.fn(async () => {}),
}));

const profileKey = `nightscout.profiles.v2:u${sha1('owner-A')}`;
const activeProfileKey = `nightscout.activeProfileId.v2:u${sha1('owner-A')}`;
const existingProfile = JSON.stringify([{
  id: 'synthetic-existing-profile',
  label: 'Existing local source',
  baseUrl: 'https://synthetic-nightscout.invalid',
  authType: 'access-token',
  createdAt: 1,
}]);

const mount = async (): Promise<renderer.ReactTestRenderer> => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <AppLanguageProvider>
        <NativePrivacyBoundary>
          <Text testID="local-product">Local product</Text>
        </NativePrivacyBoundary>
      </AppLanguageProvider>,
    );
  });
  return tree;
};

test('a restored account can leave an unavailable cloud-consent save, keep its local profile, and reopen locally', async () => {
  clearPrivacySession();
  await AsyncStorage.clear();
  await AsyncStorage.setItem('app.language.v1', 'he');
  await AsyncStorage.setItem(profileKey, existingProfile);
  await AsyncStorage.setItem(activeProfileKey, 'synthetic-existing-profile');
  mockRequest.mockReset().mockRejectedValue(
    Object.assign(new Error('Consent route unavailable'), {code: 'not_found'}),
  );

  let tree = await mount();
  try {
    expect(tree.root.findByType(PrivacyView)).toBeDefined();
    expect(tree.root.findAllByProps({testID: 'privacy-loading'})).toHaveLength(0);
    expect(tree.root.findAllByProps({testID: 'local-product'})).toHaveLength(0);
    await act(async () => {
      tree.root.findByProps({testID: 'privacy-cloud-choice'}).props.onPress();
    });
    await act(async () => {
      tree.root.findByProps({testID: 'privacy-ai-choice'}).props.onPress();
    });
    await act(async () => {
      await tree.root.findByProps({testID: 'privacy-save'}).props.onPress();
    });
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(mockRequest.mock.calls[0][0]).toBe('/v1/privacy/status');
    expect(mockRequest.mock.calls[1]).toEqual([
      '/v1/privacy/consent',
      expect.objectContaining({
        expectedUserId: 'owner-A',
        body: expect.objectContaining({cloudSync: true, aiProcessing: true}),
      }),
    ]);
    expect(tree.root.findByProps({testID: 'privacy-error'}).props.children).toBe(
      'שמירת הבחירות לא הושלמה. אפשר לנסות שוב.',
    );
    expect(tree.root.findAllByProps({testID: 'local-product'})).toHaveLength(0);
    expect(tree.root.findAllByProps({testID: 'privacy-close'})).toHaveLength(0);
    expect(await AsyncStorage.getItem('privacy.consent.pending:owner-A')).toBe('requested');

    await act(async () => {
      await tree.root.findByProps({testID: 'privacy-continue-locally'}).props.onPress();
    });
    expect(tree.root.findByProps({testID: 'local-product'})).toBeDefined();
    expect(tree.root.findAllByType(PrivacyView)).toHaveLength(0);
    expect(hasPrivacyConsent('cloud')).toBe(false);
    expect(hasPrivacyConsent('ai')).toBe(false);
    expect(await AsyncStorage.getItem(profileKey)).toBe(existingProfile);
    expect(await AsyncStorage.getItem(activeProfileKey)).toBe('synthetic-existing-profile');
    expect(await AsyncStorage.getItem('privacy.consent.pending:owner-A')).toBe('requested');
    expect(JSON.parse((await AsyncStorage.getItem('privacy.consent.v1:owner-A'))!)).toMatchObject({
      cloudSync: false,
      aiProcessing: false,
    });

    await act(async () => {tree.unmount();});
    tree = await mount();
    expect(tree.root.findByProps({testID: 'local-product'})).toBeDefined();
    expect(tree.root.findAllByType(PrivacyView)).toHaveLength(0);
    expect(tree.root.findAllByProps({testID: 'privacy-loading'})).toHaveLength(0);
    expect(mockRequest).toHaveBeenCalledTimes(2);
    expect(hasPrivacyConsent('cloud')).toBe(false);
    expect(hasPrivacyConsent('ai')).toBe(false);
    expect(await AsyncStorage.getItem(profileKey)).toBe(existingProfile);
    expect(await AsyncStorage.getItem('privacy.consent.pending:owner-A')).toBe('requested');
  } finally {
    await act(async () => {tree.unmount();});
    clearPrivacySession();
  }
});
