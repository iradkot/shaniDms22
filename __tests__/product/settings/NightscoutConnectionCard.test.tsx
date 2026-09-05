import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {getThemeById} from 'app/style/theme';
import {NightscoutConnectionCard} from 'app/product/settings/NightscoutConnectionCard';
import type {
  SettingsNightscoutConnectionRuntime,
  SettingsNightscoutTestResult,
} from 'app/product/settings';
import {withTheme} from '../../mocks/withTheme';

const source = {
  status: 'connected',
  displayLabel: 'Saved source',
  credentialConfigured: true,
} as const;
const connection = (
  testConnection: SettingsNightscoutConnectionRuntime['testConnection'],
): SettingsNightscoutConnectionRuntime => ({
  sourceKey: 'one',
  status: 'configured',
  testConnection,
});
const button = (tree: renderer.ReactTestRenderer, testID: string) =>
  tree.root.findAllByProps({testID}).find(node => node.type === Pressable)!;
const status = (tree: renderer.ReactTestRenderer) =>
  tree.root.findByProps({testID: 'settings-nightscout-status'}).props.children;
const content = (
  runtime: SettingsNightscoutConnectionRuntime,
  locale: 'en' | 'he' = 'en',
) =>
  withTheme(
    <NightscoutConnectionCard
      source={source}
      connection={runtime}
      locale={locale}
      onEdit={jest.fn()}
    />,
  );

