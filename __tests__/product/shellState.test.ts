import {
  CORE_DESTINATION_IDS,
  coreDestinationRegistry,
  createStoredDestinationTarget,
} from 'app/product/destinations';
import {
  ProductShellValidationError,
  createInitialProductShellState,
  getProductShellLayout,
  parseProductShellPreferences,
  productShellReducer,
  resolveCurrentProductShellRoute,
  resolveProductShellConfiguration,
  safeParseProductShellPreferences,
  selectCanGoBack,
  selectCanGoForward,
  selectCurrentShellRoute,
  selectShellNavigationModel,
} from 'app/product/shell';

const iosRuntime = {platform: 'ios' as const};

const hubPreferences = () => ({
  schemaVersion: 1 as const,
  shortcuts: [],
});

describe('Product Shell persistence boundary', () => {
  it('parses a Hub start with no shortcuts', () => {
    expect(parseProductShellPreferences(hubPreferences())).toEqual({
      schemaVersion: 1,
      shortcuts: [],
    });
  });

  it('rejects medical or transient context at every persistence level', () => {
    const result = safeParseProductShellPreferences({
      schemaVersion: 1,
      workspaceId: 'private-workspace',
      shortcuts: [
        {
          schemaVersion: 1,
          destinationId: CORE_DESTINATION_IDS.dayGraph,
          glucose: 61,
          dateRange: {from: 1, to: 2},
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map(issue => issue.path)).toEqual(
        expect.arrayContaining([
          'shell.workspaceId',
          'shell.shortcuts[0].glucose',
          'shell.shortcuts[0].dateRange',
        ]),
      );
    }
  });

  it('rejects more than two or duplicate phone shortcuts', () => {
    const day = createStoredDestinationTarget(CORE_DESTINATION_IDS.dayGraph);
    const trends = createStoredDestinationTarget(CORE_DESTINATION_IDS.trends);
    const meals = createStoredDestinationTarget(CORE_DESTINATION_IDS.meals);

    expect(() =>
      parseProductShellPreferences({
        schemaVersion: 1,
        shortcuts: [day, trends, meals],
      }),
    ).toThrow(ProductShellValidationError);
    expect(() =>
      parseProductShellPreferences({
        schemaVersion: 1,
        shortcuts: [day, day],
      }),
    ).toThrow(ProductShellValidationError);
  });
});

describe('Product Shell configuration and stack', () => {
  it('starts at a valid configured destination above the single Hub root', () => {
    const configuration = resolveProductShellConfiguration(
      coreDestinationRegistry,
      {
        schemaVersion: 1,
        startDestination: createStoredDestinationTarget(
          CORE_DESTINATION_IDS.dayGraph,
        ),
        shortcuts: [],
      },
      iosRuntime,
    );
    const state = createInitialProductShellState(configuration);

    expect(state.stack).toHaveLength(2);
    expect(state.stack[0]).toEqual({kind: 'hub'});
    expect(selectCurrentShellRoute(state)).toMatchObject({
      kind: 'destination',
      target: {destinationId: CORE_DESTINATION_IDS.dayGraph},
    });
    expect(selectCanGoBack(state)).toBe(true);
  });

  it('falls back to Hub when the configured start violates start policy', () => {
    const configuration = resolveProductShellConfiguration(
      coreDestinationRegistry,
      {
        schemaVersion: 1,
        startDestination: createStoredDestinationTarget(
          CORE_DESTINATION_IDS.settings,
        ),
        shortcuts: [],
      },
      iosRuntime,
    );
    const state = createInitialProductShellState(configuration);

    expect(configuration.start).toMatchObject({
      kind: 'destination',
      resolved: {
        status: 'unavailable',
        reason: {code: 'target-not-allowed'},
      },
    });
    expect(state.stack).toEqual([{kind: 'hub'}]);
  });

  it('supports push, Back, Hub, and Forward without persisting history', () => {
    const configuration = resolveProductShellConfiguration(
      coreDestinationRegistry,
      hubPreferences(),
      iosRuntime,
    );
    const initial = createInitialProductShellState(configuration);
    const day = resolveProductShellConfiguration(
      coreDestinationRegistry,
      {
        schemaVersion: 1,
        shortcuts: [
          createStoredDestinationTarget(CORE_DESTINATION_IDS.dayGraph),
        ],
      },
      iosRuntime,
    ).shortcuts[0];
    expect(day?.status).toBe('available');
    if (!day || day.status !== 'available') {
      throw new Error('Day Graph must be available in the core registry');
    }

    const opened = productShellReducer(initial, {
      type: 'open-destination',
      request: {destination: day},
    });
    const duplicate = productShellReducer(opened, {
      type: 'open-destination',
      request: {destination: day},
    });
    const backed = productShellReducer(opened, {type: 'back'});
    const returnedHome = productShellReducer(opened, {type: 'hub'});
    const forwarded = productShellReducer(backed, {type: 'forward'});

    expect(opened.stack).toHaveLength(2);
    expect(duplicate).toBe(opened);
    expect(backed.stack).toEqual([{kind: 'hub'}]);
    expect(selectCanGoForward(backed)).toBe(true);
    expect(forwarded.stack).toEqual(opened.stack);
    expect(selectCanGoForward(forwarded)).toBe(false);
    expect(returnedHome.stack).toEqual([{kind: 'hub'}]);
    expect(selectCanGoForward(returnedHome)).toBe(true);
    expect(productShellReducer(initial, {type: 'back'})).toBe(initial);
    expect(productShellReducer(initial, {type: 'forward'})).toBe(initial);
  });

  it('keeps typed transient context in the stack without persisting it as a target', () => {
    const configuration = resolveProductShellConfiguration(
      coreDestinationRegistry,
      hubPreferences(),
      iosRuntime,
    );
    const meals = resolveProductShellConfiguration(
      coreDestinationRegistry,
      {
        schemaVersion: 1,
        shortcuts: [createStoredDestinationTarget(CORE_DESTINATION_IDS.meals)],
      },
      iosRuntime,
    ).shortcuts[0];
    if (!meals || meals.status !== 'available') {
      throw new Error('Meals must be available in the core registry.');
    }

    const first = productShellReducer(
      createInitialProductShellState(configuration),
      {
        type: 'open-destination',
        request: {
          destination: meals,
          workspaceId: 'workspace-a',
          focus: {
            kind: 'journal-entry',
            entryKind: 'meal',
            entryId: 'meal-1',
          },
        },
      },
    );
    const second = productShellReducer(first, {
      type: 'open-destination',
      request: {
        destination: meals,
        workspaceId: 'workspace-a',
        focus: {
          kind: 'journal-entry',
          entryKind: 'meal',
          entryId: 'meal-2',
        },
      },
    });
    const current = resolveCurrentProductShellRoute(
      second,
      coreDestinationRegistry,
      iosRuntime,
    );

    expect(second.stack).toHaveLength(3);
    expect(second.stack[2]).toEqual({
      kind: 'destination',
      target: createStoredDestinationTarget(CORE_DESTINATION_IDS.meals),
      workspaceId: 'workspace-a',
      focus: {
        kind: 'journal-entry',
        entryKind: 'meal',
        entryId: 'meal-2',
      },
    });
    expect(current).toMatchObject({
      kind: 'destination',
      request: {
        workspaceId: 'workspace-a',
        focus: {
          kind: 'journal-entry',
          entryKind: 'meal',
          entryId: 'meal-2',
        },
      },
    });
  });

  it('re-resolves a current route when runtime availability changes', () => {
    const configuration = resolveProductShellConfiguration(
      coreDestinationRegistry,
      {
        schemaVersion: 1,
        startDestination: createStoredDestinationTarget(
          CORE_DESTINATION_IDS.dayGraph,
        ),
        shortcuts: [],
      },
      iosRuntime,
    );
    const state = createInitialProductShellState(configuration);
    const current = resolveCurrentProductShellRoute(
      state,
      coreDestinationRegistry,
      {
        platform: 'ios',
        disabledDestinations: new Map([
          [CORE_DESTINATION_IDS.dayGraph, 'Temporarily paused'],
        ]),
      },
    );

    expect(current).toMatchObject({
      kind: 'destination',
      resolved: {
        status: 'unavailable',
        reason: {code: 'disabled', message: 'Temporarily paused'},
      },
    });
  });
});

describe('Product Shell responsive controls', () => {
  it('uses phone controls below the breakpoint and a rail on wider layouts', () => {
    expect(getProductShellLayout(759)).toBe('phone');
    expect(getProductShellLayout(760)).toBe('wide');
    expect(getProductShellLayout(Number.NaN)).toBe('phone');
  });

  it('treats Chat and Updates as ordinary policy-checked shortcuts', () => {
    const configuration = resolveProductShellConfiguration(
      coreDestinationRegistry,
      {
        schemaVersion: 1,
        shortcuts: [
          createStoredDestinationTarget(CORE_DESTINATION_IDS.aiAnalyst),
          createStoredDestinationTarget(CORE_DESTINATION_IDS.updateCenter),
        ],
      },
      iosRuntime,
    );
    const state = createInitialProductShellState(configuration);
    const navigation = selectShellNavigationModel(state, configuration, 'en');

    expect(navigation.shortcuts).toHaveLength(2);
    expect(navigation.shortcuts.map(shortcut => shortcut.key)).toEqual([
      CORE_DESTINATION_IDS.aiAnalyst,
      CORE_DESTINATION_IDS.updateCenter,
    ]);
    expect(navigation.shortcuts.map(shortcut => shortcut.iconName)).toEqual([
      'auto-awesome',
      'notifications',
    ]);
    expect(
      navigation.shortcuts.every(
        shortcut =>
          shortcut.resolved.status === 'available' && !shortcut.active,
      ),
    ).toBe(true);
  });

  it('marks the shortcut for the current destination as active', () => {
    const configuration = resolveProductShellConfiguration(
      coreDestinationRegistry,
      {
        schemaVersion: 1,
        shortcuts: [
          createStoredDestinationTarget(CORE_DESTINATION_IDS.aiAnalyst),
        ],
      },
      iosRuntime,
    );
    const shortcut = configuration.shortcuts[0];
    if (!shortcut || shortcut.status !== 'available') {
      throw new Error('AI Analyst must be available.');
    }
    const state = productShellReducer(
      createInitialProductShellState(configuration),
      {type: 'open-destination', request: {destination: shortcut}},
    );

    expect(
      selectShellNavigationModel(state, configuration, 'en').shortcuts[0]
        ?.active,
    ).toBe(true);
  });

  it('retains an unavailable shortcut visibly and disabled in Hebrew RTL', () => {
    const configuration = resolveProductShellConfiguration(
      coreDestinationRegistry,
      {
        schemaVersion: 1,
        shortcuts: [createStoredDestinationTarget('removed.chat-shortcut')],
      },
      iosRuntime,
    );
    const state = createInitialProductShellState(configuration);
    const navigation = selectShellNavigationModel(state, configuration, 'he');

    expect(configuration.shortcuts).toHaveLength(1);
    expect(navigation.direction).toBe('rtl');
    expect(navigation.back).toEqual({label: 'חזרה', disabled: true});
    expect(navigation.hub).toEqual({label: 'מרכז', active: true});
    expect(navigation.forward).toEqual({label: 'קדימה', disabled: true});
    expect(navigation.shortcuts[0]).toMatchObject({
      key: 'removed.chat-shortcut',
      title: 'קיצור שמור',
      active: false,
      unavailableLabel: 'לא זמין',
      resolved: {status: 'unavailable'},
    });
  });
});
