import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import renderer, {act} from 'react-test-renderer';
import {
  AppLanguageProvider,
  useAppLanguage,
} from '../src/contexts/AppLanguageContext';
import type {AppLanguage} from '../src/contexts/AppLanguageContext';

const restoreAsyncStorageGetItem = () => {
  (
    AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>
  ).mockImplementation(async key => {
    const values = await AsyncStorage.multiGet([key]);
    return values[0]?.[1] ?? null;
  });
};

jest.mock('app/components/ErrorBoundary', () => {
  const ReactLib = require('react');
  return ({children}: {children: React.ReactNode}) =>
    ReactLib.createElement(ReactLib.Fragment, null, children);
});

jest.mock('app/components/NotificationModal', () => 'NotificationModal');
jest.mock('app/components/CameraScreen/CameraScreen', () => 'CameraScreen');
jest.mock('app/containers/Login', () => 'Login');
jest.mock('app/containers/initScreen', () => 'AppInitScreen');
jest.mock(
  'app/containers/MainTabsNavigator/MainTabsNavigator',
  () => 'MainTabsNavigator',
);
jest.mock(
  'app/containers/ProductExperienceScreen',
  () => 'ProductExperienceScreen',
);
jest.mock(
  'app/containers/FullScreen/FullScreenViewScreen',
  () => 'FullScreenViewScreen',
);
jest.mock(
  'app/containers/forms/AddNotificationScreen/AddNotificationScreen',
  () => 'AddNotificationScreen',
);
jest.mock(
  'app/containers/forms/EditNotificationScreen/EditNotificationScreen',
  () => 'EditNotificationScreen',
);
jest.mock('app/containers/forms/Food/AddFoodItem', () => 'AddFoodItemScreen');
jest.mock(
  'app/containers/forms/Food/EditFoodItemScreen',
  () => 'EditFoodItemScreen',
);
jest.mock('app/containers/forms/Sport/AddSportItem', () => 'AddSportItem');
jest.mock(
  'app/containers/forms/Sport/EditSportItem',
  () => 'EditSportItem',
);

jest.mock('app/contexts/SportItemsContext', () => {
  const ReactLib = require('react');
  return {
    SportItemsProvider: ({children}: {children: React.ReactNode}) =>
      ReactLib.createElement(ReactLib.Fragment, null, children),
  };
});

jest.mock('app/components/charts/CgmGraph/contextStores/TouchContext', () => {
  const ReactLib = require('react');
  return {
    TouchProvider: ({children}: {children: React.ReactNode}) =>
      ReactLib.createElement(ReactLib.Fragment, null, children),
  };
});

jest.mock('app/services/rebaseService', () => ({
  registerDeviceToken: jest.fn(),
  unregisterDeviceToken: jest.fn(),
  syncTokenIfNeeded: jest.fn(),
}));

jest.mock('app/hooks/useLatestNightscoutSnapshot', () => ({
  useLatestNightscoutSnapshot: () => ({
    snapshot: null,
    isLoading: false,
    error: null,
    refresh: jest.fn(),
  }),
}));

import App from '../src/App';

describe('app language startup', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    restoreAsyncStorageGetItem();
    await AsyncStorage.clear();
  });

  it('does not render the app shell before the stored language is loaded', () => {
    let resolveLanguage: ((language: string | null) => void) | undefined;
    const pendingLanguage = new Promise<string | null>(resolve => {
      resolveLanguage = resolve;
    });
    (
      AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>
    ).mockImplementation(key =>
      key === 'app.language.v1' ? pendingLanguage : Promise.resolve(null),
    );

    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<App />);
    });

    expect(tree!.toJSON()).toBeNull();

    act(() => {
      tree!.unmount();
      restoreAsyncStorageGetItem();
      resolveLanguage?.('he');
    });
  });

  it('loads the saved language and persists a language change', async () => {
    await AsyncStorage.setItem('app.language.v1', 'he');

    let languageState:
      | {
          language: AppLanguage;
          isLoaded: boolean;
          setLanguage: (language: AppLanguage) => Promise<void>;
        }
      | undefined;

    const LanguageProbe = () => {
      languageState = useAppLanguage();
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AppLanguageProvider>
          <LanguageProbe />
        </AppLanguageProvider>,
      );
    });

    expect(languageState?.isLoaded).toBe(true);
    expect(languageState?.language).toBe('he');

    await act(async () => {
      await languageState?.setLanguage('en');
    });

    expect(languageState?.language).toBe('en');
    expect(await AsyncStorage.getItem('app.language.v1')).toBe('en');

    act(() => {
      tree!.unmount();
    });
  });
});