describe('Nightscout connection controls', () => {
  let tree: renderer.ReactTestRenderer;
  afterEach(() => {
    act(() => tree?.unmount());
  });

  it('coalesces taps and ignores results from a previous source', async () => {
    let finish: (result: SettingsNightscoutTestResult) => void = () =>
      undefined;
    const test = jest.fn(
      () =>
        new Promise<SettingsNightscoutTestResult>(resolve => {
          finish = resolve;
        }),
    );
    act(() => {
      tree = renderer.create(content(connection(test)));
    });
    const press = button(tree, 'settings-test-nightscout').props.onPress;
    act(() => {
      press();
      press();
    });
    expect(test).toHaveBeenCalledTimes(1);
    expect(button(tree, 'settings-test-nightscout').props.disabled).toBe(true);
    const next = {
      ...connection(
        jest.fn(
          async (): Promise<SettingsNightscoutTestResult> => ({
            status: 'connected',
            entriesCount: 0,
          }),
        ),
      ),
      sourceKey: 'two',
    };
    act(() => tree.update(content(next)));
    expect(status(tree)).toBe('Source saved. Connection not tested yet.');
    expect(button(tree, 'settings-test-nightscout').props.disabled).toBe(false);
    await act(async () => {
      finish({status: 'connected', entriesCount: 1});
    });
    expect(status(tree)).toBe('Source saved. Connection not tested yet.');
    await act(async () => {
      await button(tree, 'settings-test-nightscout').props.onPress();
    });
    expect(status(tree)).toContain('returned no glucose readings');
  });

  it('distinguishes stale glucose from a failed connection and renders Hebrew using the selected theme', async () => {
    const dark = getThemeById('darkFocus');
    const runtime = connection(async () => ({
      status: 'connected',
      entriesCount: 1,
      latestEntryDate: Date.now() - 3600000,
    }));
    act(() => {
      tree = renderer.create(
        withTheme(
          <NightscoutConnectionCard
            source={source}
            connection={runtime}
            locale="he"
          />,
          dark,
        ),
      );
    });
    await act(async () => {
      await button(tree, 'settings-test-nightscout').props.onPress();
    });
    expect(status(tree)).toBe('החיבור תקין. נתוני סוכר זמינים.');
    expect(
      tree.root.findByProps({testID: 'settings-nightscout-stale'}).props
        .children,
    ).toContain('10 דקות');
    const card = tree.root
      .findAllByProps({testID: 'settings-nightscout-card'})
      .find(node => node.type === View)!;
    expect(StyleSheet.flatten(card.props.style)).toMatchObject({
      backgroundColor: dark.white,
      borderColor: dark.borderColor,
    });
    expect(
      StyleSheet.flatten(button(tree, 'settings-test-nightscout').props.style),
    ).toMatchObject({
      backgroundColor: dark.buttonBackgroundColor,
      minHeight: 48,
    });
  });

  it('renders only a safe actionable message if a host throws sensitive error text', async () => {
    const secret = 'private-fixture-token-do-not-display';
    act(() => {
      tree = renderer.create(
        content(
          connection(async () => {
            throw new Error(secret);
          }),
        ),
      );
    });
    await act(async () => {
      await button(tree, 'settings-test-nightscout').props.onPress();
    });
    expect(status(tree)).toContain('Check your internet connection');
    expect(JSON.stringify(tree.toJSON())).not.toContain(secret);
    expect(button(tree, 'settings-test-nightscout').props.disabled).toBe(false);
  });

  it('requires confirmation for legacy recovery, cancels safely, and keeps test/edit unavailable while restoring', async () => {
    let complete: () => void = () => undefined;
    const recover = jest.fn(
      () =>
        new Promise<void>(resolve => {
          complete = resolve;
        }),
    );
    const test = jest.fn(
      async (): Promise<SettingsNightscoutTestResult> => ({
        status: 'connected',
        entriesCount: 1,
      }),
    );
    const runtime = {...connection(test), recovery: {count: 2, recover}};
    act(() => {
      tree = renderer.create(content(runtime, 'he'));
    });
    act(() => button(tree, 'settings-nightscout-recover').props.onPress());
    expect(recover).not.toHaveBeenCalled();
    expect(
      tree.root
        .findAllByType(Text)
        .some(node =>
          String(node.props.children).includes('לחשבון המחובר כעת'),
        ),
    ).toBe(true);
    act(() =>
      button(tree, 'settings-nightscout-cancel-recovery').props.onPress(),
    );
    expect(recover).not.toHaveBeenCalled();
    act(() => button(tree, 'settings-nightscout-recover').props.onPress());
    const confirm = button(tree, 'settings-nightscout-confirm-recovery').props
      .onPress;
    act(() => {
      confirm();
      confirm();
    });
    expect(recover).toHaveBeenCalledTimes(1);
    expect(button(tree, 'settings-test-nightscout').props.disabled).toBe(true);
    expect(button(tree, 'settings-manage-nightscout').props.disabled).toBe(
      true,
    );
    await act(async () => {
      await button(tree, 'settings-test-nightscout').props.onPress();
    });
    expect(test).not.toHaveBeenCalled();
    await act(async () => {
      complete();
    });
    expect(button(tree, 'settings-test-nightscout').props.disabled).toBe(false);
    expect(
      tree.root.findByProps({testID: 'settings-nightscout-recovery-result'})
        .props.children,
    ).toContain('שוחזר לחשבון הזה');
  });

  it('keeps quarantined connection details hidden and permits retry after failed recovery', async () => {
    const recover = jest
      .fn()
      .mockRejectedValueOnce(new Error('secret previous-source.example'))
      .mockResolvedValue(undefined);
    const runtime = {
      ...connection(jest.fn()),
      status: 'not-configured' as const,
      recovery: {count: 1, recover},
    };
    act(() => {
      tree = renderer.create(
        withTheme(
          <NightscoutConnectionCard
            source={{status: 'not-connected', credentialConfigured: false}}
            connection={runtime}
            locale="en"
            onEdit={jest.fn()}
          />,
        ),
      );
    });
    expect(
      tree.root.findAllByProps({testID: 'settings-test-nightscout'}),
    ).toHaveLength(0);
    act(() => button(tree, 'settings-nightscout-recover').props.onPress());
    await act(async () => {
      await button(
        tree,
        'settings-nightscout-confirm-recovery',
      ).props.onPress();
    });
    expect(JSON.stringify(tree.toJSON())).not.toContain(
      'previous-source.example',
    );
    expect(
      tree.root.findByProps({testID: 'settings-nightscout-recovery-result'})
        .props.children,
    ).toContain('saved connection has been kept');
    act(() => button(tree, 'settings-nightscout-recover').props.onPress());
    await act(async () => {
      await button(
        tree,
        'settings-nightscout-confirm-recovery',
      ).props.onPress();
    });
    expect(recover).toHaveBeenCalledTimes(2);
  });
});
