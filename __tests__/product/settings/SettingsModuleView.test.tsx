import React from 'react';
import {Pressable, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import type {
  SettingsCommand,
  SettingsDataSource,
  SettingsOverview,
} from 'app/modules/settings';
import {SettingsModuleView} from 'app/product/settings';

const overview: SettingsOverview = {
  schemaVersion: 1,
  language: 'en',
  layout: {profile: 'tablet', columns: 3},
  personalization: {
    questionnaireStatus: 'completed',
    favoritesCount: 5,
    showCurrentSnapshot: true,
    showRecents: true,
    showGri: false,
    chatShortcut: true,
    updatesShortcut: false,
  },
  account: {status: 'signed-in', displayLabel: 'Irad'},
  nightscout: {
    status: 'connected',
    displayLabel: 'Home Nightscout',
    credentialConfigured: true,
  },
  ai: {enabled: true, credentialConfigured: false, advisoryOnly: true},
  preMealAssistance: {enabled: true, notificationsEnabled: false},
  offline: {status: 'ready', pendingWrites: 2},
};

const textValues = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).map(node =>
    Array.isArray(node.props.children)
      ? node.props.children.join('')
      : String(node.props.children ?? ''),
  );

describe('SettingsModuleView', () => {
  it('loads a safe overview and offers focused navigation instead of one dense form', async () => {
    const apply = jest.fn(
      async (_command: SettingsCommand): Promise<SettingsOverview> => overview,
    );
    const dataSource: SettingsDataSource = {
      load: jest.fn(async () => overview),
      apply,
    };
    const onOpenSection = jest.fn();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <SettingsModuleView
          dataSource={dataSource}
          locale="en"
          onCustomize={() => onOpenSection('personalization')}
          onOpenSection={onOpenSection}
        />,
      );
    });

    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'Settings',
        'Make it yours',
        'Language',
        'Connections and account',
        'AI analyst',
        'Before meals',
        'Offline data',
        'Alerts',
        'Home Nightscout',
        'Configured on this device',
        'Advisory only',
        '2 changes waiting to sync',
      ]),
    );

    act(() => {
      tree!.root
        .findAllByProps({testID: 'settings-customize'})
        .find(node => node.type === Pressable)!
        .props.onPress();
    });
    expect(onOpenSection).toHaveBeenCalledWith('personalization');

    act(() => {
      tree!.root
        .findAllByProps({testID: 'settings-manage-alerts'})
        .find(node => node.type === Pressable)!
        .props.onPress();
    });
    expect(onOpenSection).toHaveBeenCalledWith('alerts');

    act(() => tree!.unmount());
  });

  it('uses Hebrew RTL copy and applies typed Hub, language, and AI changes', async () => {
    const hebrewOverview: SettingsOverview = {...overview, language: 'he'};
    const apply = jest.fn(async (command: SettingsCommand) => {
      if (command.kind === 'set-layout-option') {
        return {
          ...hebrewOverview,
          personalization: {
            ...hebrewOverview.personalization,
            showGri: command.enabled,
          },
        };
      }
      return hebrewOverview;
    });
    const dataSource: SettingsDataSource = {
      load: async () => hebrewOverview,
      apply,
    };
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <SettingsModuleView dataSource={dataSource} locale="he" />,
      );
    });

    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'הגדרות',
        'מתאימים את האפליקציה',
        'המרכז והניווט',
        'מידע ללא חיבור',
        'לייעוץ בלבד',
      ]),
    );
    expect(
      tree!.root.findByProps({testID: 'settings-module-view'}).props.style,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({direction: 'rtl'})]),
    );

    await act(async () => {
      tree!.root
        .findAllByProps({testID: 'settings-toggle-gri'})
        .find(node => node.type === Pressable)!
        .props.onPress();
      await Promise.resolve();
    });
    expect(apply).toHaveBeenCalledWith({
      kind: 'set-layout-option',
      option: 'show-gri',
      enabled: true,
    });
    expect(
      tree!.root
        .findAllByProps({testID: 'settings-toggle-gri'})
        .find(node => node.type === Pressable)!.props.accessibilityState,
    ).toMatchObject({checked: true});

    await act(async () => {
      tree!.root
        .findAllByProps({testID: 'settings-toggle-pre-meal-notifications'})
        .find(node => node.type === Pressable)!
        .props.onPress();
      await Promise.resolve();
    });
    expect(apply).toHaveBeenCalledWith({
      kind: 'set-pre-meal-assistance',
      option: 'notifications',
      enabled: true,
    });

    await act(async () => {
      tree!.root
        .findAllByProps({testID: 'settings-language-en'})
        .find(node => node.type === Pressable)!
        .props.onPress();
      await Promise.resolve();
    });
    expect(apply).toHaveBeenCalledWith({kind: 'set-language', language: 'en'});
    act(() => tree!.unmount());
  });

  it('shows loading and supports retry after a load failure', async () => {
    const load = jest
      .fn<Promise<SettingsOverview>, []>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(overview);
    const dataSource: SettingsDataSource = {
      load,
      apply: async () => overview,
    };
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <SettingsModuleView dataSource={dataSource} locale="en" />,
      );
    });
    expect(tree!.root.findByProps({testID: 'settings-loading'})).toBeTruthy();

    await act(async () => {
      await Promise.resolve();
    });
    expect(tree!.root.findByProps({testID: 'settings-error'})).toBeTruthy();

    await act(async () => {
      tree!.root
        .findAllByProps({testID: 'settings-retry'})
        .find(node => node.type === Pressable)!
        .props.onPress();
      await Promise.resolve();
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(textValues(tree!)).toContain('Settings');
    act(() => tree!.unmount());
  });

  it('ignores a stale load when the active Workspace adapter changes', async () => {
    let resolveOld: ((value: SettingsOverview) => void) | undefined;
    const oldSource: SettingsDataSource = {
      load: () =>
        new Promise(resolve => {
          resolveOld = resolve;
        }),
      apply: async () => overview,
    };
    const newOverview: SettingsOverview = {
      ...overview,
      nightscout: {...overview.nightscout, displayLabel: 'New Workspace'},
    };
    const newSource: SettingsDataSource = {
      load: async () => newOverview,
      apply: async () => newOverview,
    };
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(
        <SettingsModuleView dataSource={oldSource} locale="en" />,
      );
    });
    await act(async () => {
      tree!.update(
        <SettingsModuleView dataSource={newSource} locale="en" />,
      );
      await Promise.resolve();
    });
    expect(textValues(tree!)).toContain('New Workspace');

    await act(async () => {
      resolveOld?.({
        ...overview,
        nightscout: {...overview.nightscout, displayLabel: 'Old Workspace'},
      });
      await Promise.resolve();
    });
    expect(textValues(tree!)).toContain('New Workspace');
    expect(textValues(tree!)).not.toContain('Old Workspace');
    act(() => tree!.unmount());
  });
});
