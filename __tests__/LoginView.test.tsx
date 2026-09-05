import React from 'react';
import {Pressable, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';

const mockSetLanguage = jest.fn();

jest.mock('app/utils/e2e', () => ({isE2E: false}));
jest.mock('app/services/nightscoutProfiles', () => ({
  hasAnyNightscoutProfile: jest.fn(async () => false),
}));
jest.mock('app/contexts/AppLanguageContext', () => ({
  useAppLanguage: () => ({language: 'en', setLanguage: mockSetLanguage}),
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
    signIn = jest.fn();
  },
}));

import Login from '../src/containers/Login';

describe('Login view', () => {
  beforeEach(() => mockSetLanguage.mockClear());

  it('shows the redesigned entry, hides developer token controls, and exposes language choice', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Login navigation={{reset: jest.fn()} as never} />);
    });

    const labels = tree!.root.findAllByType(Text).map(node =>
      Array.isArray(node.props.children)
        ? node.props.children.join('')
        : String(node.props.children ?? ''),
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        'Shani Diabetes',
        'Your diabetes data, organised around you',
        'Continue with Google',
      ]),
    );
    expect(labels).not.toContain('Get tokens');

    act(() => {
      tree!.root
        .findAllByProps({testID: 'login-language-he'})
        .find(node => node.type === Pressable)!
        .props.onPress();
    });
    expect(mockSetLanguage).toHaveBeenCalledWith('he');
    act(() => tree!.unmount());
  });
});
