import React from 'react';
import {Pressable, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {NativePrivacyBoundary} from '../../../../src/platform/native/privacy/NativePrivacyBoundary';
import {nativePrivacyService} from '../../../../src/platform/native/privacy/nativePrivacyService';
import {PrivacyView} from '../../../../src/product/privacy/PrivacyView';
import {usePrivacyControls} from '../../../../src/product/privacy/PrivacyControlsContext';
import {
  clearPrivacySession,
  hasPrivacyConsent,
  PRIVACY_POLICY_VERSION,
} from '../../../../src/modules/privacy';

let mockListener: (user: {uid: string} | null) => void;
const mockAuth = {
  currentUser: {uid: 'owner-A'} as {uid: string} | null,
  onAuthStateChanged: jest.fn((listener: typeof mockListener) => {
    mockListener = listener;
    return () => {};
  }),
};
jest.mock('@react-native-firebase/app', () => ({getApp: () => ({})}));
jest.mock('@react-native-firebase/auth', () => ({
  getAuth: () => mockAuth,
  signOut: jest.fn(async () => {}),
}));
jest.mock('@react-native-firebase/messaging', () => ({
  getMessaging: () => ({}),
  setAutoInitEnabled: jest.fn(async () => {}),
}));
jest.mock('../../../../src/contexts/AppLanguageContext', () => ({
  useAppLanguage: () => ({language: 'en'}),
}));
jest.mock('../../../../src/utils/e2e', () => ({isE2E: false}));
jest.mock(
  '../../../../src/api/GoogleSignIn',
  () =>
    class {
      signIn = jest.fn(async () => ({error: null}));
    },
);
jest.mock(
  '../../../../src/platform/native/privacy/nativePrivacyService',
  () => ({
    nativePrivacyService: {
      load: jest.fn(),
      save: jest.fn(),
      recoveryOwner: jest.fn(),
      resumeNativeDeletion: jest.fn(),
      deleteAccount: jest.fn(),
    },
  }),
);
const service = nativePrivacyService as jest.Mocked<
  typeof nativePrivacyService
>;
const consent = {
  policyVersion: PRIVACY_POLICY_VERSION,
  cloudSync: true,
  aiProcessing: false,
  updatedAtMs: 1,
};
const Child = () => {
  const controls = usePrivacyControls();
  return (
    <Pressable testID="product-child" onPress={controls?.openPrivacy}>
      <Text>Local product</Text>
    </Pressable>
  );
};
const mount = async () => {
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <NativePrivacyBoundary>
        <Child />
      </NativePrivacyBoundary>,
    );
  });
  return tree;
};
beforeEach(() => {
  clearPrivacySession();
  mockAuth.currentUser = {uid: 'owner-A'};
  service.load.mockReset().mockResolvedValue({consent: null, deleting: false});
  service.save.mockReset().mockResolvedValue({...consent, cloudSync: false});
  service.recoveryOwner.mockReset().mockResolvedValue(null);
  service.deleteAccount.mockReset().mockResolvedValue(undefined);
  service.resumeNativeDeletion.mockReset().mockResolvedValue(undefined);
});
test('first sign-in cannot mount data runtimes before a privacy choice', async () => {
  const tree = await mount();
  expect(tree.root.findAllByProps({testID: 'product-child'})).toHaveLength(0);
  expect(tree.root.findByType(PrivacyView)).toBeDefined();
  expect(hasPrivacyConsent('cloud')).toBe(false);
  await act(async () => {
    await tree.root
      .findByType(PrivacyView)
      .props.runtime.saveConsent(false, false);
  });
  expect(tree.root.findByProps({testID: 'product-child'})).toBeDefined();
  expect(hasPrivacyConsent('cloud')).toBe(false);
});
test.each([
  ['without a previous privacy choice', null],
  ['with a saved privacy choice', consent],
] as const)(
  'the initial same-owner auth notification leaves the spinner after a pending privacy load %s',
  async (_description, savedConsent) => {
    let resolveLoad!: (value: {consent: typeof savedConsent; deleting: boolean}) => void;
    service.load.mockReturnValue(
      new Promise(resolve => {
        resolveLoad = resolve;
      }),
    );
    const tree = await mount();
    expect(service.load).toHaveBeenCalledWith('owner-A');
    expect(tree.root.findByProps({testID: 'privacy-loading'})).toBeDefined();
    await act(async () => {
      mockListener(mockAuth.currentUser);
    });
    await act(async () => {
      resolveLoad({consent: savedConsent, deleting: false});
    });
    expect(tree.root.findAllByProps({testID: 'privacy-loading'})).toHaveLength(0);
    if (savedConsent === null) {
      expect(tree.root.findByType(PrivacyView)).toBeDefined();
      expect(tree.root.findAllByProps({testID: 'product-child'})).toHaveLength(0);
      expect(hasPrivacyConsent('cloud')).toBe(false);
    } else {
      expect(tree.root.findByProps({testID: 'product-child'})).toBeDefined();
      expect(hasPrivacyConsent('cloud')).toBe(true);
    }
  },
);
test.each([
  ['without a previous privacy choice', null],
  ['with a saved privacy choice', consent],
] as const)(
  'the initial same-owner auth notification keeps startup complete after the privacy load %s',
  async (_description, savedConsent) => {
    service.load.mockResolvedValue({consent: savedConsent, deleting: false});
    const tree = await mount();
    expect(tree.root.findAllByProps({testID: 'privacy-loading'})).toHaveLength(0);
    await act(async () => {
      mockListener(mockAuth.currentUser);
    });
    expect(tree.root.findAllByProps({testID: 'privacy-loading'})).toHaveLength(0);
    if (savedConsent === null) {
      expect(tree.root.findByType(PrivacyView)).toBeDefined();
      expect(tree.root.findAllByProps({testID: 'product-child'})).toHaveLength(0);
      expect(hasPrivacyConsent('cloud')).toBe(false);
    } else {
      expect(tree.root.findByProps({testID: 'product-child'})).toBeDefined();
      expect(hasPrivacyConsent('cloud')).toBe(true);
    }
  },
);
test('an account change while startup is loading rejects the previous owner result', async () => {
  let resolveA!: (value: {consent: typeof consent; deleting: boolean}) => void;
  let resolveB!: (value: {consent: null; deleting: boolean}) => void;
  service.load.mockImplementation(owner => {
    if (owner === 'owner-A') {
      return new Promise(resolve => {
        resolveA = resolve;
      });
    }
    return new Promise(resolve => {
      resolveB = resolve;
    });
  });
  const tree = await mount();
  await act(async () => {
    mockAuth.currentUser = {uid: 'owner-B'};
    mockListener(mockAuth.currentUser);
  });
  expect(service.load).toHaveBeenLastCalledWith('owner-B');
  expect(tree.root.findByProps({testID: 'privacy-loading'})).toBeDefined();
  await act(async () => {
    resolveA({consent, deleting: false});
  });
  expect(tree.root.findByProps({testID: 'privacy-loading'})).toBeDefined();
  expect(tree.root.findAllByProps({testID: 'product-child'})).toHaveLength(0);
  expect(hasPrivacyConsent('cloud')).toBe(false);
  await act(async () => {
    resolveB({consent: null, deleting: false});
  });
  expect(tree.root.findAllByProps({testID: 'privacy-loading'})).toHaveLength(0);
  expect(tree.root.findByType(PrivacyView)).toBeDefined();
  expect(tree.root.findAllByProps({testID: 'product-child'})).toHaveLength(0);
  expect(hasPrivacyConsent('cloud')).toBe(false);
});
test('rapid A to B to A auth callbacks reload consent and reject the earlier A result', async () => {
  let resolveFirstA!: (value: {consent: typeof consent; deleting: boolean}) => void;
  let resolveNextA!: (value: {consent: null; deleting: boolean}) => void;
  service.load
    .mockImplementationOnce(() => new Promise(resolve => {
      resolveFirstA = resolve;
    }))
    .mockImplementationOnce(() => new Promise(resolve => {
      resolveNextA = resolve;
    }));
  const tree = await mount();
  expect(service.load).toHaveBeenCalledTimes(1);
  await act(async () => {
    mockAuth.currentUser = {uid: 'owner-B'};
    mockListener(mockAuth.currentUser);
    mockAuth.currentUser = {uid: 'owner-A'};
    mockListener(mockAuth.currentUser);
  });
  expect(service.load).toHaveBeenCalledTimes(2);
  expect(service.load).toHaveBeenLastCalledWith('owner-A');
  await act(async () => {
    resolveFirstA({consent, deleting: false});
  });
  expect(tree.root.findByProps({testID: 'privacy-loading'})).toBeDefined();
  expect(tree.root.findAllByProps({testID: 'product-child'})).toHaveLength(0);
  expect(hasPrivacyConsent('cloud')).toBe(false);
  await act(async () => {
    resolveNextA({consent: null, deleting: false});
  });
  expect(tree.root.findAllByProps({testID: 'privacy-loading'})).toHaveLength(0);
  expect(tree.root.findByType(PrivacyView)).toBeDefined();
  expect(tree.root.findAllByProps({testID: 'product-child'})).toHaveLength(0);
  expect(hasPrivacyConsent('cloud')).toBe(false);
});
test('a failed withdrawal cannot close the view and restore the previous cloud permission', async () => {
  service.load.mockResolvedValue({consent, deleting: false});
  service.save.mockRejectedValue(new Error('offline'));
  const tree = await mount();
  await act(async () => {
    tree.root.findByProps({testID: 'product-child'}).props.onPress();
  });
  await act(async () => {
    await expect(
      tree.root.findByType(PrivacyView).props.runtime.saveConsent(false, false),
    ).rejects.toThrow('offline');
  });
  expect(
    tree.root.findByType(PrivacyView).props.runtime.onClose,
  ).toBeUndefined();
  expect(tree.root.findAllByProps({testID: 'product-child'})).toHaveLength(0);
  expect(hasPrivacyConsent('cloud')).toBe(false);
});
test('recovery lookup holds startup and a signed-out recovery cannot mount the app', async () => {
  mockAuth.currentUser = null;
  let resolve!: (owner: string | null) => void;
  service.recoveryOwner.mockReturnValue(
    new Promise(value => {
      resolve = value;
    }),
  );
  const tree = await mount();
  expect(tree.root.findByProps({testID: 'privacy-loading'})).toBeDefined();
  expect(tree.root.findAllByProps({testID: 'product-child'})).toHaveLength(0);
  await act(async () => resolve('old-owner'));
  expect(tree.root.findByType(PrivacyView)).toBeDefined();
  await act(async () => {
    await tree.root.findByType(PrivacyView).props.runtime.deleteAccount();
  });
  expect(service.deleteAccount).toHaveBeenCalledWith('old-owner');
});
test('A to B to A rejects an earlier consent completion', async () => {
  service.load.mockResolvedValue({consent, deleting: false});
  const tree = await mount();
  await act(async () =>
    tree.root.findByProps({testID: 'product-child'}).props.onPress(),
  );
  let resolve!: (value: typeof consent) => void;
  service.save.mockReturnValue(
    new Promise(done => {
      resolve = done;
    }),
  );
  let pending!: Promise<void>;
  await act(async () => {
    pending = tree.root
      .findByType(PrivacyView)
      .props.runtime.saveConsent(true, false);
  });
  await act(async () => {
    mockAuth.currentUser = {uid: 'owner-B'};
    mockListener(mockAuth.currentUser);
  });
  await act(async () => {
    mockAuth.currentUser = {uid: 'owner-A'};
    mockListener(mockAuth.currentUser);
  });
  await act(async () => {
    resolve(consent);
    await expect(pending).rejects.toThrow('Account changed');
  });
});

test('failed signed-out native recovery stays visible and retries deletion before mounting data runtimes', async () => {
  mockAuth.currentUser = null;
  service.recoveryOwner.mockResolvedValue('owner-A');
  service.resumeNativeDeletion.mockRejectedValueOnce(new Error('native teardown failure'));
  const tree = await mount();
  expect(service.resumeNativeDeletion).toHaveBeenCalledWith('owner-A');
  expect(tree.root.findByProps({testID: 'privacy-native-recovery-error'})).toBeDefined();
  expect(tree.root.findAllByProps({testID: 'product-child'})).toHaveLength(0);
  await act(async () => {await tree.root.findByType(PrivacyView).props.runtime.deleteAccount();});
  expect(service.deleteAccount).toHaveBeenCalledWith('owner-A');
  expect(tree.root.findAllByProps({testID: 'privacy-native-recovery-error'})).toHaveLength(0);
});
