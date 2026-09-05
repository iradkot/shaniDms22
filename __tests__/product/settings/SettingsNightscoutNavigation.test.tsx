import React from 'react';
import {Pressable, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {ProductExperience} from 'app/product/app';
import {
  buildSettingsOverview,
  type SettingsDataSource,
} from 'app/modules/settings';
import {withTheme} from '../../mocks/withTheme';
import {createNativeNightscoutSettingsConnection} from 'app/platform/native/settings';
import {NightscoutConnectionTestError} from 'app/services/nightscoutConnectionTest';

const overview = buildSettingsOverview({
  language: 'en',
  layout: 'phone',
  personalization: {
    questionnaireStatus: 'skipped',
    favoritesCount: 0,
    showCurrentSnapshot: false,
    showRecents: false,
    showGri: false,
    chatShortcut: false,
    updatesShortcut: false,
  },
  account: {status: 'signed-in'},
  nightscout: {
    status: 'connected',
    displayLabel: 'Home Nightscout',
    credentialConfigured: true,
  },
  ai: {enabled: false, credentialConfigured: false},
  preMealAssistance: {enabled: false, notificationsEnabled: false},
  offline: {status: 'ready', pendingWrites: 0},
});
const dataSource: SettingsDataSource = {
  load: async () => overview,
  apply: async () => overview,
};
const button = (tree: renderer.ReactTestRenderer, testID: string) => {
  const control = tree.root
    .findAllByProps({testID})
    .find(node => node.type === Pressable);
  expect(control).toBeDefined();
  return control!;
};

describe('Nightscout access from Product Settings', () => {
  it('opens Settings from the Hub and exposes an explicit connection test beside the saved source', async () => {
    const onOpenSection = jest.fn();
    const testProfileConnection = jest
      .fn()
      .mockRejectedValueOnce(
        new NightscoutConnectionTestError('authentication'),
      )
      .mockResolvedValue({
        ok: true,
        entriesCount: 1,
        latestEntryDate: Date.now(),
        authMethod: 'header',
      });
    const nightscoutConnection = createNativeNightscoutSettingsConnection({
      sourceKey: 'account-one:profile-one',
      profile: {id: 'profile-one', baseUrl: 'https://nightscout.example.test'},
      isLoaded: true,
      snapshot: {snapshot: null, error: null, isLoading: false},
      testProfileConnection,
    });
    let tree: renderer.ReactTestRenderer | undefined;
    try {
      await act(async () => {
        tree = renderer.create(
          withTheme(
            <ProductExperience
              locale="en"
              personalizationLayout="phone"
              runtime={{platform: 'android'}}
              settingsRuntime={{
                dataSource,
                onOpenSection,
                nightscoutConnection,
              }}
            />,
          ),
        );
      });
      act(() => button(tree!, 'hub-category-manage').props.onPress());
      await act(async () => {
        button(tree!, 'hub-grid-manage-tile-core.settings').props.onPress();
      });
      expect(
        tree!.root.findByProps({testID: 'settings-module-view'}),
      ).toBeTruthy();
      expect(
        tree!.root
          .findAllByType(Text)
          .some(node => node.props.children === 'Home Nightscout'),
      ).toBe(true);
      expect(
        button(tree!, 'settings-test-nightscout').props.accessibilityRole,
      ).toBe('button');
      expect(
        tree!.root.findByProps({testID: 'settings-nightscout-status'}).props
          .children,
      ).toBe('Source saved. Connection not tested yet.');
      expect(testProfileConnection).not.toHaveBeenCalled();
      await act(async () => {
        await button(tree!, 'settings-test-nightscout').props.onPress();
      });
      expect(
        tree!.root.findByProps({testID: 'settings-nightscout-status'}).props
          .children,
      ).toContain('rejected the credential');
      await act(async () => {
        await button(tree!, 'settings-test-nightscout').props.onPress();
      });
      expect(
        tree!.root.findByProps({testID: 'settings-nightscout-status'}).props
          .children,
      ).toBe('Connection verified. Glucose data is available.');
      expect(
        tree!.root.findByProps({testID: 'settings-nightscout-latest'}),
      ).toBeTruthy();
      expect(testProfileConnection).toHaveBeenCalledTimes(2);
      expect(testProfileConnection).toHaveBeenLastCalledWith({
        profileId: 'profile-one',
        urlInput: 'https://nightscout.example.test',
      });
      act(() => button(tree!, 'settings-manage-nightscout').props.onPress());
      expect(onOpenSection).toHaveBeenCalledWith('nightscout');
    } finally {
      act(() => tree?.unmount());
    }
  });
});
