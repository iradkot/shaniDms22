import React from 'react';
import {Pressable, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import type {
  UpdateCenterRepository,
  UpdateCenterSnapshot,
  UpdateDeepLinkDescriptor,
} from 'app/modules/alerts';
import {createInMemoryUpdateCenterRepository} from 'app/modules/alerts';
import {UpdateCenterView} from 'app/product/alerts/UpdateCenterView';

const textValues = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).map(node =>
    Array.isArray(node.props.children)
      ? node.props.children.join('')
      : String(node.props.children ?? ''),
  );

const controllableRepository = (initial: UpdateCenterSnapshot) => {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const refresh = jest.fn(async () => undefined);
  const repository: UpdateCenterRepository = {
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    refresh,
    markRead: async () => undefined,
  };
  return {
    repository,
    refresh,
    publish: (next: UpdateCenterSnapshot) => {
      snapshot = next;
      listeners.forEach(listener => listener());
    },
  };
};

describe('UpdateCenterView', () => {
  it('shows factual legacy history and opens only its typed descriptor', async () => {
    const deepLink: UpdateDeepLinkDescriptor = {
      kind: 'alert-occurrence',
      occurrenceId: 'occurrence-1',
    };
    const repository = createInMemoryUpdateCenterRepository([
      {
        id: 'occurrence-1',
        kind: 'alert',
        occurredAtMs: 2_000,
        readState: 'unknown',
        content: {kind: 'alert-rule-trigger', ruleName: 'Night low'},
        deepLink,
      },
    ]);
    const onOpenDeepLink = jest.fn();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <UpdateCenterView
          formatTimestamp={() => '02:00'}
          focusedOccurrenceId="occurrence-1"
          locale="en"
          onOpenDeepLink={onOpenDeepLink}
          repository={repository}
        />,
      );
    });

    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'Update center',
        'Night low',
        'Read status unavailable',
        '02:00',
        'The rule was recorded as triggered. Its glucose value and original notification text were not retained.',
      ]),
    );
    expect(
      tree!.root.findByProps({testID: 'update-item-occurrence-1'}).props
        .accessibilityState,
    ).toEqual({selected: true});
    await act(async () => {
      tree!.root
        .findAllByProps({testID: 'update-open-occurrence-1'})
        .find(node => node.type === Pressable)!
        .props.onPress();
      await Promise.resolve();
    });
    expect(onOpenDeepLink).toHaveBeenCalledWith(deepLink);
    act(() => tree!.unmount());
  });

  it('renders loading, error retry, and a Hebrew RTL empty state', async () => {
    const control = controllableRepository({status: 'loading'});
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <UpdateCenterView locale="he" repository={control.repository} />,
      );
    });
    expect(tree!.root.findByProps({testID: 'update-center-loading'})).toBeTruthy();

    act(() => control.publish({status: 'error'}));
    expect(textValues(tree!)).toContain('לא הצלחנו לטעון את העדכונים.');
    await act(async () => {
      tree!.root.findByProps({testID: 'update-center-retry'}).props.onPress();
      await Promise.resolve();
    });
    expect(control.refresh).toHaveBeenCalledTimes(2);

    act(() => control.publish({status: 'ready', items: []}));
    expect(textValues(tree!)).toContain('אין עדיין עדכונים או תזכורות.');
    expect(
      tree!.root.findByProps({testID: 'update-center-view'}).props.style,
    ).toEqual(expect.arrayContaining([expect.objectContaining({direction: 'rtl'})]));
    act(() => tree!.unmount());
  });
});
