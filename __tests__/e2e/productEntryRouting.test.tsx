import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {getApp} from '@react-native-firebase/app';
import {getAuth} from '@react-native-firebase/auth';
import {Pressable} from 'react-native';
import {E2E_TEST_IDS} from '../../src/constants/E2E_TEST_IDS';
import {PRODUCT_EXPERIENCE_SCREEN} from '../../src/constants/SCREEN_NAMES';

jest.mock('app/utils/e2e', () => ({isE2E: true}));
jest.mock('app/services/nightscoutProfiles', () => ({
  hasAnyNightscoutProfile: jest.fn(),
}));
jest.mock('@react-native-google-signin/google-signin', () => {
  const ReactLib = require('react');
  const {Pressable: NativePressable} = require('react-native');
  const GoogleSigninButton = (props: object) =>
    ReactLib.createElement(NativePressable, props);
  GoogleSigninButton.Size = {Wide: 'wide'};
  GoogleSigninButton.Color = {Dark: 'dark'};
  return {GoogleSigninButton};
});
jest.mock('app/api/GoogleSignIn', () => ({
  __esModule: true,
  default: class TestGoogleSignIn {
    getTokens = jest.fn();
    signIn = jest.fn();
  },
}));

import AppInitScreen from '../../src/containers/initScreen';
import Login from '../../src/containers/Login';

describe('E2E product entry routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('starts at Product Experience without consulting Firebase auth', () => {
    const reset = jest.fn();
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <AppInitScreen navigation={{reset} as never} />,
      );
    });

    expect(reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{name: PRODUCT_EXPERIENCE_SCREEN}],
    });
    expect(getApp).not.toHaveBeenCalled();
    expect(getAuth).not.toHaveBeenCalled();

    act(() => tree!.unmount());
  });

  it('returns the deterministic E2E login path to Product Experience', async () => {
    const reset = jest.fn();
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(<Login navigation={{reset} as never} />);
    });

    const e2eButton = tree!.root
      .findAllByProps({testID: E2E_TEST_IDS.login.e2eButton})
      .find(node => node.type === Pressable);
    expect(e2eButton).toBeDefined();

    await act(async () => {
      await e2eButton?.props.onPress();
    });

    expect(reset).toHaveBeenCalledWith({
      index: 0,
      routes: [{name: PRODUCT_EXPERIENCE_SCREEN}],
    });
    expect(getApp).not.toHaveBeenCalled();
    expect(getAuth).not.toHaveBeenCalled();

    act(() => tree!.unmount());
  });
});
