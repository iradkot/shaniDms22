/**
 * Minimal integration test: verifies App module loads and renders.
 * Heavy screens/native dependencies are mocked to keep this test stable.
 */

import 'react-native';
import React from 'react';
import renderer, {act} from 'react-test-renderer';

// App logs quite a bit; silence it for this integration smoke test.
const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

jest.mock('app/components/ErrorBoundary', () => {
  const React = require('react');
  return ({children}) => React.createElement(React.Fragment, null, children);
});

jest.mock('app/components/NotificationModal', () => 'NotificationModal');

jest.mock('app/components/CameraScreen/CameraScreen', () => 'CameraScreen');

jest.mock('app/containers/Login', () => 'Login');

jest.mock('app/containers/initScreen', () => 'AppInitScreen');

jest.mock('app/containers/MainTabsNavigator/MainTabsNavigator', () => 'MainTabsNavigator');

jest.mock('app/containers/forms/AddNotificationScreen/AddNotificationScreen', () => 'AddNotificationScreen');

jest.mock('app/containers/forms/EditNotificationScreen/EditNotificationScreen', () => 'EditNotificationScreen');

jest.mock('app/containers/forms/Food/AddFoodItem', () => 'AddFoodItemScreen');

jest.mock('app/containers/forms/Food/EditFoodItemScreen', () => 'EditFoodItemScreen');

jest.mock('app/containers/forms/Sport/AddSportItem', () => 'AddSportItem');

jest.mock('app/containers/forms/Sport/EditSportItem', () => 'EditSportItem');

jest.mock('app/contexts/SportItemsContext', () => {
  const React = require('react');
  return {
    SportItemsProvider: ({children}) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('app/components/CgmGraph/contextStores/TouchContext', () => {
  const React = require('react');
  return {
    TouchProvider: ({children}) => React.createElement(React.Fragment, null, children),
  };
});

jest.mock('app/services/rebaseService', () => ({
  registerDeviceToken: jest.fn(),
  unregisterDeviceToken: jest.fn(),
  syncTokenIfNeeded: jest.fn(),
}));

import App from '../src/App';

describe('App (integration)', () => {
  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('renders without crashing', () => {
    let tree;
    act(() => {
      tree = renderer.create(<App />);
    });
    act(() => {
      tree.unmount();
    });
  });
});
