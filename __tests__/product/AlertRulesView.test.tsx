import React from 'react';
import {Pressable, Text, TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import type {
  AlertRulesRepository,
  AlertRulesSnapshot,
} from 'app/modules/alerts';
import {createInMemoryAlertRulesRepository} from 'app/modules/alerts';
import {AlertRulesView} from 'app/product/alerts/AlertRulesView';

const textValues = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root.findAllByType(Text).map(node =>
    Array.isArray(node.props.children)
      ? node.props.children.join('')
      : String(node.props.children ?? ''),
  );

const press = (tree: renderer.ReactTestRenderer, testID: string) =>
  tree.root
    .findAllByProps({testID})
    .find(node => node.type === Pressable)!.props.onPress();

const change = (
  tree: renderer.ReactTestRenderer,
  testID: string,
  value: string,
) =>
  tree.root
    .findAllByProps({testID})
    .find(node => node.type === TextInput)!.props.onChangeText(value);

describe('AlertRulesView', () => {
  it('adds, edits, disables, and deletes a rule through the repository seam', async () => {
    const repository = createInMemoryAlertRulesRepository([], {
      createId: () => 'rule-1',
    });
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AlertRulesView locale="en" repository={repository} />,
      );
    });

    act(() => press(tree!, 'alert-rule-add'));
    act(() => change(tree!, 'alert-rule-form-name', 'Night range'));
    act(() => change(tree!, 'alert-rule-form-from', '22:00'));
    act(() => change(tree!, 'alert-rule-form-to', '06:00'));
    await act(async () => {
      press(tree!, 'alert-rule-form-save');
      await Promise.resolve();
    });
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining(['Night range', '22:00–06:00', '< 70 or > 180 mg/dL']),
    );

    act(() => press(tree!, 'alert-rule-edit-rule-1'));
    act(() => change(tree!, 'alert-rule-form-name', 'Overnight range'));
    await act(async () => {
      press(tree!, 'alert-rule-form-save');
      await Promise.resolve();
    });
    expect(textValues(tree!)).toContain('Overnight range');

    await act(async () => {
      press(tree!, 'alert-rule-toggle-rule-1');
      await Promise.resolve();
    });
    expect(
      tree!.root.findByProps({testID: 'alert-rule-toggle-rule-1'}).props
        .accessibilityState,
    ).toEqual({checked: false, disabled: false});

    act(() => press(tree!, 'alert-rule-delete-rule-1'));
    expect(textValues(tree!)).toContain('Delete this rule?');
    await act(async () => {
      press(tree!, 'alert-rule-confirm-delete-rule-1');
      await Promise.resolve();
    });
    expect(textValues(tree!)).toContain('No alert rules yet.');
    act(() => tree!.unmount());
  });

  it('keeps invalid values local to the form and explains the error', async () => {
    const repository = createInMemoryAlertRulesRepository();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AlertRulesView locale="en" repository={repository} />,
      );
    });
    act(() => press(tree!, 'alert-rule-add'));
    act(() => change(tree!, 'alert-rule-form-name', 'Bad range'));
    act(() => change(tree!, 'alert-rule-form-lower', '200'));
    act(() => change(tree!, 'alert-rule-form-upper', '100'));
    await act(async () => {
      press(tree!, 'alert-rule-form-save');
      await Promise.resolve();
    });

    expect(textValues(tree!)).toContain(
      'The lower glucose limit must be below the upper limit.',
    );
    expect(repository.getSnapshot()).toEqual({status: 'ready', rules: []});
    act(() => tree!.unmount());
  });

  it('renders loading, error retry, and an RTL Hebrew empty state', async () => {
    let snapshot: AlertRulesSnapshot = {status: 'loading'};
    const listeners = new Set<() => void>();
    const refresh = jest.fn(async () => undefined);
    const repository: AlertRulesRepository = {
      subscribe: listener => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getSnapshot: () => snapshot,
      refresh,
      add: async () => {
        throw new Error('not ready');
      },
      update: async () => undefined,
      setEnabled: async () => undefined,
      delete: async () => undefined,
    };
    const publish = (next: AlertRulesSnapshot) => {
      snapshot = next;
      listeners.forEach(listener => listener());
    };
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AlertRulesView locale="he" repository={repository} />,
      );
    });
    expect(tree!.root.findByProps({testID: 'alert-rules-loading'})).toBeTruthy();

    act(() => publish({status: 'error'}));
    expect(textValues(tree!)).toContain('לא הצלחנו לטעון את כללי ההתראות.');
    await act(async () => {
      press(tree!, 'alert-rules-retry');
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(2);

    act(() =>
      publish({
        status: 'ready',
        rules: [
          {
            id: 'rule-he',
            name: 'טווח לילה',
            enabled: true,
            lowerBoundMgDl: 70,
            upperBoundMgDl: 180,
            activeFromMinute: 0,
            activeToMinute: 1439,
            trend: 'single-down',
            triggeredAtMs: [],
          },
        ],
      }),
    );
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining(['טווח לילה', '< 70 או > 180 mg/dL', 'ירידה · 0 הפעלות שנשמרו']),
    );
    expect(textValues(tree!).join(' ')).not.toContain('single-down');
    expect(
      tree!.root.findByProps({testID: 'alert-rules-view'}).props.style,
    ).toEqual(expect.arrayContaining([expect.objectContaining({direction: 'rtl'})]));
    act(() => tree!.unmount());
  });
});
