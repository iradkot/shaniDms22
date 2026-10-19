import React from 'react';
import {Pressable, Text, TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';

const mockAddProfile = jest.fn(async () => undefined);
const mockUpdateProfile = jest.fn(async () => undefined);
const mockReset = jest.fn();
const mockGoBack = jest.fn();
const mockTestProfileConnection = jest.fn();
let mockRouteParams: {profileId: string} | undefined;
let mockProfiles: {id: string; baseUrl: string; authType?: string}[] = [];

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    canGoBack: () => false,
    goBack: mockGoBack,
    reset: mockReset,
  }),
  useRoute: () => ({params: mockRouteParams}),
}));
jest.mock('app/contexts/AppLanguageContext', () => ({
  useAppLanguage: () => ({language: 'he', setLanguage: jest.fn()}),
}));
jest.mock('app/contexts/NightscoutConfigContext', () => ({
  useNightscoutConfig: () => ({
    addProfile: mockAddProfile,
    updateProfile: mockUpdateProfile,
    profiles: mockProfiles,
    testProfileConnection: mockTestProfileConnection,
  }),
}));

import NightscoutSetupScreen from '../src/containers/NightscoutSetupScreen';
import {NightscoutConnectionTestError} from '../src/services/nightscoutConnectionTest';

const press = (tree: renderer.ReactTestRenderer, testID: string) =>
  tree.root
    .findAllByProps({testID})
    .find(node => node.type === Pressable)!.props.onPress();

describe('NightscoutSetupScreen', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockRouteParams = undefined;
    mockProfiles = [];
    mockTestProfileConnection.mockResolvedValue({entriesCount: 1});
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
      'יש להזין כתובת Nightscout תקינה, עם או בלי https://.',
    );
    expect(mockAddProfile).not.toHaveBeenCalled();
    act(() => tree!.unmount());
  });

  it.each([
    ['example.com', 'fixtureSecretValue123'],
    ['https://example.com', 'fixtureSecretValue123'],
    ['example.com', 'shani-0123456789abcdef'],
  ])('connects to %s with a token or API secret in one action', async (urlInput, secretInput) => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<NightscoutSetupScreen />);
    });
    act(() => {
      tree!.root
        .findByProps({testID: 'nightscout-url-input'})
        .findByType(TextInput).props.onChangeText(urlInput);
      tree!.root
        .findByProps({testID: 'nightscout-secret-input'})
        .findByType(TextInput).props.onChangeText(secretInput);
    });

    await act(async () => {
      press(tree!, 'nightscout-save');
      await Promise.resolve();
    });

    expect(mockAddProfile).toHaveBeenCalledWith({
      urlInput,
      secretInput,
    });
    expect(mockTestProfileConnection).not.toHaveBeenCalled();
    expect(mockReset).toHaveBeenCalledWith({
      index: 0,
      routes: [{name: 'ProductExperienceScreen'}],
    });
    act(() => tree!.unmount());
  });

  it('keeps the saved API secret when an edited connection leaves the credential blank', async () => {
    mockRouteParams = {profileId: 'saved'};
    mockProfiles = [{id: 'saved', baseUrl: 'https://example.com', authType: 'api-secret'}];
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<NightscoutSetupScreen />);
    });
    expect(tree!.root.findAllByProps({testID: 'nightscout-legacy-reconnect'})).toHaveLength(0);
    await act(async () => {
      await press(tree!, 'nightscout-save');
    });
    expect(mockUpdateProfile).toHaveBeenCalledWith({
      profileId: 'saved',
      urlInput: 'https://example.com',
      secretInput: '',
    });
    act(() => tree!.unmount());
  });

  it.each(['nightscout-save', 'nightscout-test-connection'])(
    'requires a credential for a new connection through %s',
    async testID => {
      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(<NightscoutSetupScreen />);
      });
      act(() => {
        tree!.root.findByProps({testID: 'nightscout-url-input'})
          .findByType(TextInput).props.onChangeText('example.com');
      });
      await act(async () => {
        await press(tree!, testID);
      });
      expect(tree!.root.findByProps({accessibilityRole: 'alert'}).props.children)
        .toBe('יש להזין טוקן או API_SECRET של Nightscout.');
      expect(mockAddProfile).not.toHaveBeenCalled();
      expect(mockTestProfileConnection).not.toHaveBeenCalled();
      act(() => tree!.unmount());
    },
  );

  it.each(['nightscout-save', 'nightscout-test-connection'])(
    'shows a localized connection error through %s',
    async testID => {
      const failure = new NightscoutConnectionTestError('authentication');
      mockAddProfile.mockRejectedValueOnce(failure);
      mockTestProfileConnection.mockRejectedValueOnce(failure);
      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(<NightscoutSetupScreen />);
      });
      act(() => {
        tree!.root.findByProps({testID: 'nightscout-url-input'})
          .findByType(TextInput).props.onChangeText('example.com');
        tree!.root.findByProps({testID: 'nightscout-secret-input'})
          .findByType(TextInput).props.onChangeText('shani-0123456789abcdef');
      });
      await act(async () => {
        await press(tree!, testID);
      });
      expect(tree!.root.findByProps({accessibilityRole: 'alert'}).props.children)
        .toBe('פרטי הגישה לא התקבלו. יש לבדוק את הטוקן או ה־API_SECRET ולנסות שוב.');
      expect(mockReset).not.toHaveBeenCalled();
      act(() => tree!.unmount());
    },
  );

  it('does not display raw errors that could contain a credential', async () => {
    mockTestProfileConnection.mockRejectedValueOnce(
      new Error('request failed with private-fixture-credential'),
    );
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<NightscoutSetupScreen />);
    });
    act(() => {
      tree!.root.findByProps({testID: 'nightscout-url-input'})
        .findByType(TextInput).props.onChangeText('example.com');
      tree!.root.findByProps({testID: 'nightscout-secret-input'})
        .findByType(TextInput).props.onChangeText('fixtureSecretValue123');
    });
    await act(async () => {
      await press(tree!, 'nightscout-test-connection');
    });
    expect(tree!.root.findByProps({accessibilityRole: 'alert'}).props.children)
      .toBe('בדיקת החיבור ל-Nightscout נכשלה.');
    expect(JSON.stringify(tree!.toJSON())).not.toContain('private-fixture-credential');
    act(() => tree!.unmount());
  });
});
