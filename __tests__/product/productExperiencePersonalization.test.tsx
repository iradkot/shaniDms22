import React from 'react';
import {withTheme} from '../mocks/withTheme';
import renderer, {act} from 'react-test-renderer';
import {Pressable, Text} from 'react-native';
import {ProductExperience} from '../../src/product/app';
import {DayGraphModuleView} from '../../src/product/dayGraph';
import {
  CORE_DESTINATION_IDS,
  createStoredDestinationTarget,
} from '../../src/product/destinations';
import {
  PersonalizationQuestionnaireView,
  beginPersonalizationQuestionnaire,
  createDefaultProductPersonalization,
  replaceFavoriteDestinations,
  replaceHiddenModules,
  resolveProductPersonalizationChange,
  skipPersonalizationQuestionnaire,
  selectLayoutProfile,
  recordRecentModule,
  updateDayGraphPreferences,
} from '../../src/product/personalization';
import type {
  ProductPersonalizationChange,
  StoredProductPersonalization,
} from '../../src/product/personalization';

describe('Product Experience personalization behavior', () => {
  it('connects chart preferences to an atomic save on the active layout', async () => {
    const value = {schemaVersion: 1, mode: 'mixed', windowHours: 6} as const;
    const personalization = skipPersonalizationQuestionnaire(
      updateDayGraphPreferences(
        createDefaultProductPersonalization(),
        'tablet',
        value,
      ),
    );
    const changes: ProductPersonalizationChange[] = [];
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        withTheme(
          <ProductExperience
            locale="en"
            runtime={{platform: 'ios'}}
            personalizationLayout="tablet"
            personalization={personalization}
            shellPreferences={{
              schemaVersion: 1,
              shortcuts: [],
              startDestination: createStoredDestinationTarget(
                CORE_DESTINATION_IDS.dayGraph,
              ),
            }}
            dayGraphRuntime={{
              dataSource: {
                loadDayGraph: async () => ({
                  freshness: {kind: 'fresh', fetchedAtMs: 1},
                  glucoseSamples: [],
                  timelineItems: [],
                }),
              },
            }}
            onPersonalizationChange={async change => {
              changes.push(change);
            }}
          />,
        ),
      );
    });
    const preferences =
      tree!.root.findByType(DayGraphModuleView).props.chartPreferences;
    expect(preferences.layout).toBe('tablet');
    expect(preferences.hydrated).toBe(true);
    expect(preferences.value).toEqual(value);
    const nextValue = {...value, windowHours: 12} as const;
    await preferences.onSave(nextValue);
    const latest = recordRecentModule(
      personalization,
      createStoredDestinationTarget(CORE_DESTINATION_IDS.trends),
      123,
    );
    const change = changes[changes.length - 1];
    expect(typeof change).toBe('function');
    if (!change) {
      throw new Error('Expected chart preference change');
    }
    const result = resolveProductPersonalizationChange(latest, change);
    expect(selectLayoutProfile(result, 'tablet').dayGraph).toEqual(nextValue);
    expect(selectLayoutProfile(result, 'phone').dayGraph).toBeUndefined();
    expect(result.device).toEqual(latest.device);
    act(() => tree!.unmount());
  });

  it('marks chart defaults unhydrated until the account personalization arrives', async () => {
    const content = (personalization?: StoredProductPersonalization) =>
      withTheme(
        <ProductExperience
          locale="en"
          runtime={{platform: 'ios'}}
          personalizationLayout="phone"
          {...(personalization === undefined ? {} : {personalization})}
          shellPreferences={{
            schemaVersion: 1,
            shortcuts: [],
            startDestination: createStoredDestinationTarget(
              CORE_DESTINATION_IDS.dayGraph,
            ),
          }}
          dayGraphRuntime={{
            dataSource: {
              loadDayGraph: async () => ({
                freshness: {kind: 'fresh', fetchedAtMs: 1},
                glucoseSamples: [],
                timelineItems: [],
              }),
            },
          }}
          onPersonalizationChange={async () => undefined}
        />,
      );
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(content());
    });
    expect(
      tree!.root.findByType(DayGraphModuleView).props.chartPreferences.hydrated,
    ).toBe(false);
    const saved = {schemaVersion: 1, mode: 'mixed', windowHours: 12} as const;
    await act(async () =>
      tree!.update(
        content(
          skipPersonalizationQuestionnaire(
            updateDayGraphPreferences(
              createDefaultProductPersonalization(),
              'phone',
              saved,
            ),
          ),
        ),
      ),
    );
    expect(
      tree!.root.findByType(DayGraphModuleView).props.chartPreferences,
    ).toMatchObject({hydrated: true, value: saved});
    act(() => tree!.unmount());
  });

  it('preserves chart preferences when the presentation questionnaire is saved', async () => {
    const dayGraph = {schemaVersion: 1, mode: 'mixed', windowHours: 6} as const;
    const value = skipPersonalizationQuestionnaire(
      updateDayGraphPreferences(
        createDefaultProductPersonalization(),
        'phone',
        dayGraph,
      ),
    );
    const saved: StoredProductPersonalization[] = [];
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <PersonalizationQuestionnaireView
            initialStage="presentation"
            layout="phone"
            locale="he"
            mode="customize"
            value={value}
            onSave={async next => {
              saved.push(next);
            }}
          />,
        ),
      );
    });
    act(() => {
      tree!.root
        .findByProps({testID: 'personalization-current-snapshot'})
        .props.onPress();
    });
    await act(async () => {
      await tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress();
    });
    expect(selectLayoutProfile(saved[0]!, 'phone').dayGraph).toEqual(dayGraph);
    act(() => tree!.unmount());
  });

  const target = (id: string) => createStoredDestinationTarget(id);
  const findPressableByTestId = (
    tree: renderer.ReactTestRenderer,
    testID: string,
  ) =>
    tree.root.findAllByProps({testID}).find(node => node.type === Pressable)!;

  it('records Shell shortcut navigation as a device Recent', () => {
    const personalization = skipPersonalizationQuestionnaire(
      createDefaultProductPersonalization(),
    );
    const changes: ProductPersonalizationChange[] = [];
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <ProductExperience
            locale="en"
            onPersonalizationChange={async change => {
              changes.push(change);
            }}
            personalization={personalization}
            personalizationLayout="phone"
            runtime={{platform: 'ios'}}
          />,
        ),
      );
    });

    act(() => {
      tree!.root
        .findByProps({testID: 'shell-shortcut-core.ai-analyst'})
        .props.onPress();
    });

    expect(changes).toHaveLength(1);
    const change = changes[0];
    if (change === undefined) {
      throw new Error('Expected a personalization change.');
    }
    const updated = resolveProductPersonalizationChange(
      personalization,
      change,
    );
    expect(updated.device.recentModules[0]?.target.destinationId).toBe(
      CORE_DESTINATION_IDS.aiAnalyst,
    );

    act(() => tree!.unmount());
  });

  it('lets a skipped user customize without choosing a relationship', async () => {
    const personalization = skipPersonalizationQuestionnaire(
      createDefaultProductPersonalization(),
    );
    const saved: StoredProductPersonalization[] = [];
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <PersonalizationQuestionnaireView
            layout="phone"
            locale="en"
            mode="customize"
            onSave={async next => {
              saved.push(next);
            }}
            value={personalization}
          />,
        ),
      );
    });

    act(() => {
      tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress();
    });
    act(() => {
      tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress();
    });
    await act(async () => {
      await tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress();
    });

    expect(saved).toHaveLength(1);
    expect(saved[0]?.workspace).toEqual({
      schemaVersion: 1,
      questionnaire: {schemaVersion: 1, status: 'skipped'},
    });

    act(() => tree!.unmount());
  });

  it('resumes an explicitly persisted questionnaire stage', () => {
    const personalization = beginPersonalizationQuestionnaire(
      createDefaultProductPersonalization(),
      'presentation',
    );
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <PersonalizationQuestionnaireView
            layout="phone"
            locale="en"
            mode="onboarding"
            onSave={async () => undefined}
            value={personalization}
          />,
        ),
      );
    });

    const labels = tree!.root
      .findByProps({testID: 'personalization-primary-action'})
      .findAllByType(Text)
      .map(node => node.props.children);
    expect(labels).toContain('Save');
    act(() => tree!.unmount());
  });

  it('rebuilds a clean draft when the responsive Layout changes', async () => {
    const personalization = skipPersonalizationQuestionnaire(
      createDefaultProductPersonalization(),
    );
    const saved: StoredProductPersonalization[] = [];
    const onSave = async (next: StoredProductPersonalization) => {
      saved.push(next);
    };
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <PersonalizationQuestionnaireView
            layout="phone"
            locale="en"
            mode="customize"
            onSave={onSave}
            value={personalization}
          />,
        ),
      );
    });
    act(() => {
      tree!.update(
        withTheme(
          <PersonalizationQuestionnaireView
            layout="tablet"
            locale="en"
            mode="customize"
            onSave={onSave}
            value={personalization}
          />,
        ),
      );
    });
    act(() => {
      tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress();
    });
    act(() => {
      tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress();
    });
    act(() => {
      tree!.root
        .findByProps({testID: 'personalization-current-snapshot'})
        .props.onPress();
    });
    await act(async () => {
      await tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress();
    });

    const result = saved[0];
    if (result === undefined) {
      throw new Error('Expected responsive personalization to save.');
    }
    expect(selectLayoutProfile(result, 'phone').showCurrentSnapshot).toBe(
      false,
    );
    expect(selectLayoutProfile(result, 'tablet').showCurrentSnapshot).toBe(
      true,
    );
    act(() => tree!.unmount());
  });

  it('uses radio semantics for single choices and checkboxes for independent choices', () => {
    const personalization = createDefaultProductPersonalization();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <PersonalizationQuestionnaireView
            layout="phone"
            locale="en"
            mode="onboarding"
            onSave={async () => undefined}
            value={personalization}
          />,
        ),
      );
    });

    const relationship = findPressableByTestId(
      tree!,
      'personalization-relationship-family-member',
    );
    expect(relationship.props.accessibilityRole).toBe('radio');
    act(() => relationship.props.onPress());
    act(() => {
      tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress();
    });
    expect(
      findPressableByTestId(
        tree!,
        `personalization-favorite-${CORE_DESTINATION_IDS.meals}`,
      ).props.accessibilityRole,
    ).toBe('checkbox');
    act(() => {
      tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress();
    });
    expect(
      findPressableByTestId(tree!, 'personalization-start-hub').props
        .accessibilityRole,
    ).toBe('radio');
    expect(
      findPressableByTestId(tree!, 'personalization-current-snapshot').props
        .accessibilityRole,
    ).toBe('checkbox');

    act(() => tree!.unmount());
  });

  it('customizes Module visibility without removing Favorites', async () => {
    const personalization = skipPersonalizationQuestionnaire(
      createDefaultProductPersonalization(),
    );
    const saved: StoredProductPersonalization[] = [];
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <PersonalizationQuestionnaireView
            initialStage="quick-access"
            layout="phone"
            locale="en"
            mode="customize"
            onSave={async next => {
              saved.push(next);
            }}
            value={personalization}
          />,
        ),
      );
    });

    const visibility = findPressableByTestId(
      tree!,
      `personalization-module-visible-${CORE_DESTINATION_IDS.meals}`,
    );
    expect(visibility.props.accessibilityState.checked).toBe(true);
    act(() => visibility.props.onPress());
    expect(
      findPressableByTestId(
        tree!,
        `personalization-favorite-${CORE_DESTINATION_IDS.meals}`,
      ).props.accessibilityState.checked,
    ).toBe(true);
    act(() => {
      tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress();
    });
    await act(async () => {
      await tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress();
    });

    expect(saved).toHaveLength(1);
    expect(saved[0]?.account.hiddenModules).toEqual([
      target(CORE_DESTINATION_IDS.meals),
    ]);
    expect(saved[0]?.account.favorites).toContainEqual(
      target(CORE_DESTINATION_IDS.meals),
    );
    act(() => tree!.unmount());
  });

  it('previews and saves the explicit Favorite order', async () => {
    const personalization = skipPersonalizationQuestionnaire(
      createDefaultProductPersonalization(),
    );
    const saved: StoredProductPersonalization[] = [];
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <PersonalizationQuestionnaireView
            initialStage="quick-access"
            layout="phone"
            locale="he"
            mode="customize"
            onSave={async next => {
              saved.push(next);
            }}
            value={personalization}
          />,
        ),
      );
    });

    const firstId = CORE_DESTINATION_IDS.dayGraph;
    const secondId = CORE_DESTINATION_IDS.dailyOverview;
    const firstRow = tree!.root.findByProps({
      testID: `personalization-favorite-order-${firstId}`,
    });
    expect(firstRow.props.accessibilityLabel).toContain('1');
    expect(
      findPressableByTestId(
        tree!,
        `personalization-favorite-order-${firstId}-earlier`,
      ).props.accessibilityState,
    ).toEqual({disabled: true});

    act(() =>
      findPressableByTestId(
        tree!,
        `personalization-favorite-order-${firstId}-later`,
      ).props.onPress(),
    );
    expect(
      tree!.root.findByProps({
        testID: `personalization-favorite-order-${secondId}`,
      }).props.accessibilityLabel,
    ).toContain('1');

    act(() =>
      tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress(),
    );
    await act(async () => {
      await tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress();
    });

    expect(
      saved[0]?.account.favorites.slice(0, 2).map(item => item.destinationId),
    ).toEqual([secondId, firstId]);
    act(() => tree!.unmount());
  });

  it('resets only the current Layout draft before saving', async () => {
    const personalization = skipPersonalizationQuestionnaire(
      createDefaultProductPersonalization(),
    );
    const saved: StoredProductPersonalization[] = [];
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <PersonalizationQuestionnaireView
            initialStage="presentation"
            layout="tablet"
            locale="en"
            mode="customize"
            onSave={async next => {
              saved.push(next);
            }}
            value={personalization}
          />,
        ),
      );
    });

    act(() => {
      tree!.root
        .findByProps({testID: 'personalization-current-snapshot'})
        .props.onPress();
    });
    const reset = findPressableByTestId(tree!, 'personalization-reset-layout');
    expect(reset.props.accessibilityRole).toBe('button');
    act(() => reset.props.onPress());
    await act(async () => {
      await tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress();
    });

    expect(selectLayoutProfile(saved[0]!, 'tablet').showCurrentSnapshot).toBe(
      false,
    );
    expect(selectLayoutProfile(saved[0]!, 'phone')).toEqual(
      selectLayoutProfile(personalization, 'phone'),
    );
    act(() => tree!.unmount());
  });

  it('keeps the advanced GRI metric optional per Layout Profile', async () => {
    const personalization = skipPersonalizationQuestionnaire(
      createDefaultProductPersonalization(),
    );
    const saved: StoredProductPersonalization[] = [];
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <PersonalizationQuestionnaireView
            initialStage="presentation"
            layout="phone"
            locale="en"
            mode="customize"
            onSave={async next => {
              saved.push(next);
            }}
            value={personalization}
          />,
        ),
      );
    });

    const gri = findPressableByTestId(tree!, 'personalization-show-gri');
    expect(gri.props.accessibilityState).toMatchObject({checked: false});
    act(() => gri.props.onPress());
    expect(
      findPressableByTestId(tree!, 'personalization-show-gri').props
        .accessibilityState,
    ).toMatchObject({checked: true});
    await act(async () => {
      await tree!.root
        .findByProps({testID: 'personalization-primary-action'})
        .props.onPress();
    });

    expect(selectLayoutProfile(saved[0]!, 'phone')).toMatchObject({
      showGri: true,
    });
    expect(selectLayoutProfile(saved[0]!, 'tablet')).toMatchObject({
      showGri: false,
    });
    act(() => tree!.unmount());
  });

  it('opens Module customization at quick access on a Hub tile long press', () => {
    const personalization = skipPersonalizationQuestionnaire(
      createDefaultProductPersonalization(),
    );
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <ProductExperience
            locale="en"
            onPersonalizationChange={async () => undefined}
            personalization={personalization}
            personalizationLayout="phone"
            runtime={{platform: 'ios'}}
          />,
        ),
      );
    });

    act(() =>
      tree!.root.findByProps({testID: 'hub-category-record'}).props.onPress(),
    );

    const tile = tree!.root
      .findAllByProps({
        testID: `hub-grid-record-tile-${CORE_DESTINATION_IDS.meals}`,
      })
      .find(
        node =>
          node.type === Pressable &&
          typeof node.props.onLongPress === 'function',
      );
    expect(tile?.props.accessibilityHint).toBe(
      'Long press to customize Modules.',
    );
    act(() => tile?.props.onLongPress());

    expect(
      tree!.root
        .findAllByType(Text)
        .some(
          node => node.props.children === 'What should be fastest to find?',
        ),
    ).toBe(true);
    expect(
      tree!.root.findByProps({testID: 'personalization-questionnaire'}),
    ).toBeDefined();

    act(() =>
      findPressableByTestId(tree!, 'shell-control-hub').props.onPress(),
    );
    expect(
      tree!.root.findAllByProps({testID: 'personalization-questionnaire'}),
    ).toHaveLength(0);
    expect(tree!.root.findByProps({testID: 'product-hub'})).toBeDefined();
    act(() => tree!.unmount());
  });

  it('wires Account-hidden Modules into the Hub while keeping explicit Favorites', () => {
    const skipped = skipPersonalizationQuestionnaire(
      createDefaultProductPersonalization(),
    );
    const hiddenWithoutFavorite = replaceHiddenModules(
      replaceFavoriteDestinations(skipped, []),
      [target(CORE_DESTINATION_IDS.meals)],
    );
    const hiddenWithFavorite = replaceFavoriteDestinations(
      hiddenWithoutFavorite,
      [target(CORE_DESTINATION_IDS.meals)],
    );
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        withTheme(
          <ProductExperience
            locale="en"
            personalization={hiddenWithoutFavorite}
            personalizationLayout="phone"
            runtime={{platform: 'ios'}}
          />,
        ),
      );
    });
    expect(
      tree!.root
        .findAllByProps({
          testID: `hub-grid-record-tile-${CORE_DESTINATION_IDS.meals}`,
        })
        .filter(node => node.type === Pressable),
    ).toHaveLength(0);

    act(() => {
      tree!.update(
        withTheme(
          <ProductExperience
            locale="en"
            personalization={hiddenWithFavorite}
            personalizationLayout="phone"
            runtime={{platform: 'ios'}}
          />,
        ),
      );
    });
    expect(
      tree!.root
        .findAllByProps({
          testID: `hub-grid-favorites-tile-${CORE_DESTINATION_IDS.meals}`,
        })
        .filter(node => node.type === Pressable),
    ).toHaveLength(1);
    act(() => tree!.unmount());
  });
});
