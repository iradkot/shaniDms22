import React from 'react';
import {Pressable, Text, TextInput} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import type {
  AlertRuleInput,
  AlertRulesRepository,
  AlertRulesSnapshot,
} from 'app/modules/alerts';
import {createInMemoryAlertRulesRepository} from 'app/modules/alerts';
import {AlertRulesView} from 'app/product/alerts/AlertRulesView';

const textValues = (tree: renderer.ReactTestRenderer): string[] =>
  tree.root
    .findAllByType(Text)
    .map(node =>
      Array.isArray(node.props.children)
        ? node.props.children.join('')
        : String(node.props.children ?? ''),
    );

const press = (tree: renderer.ReactTestRenderer, testID: string) =>
  tree.root
    .findAllByProps({testID})
    .find(node => node.type === Pressable)!
    .props.onPress();

const change = (
  tree: renderer.ReactTestRenderer,
  testID: string,
  value: string,
) =>
  tree.root
    .findAllByProps({testID})
    .find(node => node.type === TextInput)!
    .props.onChangeText(value);

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
    expect(
      tree!.root.findAllByProps({testID: 'alert-delivery-settings'}),
    ).toHaveLength(0);

    act(() => press(tree!, 'alert-rule-add'));
    act(() => press(tree!, 'alert-rule-condition-outside-range'));
    act(() => press(tree!, 'alert-rule-schedule-custom'));
    act(() => change(tree!, 'alert-rule-form-name', 'Night range'));
    act(() => change(tree!, 'alert-rule-form-lower', '70'));
    act(() => change(tree!, 'alert-rule-form-upper', '180'));
    act(() => change(tree!, 'alert-rule-form-from', '22:00'));
    act(() => change(tree!, 'alert-rule-form-to', '06:00'));
    await act(async () => {
      press(tree!, 'alert-rule-form-save');
      await Promise.resolve();
    });
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'Night range',
        'Every day · 22:00–06:00',
        'Glucose below 70 or above 180 mg/dL',
      ]),
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
    expect(textValues(tree!)).toContain('Delete this alert?');
    await act(async () => {
      press(tree!, 'alert-rule-confirm-delete-rule-1');
      await Promise.resolve();
    });
    expect(textValues(tree!)).toContain(
      'No alerts yet. Start with the night example or describe one to AI.',
    );
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
    act(() => press(tree!, 'alert-rule-condition-outside-range'));
    act(() => change(tree!, 'alert-rule-form-name', 'Bad range'));
    act(() => change(tree!, 'alert-rule-form-lower', '200'));
    act(() => change(tree!, 'alert-rule-form-upper', '100'));
    await act(async () => {
      press(tree!, 'alert-rule-form-save');
      await Promise.resolve();
    });

    expect(textValues(tree!)).toContain(
      'The lower value must be below the upper value.',
    );
    expect(repository.getSnapshot()).toEqual({status: 'ready', rules: []});
    act(() => tree!.unmount());
  });

  it('rejects a one-sided threshold reserved for storage compatibility', async () => {
    const repository = createInMemoryAlertRulesRepository();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AlertRulesView locale="en" repository={repository} />,
      );
    });
    act(() => press(tree!, 'alert-rule-add'));
    act(() => change(tree!, 'alert-rule-form-lower', '1'));
    act(() => press(tree!, 'alert-rule-form-save'));

    expect(textValues(tree!)).toContain(
      'A below or above threshold must be between 2 and 999 mg/dL.',
    );
    expect(repository.getSnapshot()).toEqual({status: 'ready', rules: []});
    act(() => tree!.unmount());
  });

  it('creates the requested below-65 overnight rule from the clear Hebrew preset', async () => {
    const repository = createInMemoryAlertRulesRepository([], {
      createId: () => 'night-low',
    });
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AlertRulesView locale="he" repository={repository} />,
      );
    });

    act(() => press(tree!, 'alert-rule-preset-low-night'));
    expect(textValues(tree!)).toEqual(
      expect.arrayContaining([
        'התראה כשהסוכר נמוך מ־65 mg/dL.',
        'פעילה בכל לילה, מ־22:00 עד 07:00 (הטווח חוצה חצות).',
        'כיוון תנועת הסוכר לא משנה.',
      ]),
    );
    await act(async () => {
      press(tree!, 'alert-rule-form-save');
      await Promise.resolve();
    });

    expect(repository.getSnapshot()).toEqual({
      status: 'ready',
      rules: [
        expect.objectContaining({
          id: 'night-low',
          lowerBoundMgDl: 65,
          upperBoundMgDl: 1000,
          activeFromMinute: 22 * 60,
          activeToMinute: 7 * 60,
          trend: 'any',
        }),
      ],
    });
    expect(textValues(tree!)).toContain('סוכר נמוך מ־65 mg/dL');
    expect(textValues(tree!).join(' ')).not.toContain('1000 mg/dL');
    act(() => tree!.unmount());
  });

  it('turns an AI result into an editable draft and waits for explicit save', async () => {
    const repository = createInMemoryAlertRulesRepository([], {
      createId: () => 'ai-rule',
    });
    const draft: AlertRuleInput = {
      name: 'סוכר נמוך בלילה',
      enabled: true,
      lowerBoundMgDl: 65,
      upperBoundMgDl: 1000,
      activeFromMinute: 22 * 60,
      activeToMinute: 7 * 60,
      trend: 'any',
    };
    const interpret = jest.fn(async () => draft);
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AlertRulesView
          interpreter={{availability: 'ready', interpret}}
          locale="he"
          repository={repository}
        />,
      );
    });

    act(() => press(tree!, 'alert-rule-add-ai'));
    act(() =>
      change(
        tree!,
        'alert-rule-ai-input',
        'תתריע לי אם אני יורד מתחת ל־65 במהלך הלילה',
      ),
    );
    await act(async () => {
      press(tree!, 'alert-rule-ai-create-draft');
      await Promise.resolve();
    });

    expect(interpret).toHaveBeenCalledWith(
      'תתריע לי אם אני יורד מתחת ל־65 במהלך הלילה',
      'he',
    );
    expect(repository.getSnapshot()).toEqual({status: 'ready', rules: []});
    expect(textValues(tree!)).toContain('התראה כשהסוכר נמוך מ־65 mg/dL.');

    act(() => change(tree!, 'alert-rule-form-name', 'לילה מתחת ל־65'));
    await act(async () => {
      press(tree!, 'alert-rule-form-save');
      await Promise.resolve();
    });
    expect(repository.getSnapshot()).toEqual({
      status: 'ready',
      rules: [expect.objectContaining({id: 'ai-rule', name: 'לילה מתחת ל־65'})],
    });
    act(() => tree!.unmount());
  });

  it('cancels an obsolete AI request when the host interpreter changes', async () => {
    const repository = createInMemoryAlertRulesRepository();
    const draft: AlertRuleInput = {
      name: 'Low at night',
      enabled: true,
      lowerBoundMgDl: 65,
      upperBoundMgDl: 1000,
      activeFromMinute: 22 * 60,
      activeToMinute: 7 * 60,
      trend: 'any',
    };
    let resolveOld!: (value: AlertRuleInput) => void;
    const firstInterpreter = {
      availability: 'ready' as const,
      interpret: jest.fn(
        () => new Promise<AlertRuleInput>(resolve => (resolveOld = resolve)),
      ),
    };
    const nextInterpreter = {
      availability: 'ready' as const,
      interpret: jest.fn(async () => draft),
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AlertRulesView
          interpreter={firstInterpreter}
          locale="en"
          repository={repository}
        />,
      );
    });

    act(() => press(tree!, 'alert-rule-add-ai'));
    act(() => press(tree!, 'alert-rule-ai-create-draft'));
    expect(textValues(tree!)).toContain('Understanding your request…');

    await act(async () => {
      tree!.update(
        <AlertRulesView
          interpreter={nextInterpreter}
          locale="en"
          repository={repository}
        />,
      );
      await Promise.resolve();
    });
    expect(textValues(tree!)).toContain('Create draft');

    await act(async () => {
      resolveOld(draft);
      await Promise.resolve();
    });
    expect(
      tree!.root.findByProps({testID: 'alert-rule-ai-composer'}),
    ).toBeTruthy();
    expect(repository.getSnapshot()).toEqual({status: 'ready', rules: []});
    act(() => tree!.unmount());
  });

  it('lets the user cancel an AI request while it is still running', async () => {
    const repository = createInMemoryAlertRulesRepository();
    let resolveDraft!: (value: AlertRuleInput) => void;
    const draft: AlertRuleInput = {
      name: 'Low at night',
      enabled: true,
      lowerBoundMgDl: 65,
      upperBoundMgDl: 1000,
      activeFromMinute: 22 * 60,
      activeToMinute: 7 * 60,
      trend: 'any',
    };
    const interpreter = {
      availability: 'ready' as const,
      interpret: jest.fn(
        () => new Promise<AlertRuleInput>(resolve => (resolveDraft = resolve)),
      ),
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AlertRulesView
          interpreter={interpreter}
          locale="en"
          repository={repository}
        />,
      );
    });

    act(() => press(tree!, 'alert-rule-add-ai'));
    act(() => press(tree!, 'alert-rule-ai-create-draft'));
    expect(textValues(tree!)).toContain('Understanding your request…');
    act(() => press(tree!, 'alert-rule-ai-cancel'));
    expect(
      tree!.root.findAllByProps({testID: 'alert-rule-ai-composer'}),
    ).toHaveLength(0);

    await act(async () => {
      resolveDraft(draft);
      await Promise.resolve();
    });
    expect(repository.getSnapshot()).toEqual({status: 'ready', rules: []});
    act(() => tree!.unmount());
  });

  it('saves the device-local alert delivery choice through its host seam', async () => {
    const repository = createInMemoryAlertRulesRepository();
    const setDeliveryMode = jest.fn(async () => undefined);
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AlertRulesView
          deliveryMode="sound-and-vibrate"
          deliveryModeReady
          locale="en"
          repository={repository}
          setDeliveryMode={setDeliveryMode}
        />,
      );
    });

    expect(
      tree!.root.findByProps({testID: 'alert-delivery-settings'}),
    ).toBeTruthy();

    await act(async () => {
      press(tree!, 'alert-delivery-mode-silent');
      await Promise.resolve();
    });
    expect(setDeliveryMode).toHaveBeenCalledWith('silent');
    act(() => tree!.unmount());
  });

  it('keeps alert delivery disabled after a preference load error and offers retry', async () => {
    const repository = createInMemoryAlertRulesRepository();
    const retryDeliveryMode = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AlertRulesView
          deliveryModeLoadError
          deliveryModeReady={false}
          locale="en"
          repository={repository}
          retryDeliveryMode={retryDeliveryMode}
          setDeliveryMode={jest.fn(async () => undefined)}
        />,
      );
    });

    expect(textValues(tree!)).toContain(
      'The saved sound preference could not be loaded.',
    );
    expect(
      tree!.root.findAllByProps({testID: 'alert-delivery-mode-silent'}),
    ).toHaveLength(0);
    act(() => press(tree!, 'alert-delivery-retry'));
    expect(retryDeliveryMode).toHaveBeenCalledTimes(1);
    act(() => tree!.unmount());
  });

  it('does not carry an unfinished sound save into another workspace', async () => {
    const repositoryA = createInMemoryAlertRulesRepository();
    const repositoryB = createInMemoryAlertRulesRepository();
    let rejectSave!: (reason: Error) => void;
    const setDeliveryMode = jest.fn(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        }),
    );
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <AlertRulesView
          deliveryMode="sound-and-vibrate"
          deliveryModeReady
          locale="en"
          repository={repositoryA}
          setDeliveryMode={setDeliveryMode}
        />,
      );
    });

    act(() => press(tree!, 'alert-delivery-mode-silent'));
    expect(
      tree!.root.findByProps({testID: 'alert-delivery-mode-silent'}).props
        .disabled,
    ).toBe(true);

    await act(async () => {
      tree!.update(
        <AlertRulesView
          deliveryMode="sound-and-vibrate"
          deliveryModeReady
          locale="en"
          repository={repositoryB}
          setDeliveryMode={setDeliveryMode}
        />,
      );
      await Promise.resolve();
    });
    expect(
      tree!.root.findByProps({testID: 'alert-delivery-mode-silent'}).props
        .disabled,
    ).toBe(false);

    await act(async () => {
      rejectSave(new Error('old workspace save failed'));
      await Promise.resolve();
    });
    expect(textValues(tree!)).not.toContain(
      'The sound preference could not be saved.',
    );
    act(() => tree!.unmount());
  });

  it('renders loading, error retry, and natural RTL Hebrew rule text', async () => {
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
    expect(
      tree!.root.findByProps({testID: 'alert-rules-loading'}),
    ).toBeTruthy();

    act(() => publish({status: 'error'}));
    expect(textValues(tree!)).toContain('לא הצלחנו לטעון את ההתראות.');
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
      expect.arrayContaining([
        'טווח לילה',
        'סוכר נמוך מ־70 או גבוה מ־180 mg/dL',
        'ירידה · ניתן להתריע שוב כעבור 20 דקות',
      ]),
    );
    expect(textValues(tree!).join(' ')).not.toContain('single-down');
    expect(
      tree!.root.findByProps({testID: 'alert-rules-view'}).props.style,
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({direction: 'rtl'})]),
    );
    act(() => tree!.unmount());
  });
});
