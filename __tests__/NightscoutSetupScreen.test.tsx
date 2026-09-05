import React from 'react';
import {Pressable, Text, TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';

const mockAddProfile = jest.fn(async () => undefined);
const mockUpdateProfile = jest.fn(async () => undefined);
const mockReset = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    canGoBack: () => false,
    goBack: mockGoBack,
    reset: mockReset,
  }),
  useRoute: () => ({params: undefined}),
}));
jest.mock('app/contexts/AppLanguageContext', () => ({
  useAppLanguage: () => ({language: 'he', setLanguage: jest.fn()}),
}));
jest.mock('app/contexts/NightscoutConfigContext', () => ({
  useNightscoutConfig: () => ({
    addProfile: mockAddProfile,
    updateProfile: mockUpdateProfile,
    profiles: [],
  }),
}));

import NightscoutSetupScreen from '../src/containers/NightscoutSetupScreen';

const press = (tree: renderer.ReactTestRenderer, testID: string) =>
  tree.root
    .findAllByProps({testID})
    .find(node => node.type === Pressable)!.props.onPress();

describe('NightscoutSetupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('validates inputs in the selected language before persisting credentials', async () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<NightscoutSetupScreen />);
    });

    await act(async () => {
      press(tree!, 'nightscout-save');
      await Promise.resolve();
    });

    const labels = tree!.root.findAllByType(Text).map(node =>
      Array.isArray(node.props.children)
        ? node.props.children.join('')
        : String(node.props.children ?? ''),
    );
    expect(labels).toContain(
      'יש להזין כתובת Nightscout תקינה מסוג http או https.',
    );
    expect(mockAddProfile).not.toHaveBeenCalled();
    act(() => tree!.unmount());
  });

  it('saves a valid profile and enters the product experience', async () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<NightscoutSetupScreen />);
    });
    act(() => {
      tree!.root
        .findByProps({testID: 'nightscout-url-input'})
        .findByType(TextInput).props.onChangeText('example.com');
      tree!.root
        .findByProps({testID: 'nightscout-secret-input'})
        .findByType(TextInput).props.onChangeText('a valid secret');
    });

    await act(async () => {
      press(tree!, 'nightscout-save');
      await Promise.resolve();
    });

    expect(mockAddProfile).toHaveBeenCalledWith({
      urlInput: 'example.com',
      secretInput: 'a valid secret',
    });
    expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{name: 'ProductExperienceScreen'}],
    });
    act(() => tree!.unmount());
  });
});
